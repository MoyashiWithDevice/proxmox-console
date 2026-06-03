package main

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/Telmate/proxmox-api-go/proxmox"
	goProxmox "github.com/luthermonson/go-proxmox"
)

type ProxmoxConfig struct {
	APIURL            string
	APITokenID        string
	APITokenSecret    string
	Username          string
	Password          string
	InsecureSkipVerify bool
}

func newProxmoxClient(ctx context.Context) (*proxmox.Client, error) {
	if AppConfig.Proxmox.APIURL == "" {
		return nil, errors.New("missing TF_VAR_proxmox_api_url")
	}

	tlsConfig := &tls.Config{InsecureSkipVerify: AppConfig.Proxmox.InsecureSkipVerify}
	client, err := proxmox.NewClient(AppConfig.Proxmox.APIURL, nil, "", tlsConfig, "", 0, false)
	if err != nil {
		return nil, fmt.Errorf("failed to create proxmox client: %w", err)
	}

	if AppConfig.Proxmox.APITokenID != "" && AppConfig.Proxmox.APITokenSecret != "" {
		var tokenID proxmox.ApiTokenID
		if err := tokenID.Parse(AppConfig.Proxmox.APITokenID); err != nil {
			return nil, fmt.Errorf("invalid proxmox api token id: %w", err)
		}
		client.SetAPIToken(tokenID, proxmox.ApiTokenSecret(AppConfig.Proxmox.APITokenSecret))
	} else if AppConfig.Proxmox.Username != "" && AppConfig.Proxmox.Password != "" {
		if err := client.Login(ctx, AppConfig.Proxmox.Username, AppConfig.Proxmox.Password, ""); err != nil {
			return nil, fmt.Errorf("failed to login to proxmox: %w", err)
		}
	} else {
		return nil, errors.New("missing Proxmox authentication: set TF_VAR_proxmox_api_token_id/proxmox_api_token_secret or TF_VAR_proxmox_username/proxmox_password")
	}

	return client, nil
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
		return nil, errors.New("missing Proxmox authentication")
	}

	client := goProxmox.NewClient(AppConfig.Proxmox.APIURL, opts...)
	return client, nil
}

func getProxmoxVMStatus(ctx context.Context, nodeName string, vmid int) (string, error) {
	client, err := newProxmoxClient(ctx)
	if err != nil {
		return "", err
	}

	vmRef := proxmox.NewVmRef(proxmox.GuestID(uint32(vmid)))
	if nodeName != "" {
		vmRef.SetNode(nodeName)
	}

	info, err := client.GetVmInfo(ctx, vmRef)
	if err != nil {
		return "", fmt.Errorf("failed to get proxmox vm info: %w", err)
	}

	status, ok := info["status"].(string)
	if !ok || status == "" {
		return "", fmt.Errorf("failed to parse vm status from proxmox info")
	}

	return status, nil
}

func getProxmoxVMIP(ctx context.Context, nodeName string, vmid int) (string, error) {
	client, err := newProxmoxClient(ctx)
	if err != nil {
		return "", err
	}

	vmRef := proxmox.NewVmRef(proxmox.GuestID(uint32(vmid)))
	if nodeName != "" {
		vmRef.SetNode(nodeName)
	}

	interfaces, err := client.GetVmAgentNetworkInterfaces(ctx, vmRef)
	if err != nil {
		if strings.Contains(err.Error(), "guest agent is not running") || strings.Contains(err.Error(), "vm is not running") {
			return "", nil
		}
		return "", fmt.Errorf("failed to get proxmox vm agent network interfaces: %w", err)
	}

	for _, iface := range interfaces {
		for _, ip := range iface.IpAddresses {
			if ip == nil || ip.IsLoopback() {
				continue
			}
			if ip4 := ip.To4(); ip4 != nil {
				return ip4.String(), nil
			}
		}
	}

	return "", nil
}

func deleteProxmoxVM(ctx context.Context, nodeName string, vmid int) error {
	client, err := newProxmoxClient(ctx)
	if err != nil {
		return err
	}

	vmRef := proxmox.NewVmRef(proxmox.GuestID(uint32(vmid)))
	if nodeName != "" {
		vmRef.SetNode(nodeName)
	}

	status, err := getProxmoxVMStatus(ctx, nodeName, vmid)
	if err == nil && strings.EqualFold(status, "running") {
		if _, err := client.StopVm(ctx, vmRef); err != nil {
			return fmt.Errorf("failed to stop proxmox vm: %w", err)
		}
	}

	if _, err := client.DeleteVm(ctx, vmRef); err != nil {
		return fmt.Errorf("failed to delete proxmox vm: %w", err)
	}

	return nil
}

// startProxmoxVM は Proxmox 上の VM を起動します（非同期）
func startProxmoxVM(ctx context.Context, nodeName string, vmid int) error {
	// バックグラウンドで実行して、すぐに返す
	go func() {
		// コンテキストなしでタイムアウトなく実行
		client, err := newProxmoxClient(context.Background())
		if err != nil {
			fmt.Printf("Failed to create proxmox client: %v\n", err)
			return
		}

		vmRef := proxmox.NewVmRef(proxmox.GuestID(uint32(vmid)))
		if nodeName != "" {
			vmRef.SetNode(nodeName)
		}

		if _, err := client.StartVm(context.Background(), vmRef); err != nil {
			fmt.Printf("Failed to start proxmox vm: %v\n", err)
			return
		}
		fmt.Printf("Successfully started VM %d\n", vmid)
	}()
	return nil
}

// stopProxmoxVM は Proxmox 上の VM を停止します（非同期）
func stopProxmoxVM(ctx context.Context, nodeName string, vmid int) error {
	// バックグラウンドで実行して、すぐに返す
	go func() {
		// コンテキストなしでタイムアウトなく実行
		client, err := newProxmoxClient(context.Background())
		if err != nil {
			fmt.Printf("Failed to create proxmox client: %v\n", err)
			return
		}

		vmRef := proxmox.NewVmRef(proxmox.GuestID(uint32(vmid)))
		if nodeName != "" {
			vmRef.SetNode(nodeName)
		}

		if _, err := client.StopVm(context.Background(), vmRef); err != nil {
			fmt.Printf("Failed to stop proxmox vm: %v\n", err)
			return
		}
		fmt.Printf("Successfully stopped VM %d\n", vmid)
	}()
	return nil
}
