package main

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"

	"github.com/Telmate/proxmox-api-go/proxmox"
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
		return nil, errors.New("missing PROXMOX_API_URL")
	}

	tlsConfig := &tls.Config{InsecureSkipVerify: AppConfig.Proxmox.InsecureSkipVerify}
	client, err := proxmox.NewClient(AppConfig.Proxmox.APIURL, nil, "", tlsConfig, "", 0, false)
	if err != nil {
		return nil, fmt.Errorf("failed to create proxmox client: %w", err)
	}

	if AppConfig.Proxmox.Username != "" && AppConfig.Proxmox.Password != "" {
		if err := client.Login(ctx, AppConfig.Proxmox.Username, AppConfig.Proxmox.Password, ""); err != nil {
			return nil, fmt.Errorf("failed to login to proxmox: %w", err)
		}
	} else if AppConfig.Proxmox.APITokenID != "" && AppConfig.Proxmox.APITokenSecret != "" {
		var tokenID proxmox.ApiTokenID
		if err := tokenID.Parse(AppConfig.Proxmox.APITokenID); err != nil {
			return nil, fmt.Errorf("invalid proxmox api token id: %w", err)
		}
		client.SetAPIToken(tokenID, proxmox.ApiTokenSecret(AppConfig.Proxmox.APITokenSecret))
	} else {
		return nil, errors.New("missing Proxmox authentication: set PROXMOX_API_TOKEN_ID/PROXMOX_API_TOKEN_SECRET or PROXMOX_USERNAME/PROXMOX_PASSWORD")
	}

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
