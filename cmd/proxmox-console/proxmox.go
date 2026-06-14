package main

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net/http"
	"strings"

	goProxmox "github.com/luthermonson/go-proxmox"
)

type ProxmoxConfig struct {
	APIURL             string
	APITokenID         string
	APITokenSecret     string
	Username           string
	Password           string
	InsecureSkipVerify bool
}

func newGoProxmoxClient() (*goProxmox.Client, error) {
	if AppConfig.Proxmox.APIURL == "" {
		return nil, errors.New("missing TF_VAR_proxmox_api_url")
	}

	httpClient := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: AppConfig.Proxmox.InsecureSkipVerify},
		},
	}

	opts := []goProxmox.Option{
		goProxmox.WithHTTPClient(httpClient),
	}

	if AppConfig.Proxmox.APITokenID != "" && AppConfig.Proxmox.APITokenSecret != "" {
		opts = append(opts, goProxmox.WithAPIToken(AppConfig.Proxmox.APITokenID, AppConfig.Proxmox.APITokenSecret))
	} else if AppConfig.Proxmox.Username != "" && AppConfig.Proxmox.Password != "" {
		opts = append(opts, goProxmox.WithLogins(AppConfig.Proxmox.Username, AppConfig.Proxmox.Password))
	} else {
		return nil, errors.New("missing Proxmox authentication: set TF_VAR_proxmox_api_token_id/proxmox_api_token_secret or TF_VAR_proxmox_username/proxmox_password")
	}

	client := goProxmox.NewClient(AppConfig.Proxmox.APIURL, opts...)
	return client, nil
}

func getProxmoxVMStatus(ctx context.Context, nodeName string, vmid int) (string, error) {
	client, err := newGoProxmoxClient()
	if err != nil {
		return "", err
	}

	node, err := client.Node(ctx, nodeName)
	if err != nil {
		return "", fmt.Errorf("failed to get proxmox node: %w", err)
	}

	vm, err := node.VirtualMachine(ctx, vmid)
	if err != nil {
		return "", fmt.Errorf("failed to get proxmox vm: %w", err)
	}

	return string(vm.Status), nil
}

func getProxmoxVMIP(ctx context.Context, nodeName string, vmid int) (string, error) {
	client, err := newGoProxmoxClient()
	if err != nil {
		return "", err
	}

	node, err := client.Node(ctx, nodeName)
	if err != nil {
		return "", fmt.Errorf("failed to get proxmox node: %w", err)
	}

	vm, err := node.VirtualMachine(ctx, vmid)
	if err != nil {
		return "", fmt.Errorf("failed to get proxmox vm: %w", err)
	}

	ifaces, err := vm.AgentGetNetworkIFaces(ctx)
	if err != nil {
		if strings.Contains(err.Error(), "guest agent is not running") || strings.Contains(err.Error(), "vm is not running") {
			return "", nil
		}
		return "", fmt.Errorf("failed to get proxmox vm agent network interfaces: %w", err)
	}

	for _, iface := range ifaces {
		for _, addr := range iface.IPAddresses {
			if addr.IPAddressType != "ipv4" {
				continue
			}
			ip := addr.IPAddress
			if ip == "127.0.0.1" {
				continue
			}
			return ip, nil
		}
	}

	return "", nil
}

func deleteProxmoxVM(ctx context.Context, nodeName string, vmid int) error {
	client, err := newGoProxmoxClient()
	if err != nil {
		return err
	}

	node, err := client.Node(ctx, nodeName)
	if err != nil {
		return fmt.Errorf("failed to get proxmox node: %w", err)
	}

	vm, err := node.VirtualMachine(ctx, vmid)
	if err != nil {
		// VMが見つからなければ既に削除済みとして成功扱いにする
		return nil
	}

	if strings.EqualFold(string(vm.Status), "running") {
		task, err := vm.Stop(ctx)
		if err != nil {
			return fmt.Errorf("failed to stop proxmox vm: %w", err)
		}
		if err := task.WaitFor(ctx, 30); err != nil {
			return fmt.Errorf("failed to wait for proxmox vm stop: %w", err)
		}
	}

	task, err := vm.Delete(ctx)
	if err != nil {
		return fmt.Errorf("failed to delete proxmox vm: %w", err)
	}
	if err := task.WaitFor(ctx, 60); err != nil {
		return fmt.Errorf("failed to wait for proxmox vm delete: %w", err)
	}

	return nil
}

// startProxmoxVM は Proxmox 上の VM を起動します（非同期）
func startProxmoxVM(ctx context.Context, nodeName string, vmid int) error {
	go func() {
		client, err := newGoProxmoxClient()
		if err != nil {
			fmt.Printf("Failed to create proxmox client: %v\n", err)
			return
		}

		node, err := client.Node(context.Background(), nodeName)
		if err != nil {
			fmt.Printf("Failed to get proxmox node: %v\n", err)
			return
		}

		vm, err := node.VirtualMachine(context.Background(), vmid)
		if err != nil {
			fmt.Printf("Failed to get proxmox vm: %v\n", err)
			return
		}

		task, err := vm.Start(context.Background())
		if err != nil {
			fmt.Printf("Failed to start proxmox vm: %v\n", err)
			return
		}
		if err := task.WaitFor(context.Background(), 60); err != nil {
			fmt.Printf("Failed to wait for proxmox vm start: %v\n", err)
			return
		}
		fmt.Printf("Successfully started VM %d\n", vmid)
	}()
	return nil
}

// stopProxmoxVM は Proxmox 上の VM を停止します（非同期）
func stopProxmoxVM(ctx context.Context, nodeName string, vmid int) error {
	go func() {
		client, err := newGoProxmoxClient()
		if err != nil {
			fmt.Printf("Failed to create proxmox client: %v\n", err)
			return
		}

		node, err := client.Node(context.Background(), nodeName)
		if err != nil {
			fmt.Printf("Failed to get proxmox node: %v\n", err)
			return
		}

		vm, err := node.VirtualMachine(context.Background(), vmid)
		if err != nil {
			fmt.Printf("Failed to get proxmox vm: %v\n", err)
			return
		}

		task, err := vm.Stop(context.Background())
		if err != nil {
			fmt.Printf("Failed to stop proxmox vm: %v\n", err)
			return
		}
		if err := task.WaitFor(context.Background(), 60); err != nil {
			fmt.Printf("Failed to wait for proxmox vm stop: %v\n", err)
			return
		}
		fmt.Printf("Successfully stopped VM %d\n", vmid)
	}()
	return nil
}
