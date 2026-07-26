package main

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

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

// クライアントをシングルトンにする
var (
    proxmoxClient     *goProxmox.Client
    proxmoxClientOnce sync.Once
    proxmoxClientErr  error
)

func getProxmoxClient() (*goProxmox.Client, error) {
    proxmoxClientOnce.Do(func() {
        proxmoxClient, proxmoxClientErr = newGoProxmoxClient()
    })
    return proxmoxClient, proxmoxClientErr
}

func newGoProxmoxClient() (*goProxmox.Client, error) {
	if AppConfig.Proxmox.APIURL == "" {
		return nil, errors.New("missing TF_VAR_proxmox_endpoint")
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
		opts = append(opts, goProxmox.WithCredentials(&goProxmox.Credentials{
			Username: AppConfig.Proxmox.Username,
			Password: AppConfig.Proxmox.Password,
		}))
	} else {
		return nil, errors.New("missing Proxmox authentication: set TF_VAR_proxmox_api_token_id/proxmox_api_token_secret or TF_VAR_proxmox_username/proxmox_password")
	}

	client := goProxmox.NewClient(AppConfig.Proxmox.APIURL, opts...)
	return client, nil
}

func deleteProxmoxVM(ctx context.Context, nodeName string, vmid int) error {
	client, err := getProxmoxClient()
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
		client, err := getProxmoxClient()
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
		client, err := getProxmoxClient()
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

// uploadISOToProxmox は ISO ファイルを Proxmox ストレージにアップロードします
// returns volumeID (例: "local:iso/filename.iso")
func uploadISOToProxmox(ctx context.Context, filename string, file io.Reader, fileSize int64) (string, error) {
	client, err := getProxmoxClient()
	if err != nil {
		return "", fmt.Errorf("failed to get proxmox client: %w", err)
	}

	nodes, err := client.Nodes(ctx)
	if err != nil || len(nodes) == 0 {
		return "", fmt.Errorf("failed to get proxmox nodes: %w", err)
	}

	nodeName := nodes[0].Name
	node, err := client.Node(ctx, nodeName)
	if err != nil {
		return "", fmt.Errorf("failed to get proxmox node %s: %w", nodeName, err)
	}

	storage, err := node.StorageISO(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to find ISO storage: %w", err)
	}

	// Save uploaded file to temp file (Storage.Upload requires a file path)
	tmpDir, err := os.MkdirTemp("", "iso-upload-*")
	if err != nil {
		return "", fmt.Errorf("failed to create temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	tmpPath := filepath.Join(tmpDir, filename)
	f, err := os.Create(tmpPath)
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}
	if _, err := io.Copy(f, file); err != nil {
		f.Close()
		return "", fmt.Errorf("failed to write temp file: %w", err)
	}
	f.Close()

	task, err := storage.Upload("iso", tmpPath)
	if err != nil {
		return "", fmt.Errorf("failed to upload iso: %w", err)
	}

	if err := task.WaitFor(ctx, 300); err != nil {
		return "", fmt.Errorf("failed to wait for iso upload: %w", err)
	}

	volumeID := fmt.Sprintf("%s:iso/%s", storage.Name, filename)
	return volumeID, nil
}

// downloadISOFromURL は URL から ISO を Proxmox ストレージにダウンロードします
// returns volumeID (例: "local:iso/filename.iso")
func downloadISOFromURL(ctx context.Context, urlStr, filename string) (string, error) {
	client, err := getProxmoxClient()
	if err != nil {
		return "", fmt.Errorf("failed to get proxmox client: %w", err)
	}

	nodes, err := client.Nodes(ctx)
	if err != nil || len(nodes) == 0 {
		return "", fmt.Errorf("failed to get proxmox nodes: %w", err)
	}

	nodeName := nodes[0].Name
	node, err := client.Node(ctx, nodeName)
	if err != nil {
		return "", fmt.Errorf("failed to get proxmox node %s: %w", nodeName, err)
	}

	storage, err := node.StorageISO(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to find ISO storage: %w", err)
	}

	if !strings.HasSuffix(strings.ToLower(filename), ".iso") {
		filename += ".iso"
	}

	task, err := storage.DownloadURL(ctx, "iso", filename, urlStr)
	if err != nil {
		return "", fmt.Errorf("failed to download iso: %w", err)
	}

	if err := task.WaitFor(ctx, 600); err != nil {
		return "", fmt.Errorf("failed to wait for iso download: %w", err)
	}

	volumeID := fmt.Sprintf("%s:iso/%s", storage.Name, filename)
	return volumeID, nil
}

func deleteCloudInitFile(ctx context.Context, nodeName, cloudinitID string) {
	client, err := getProxmoxClient()
	if err != nil {
		log.Printf("Warning: deleteCloudInitFile: %v", err)
		return
	}
	node, err := client.Node(ctx, nodeName)
	if err != nil {
		log.Printf("Warning: deleteCloudInitFile: %v", err)
		return
	}
	storage, err := node.Storage(ctx, "local")
	if err != nil {
		log.Printf("Warning: deleteCloudInitFile: %v", err)
		return
	}
	volID := fmt.Sprintf("local:snippets/cloudinit-%s.yaml", cloudinitID)
	if _, err := storage.DeleteContent(ctx, volID); err != nil {
		log.Printf("Warning: deleteCloudInitFile: failed to delete %s: %v", volID, err)
		return
	}
	log.Printf("Cleaned up cloudinit file: %s", volID)
}

func clearCloudInitConfig(ctx context.Context, nodeName string, vmID int) {
	client, err := getProxmoxClient()
	if err != nil {
		log.Printf("Warning: clearCloudInitConfig: %v", err)
		return
	}
	node, err := client.Node(ctx, nodeName)
	if err != nil {
		log.Printf("Warning: clearCloudInitConfig: %v", err)
		return
	}
	vm, err := node.VirtualMachine(ctx, vmID)
	if err != nil {
		log.Printf("Warning: clearCloudInitConfig: %v", err)
		return
	}
	task, err := vm.Config(ctx, goProxmox.VirtualMachineOption{Name: "delete", Value: "cicustom"})
	if err != nil {
		log.Printf("Warning: clearCloudInitConfig: failed to delete cicustom: %v", err)
		return
	}
	if err := task.WaitFor(ctx, 30); err != nil {
		log.Printf("Warning: clearCloudInitConfig: %v", err)
		return
	}
	log.Printf("Cleared cloud-init config for VM %d", vmID)
}
