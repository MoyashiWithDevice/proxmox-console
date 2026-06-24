package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type TFState struct {
	Resources []struct {
		Type      string `json:"type"`
		Instances []struct {
			Attributes map[string]interface{} `json:"attributes"`
		} `json:"instances"`
	} `json:"resources"`
}

func findJobIPForVM(vmid int) string {
	var ip string
	jobs.Range(func(_, value interface{}) bool {
		job := value.(*Job)
		if job.VMID == vmid && job.IP != "" {
			ip = job.IP
			return false
		}
		return true
	})
	return ip
}

func listUserVMs(userID string) ([]VMResponse, error) {
	dbUserID, err := getDatabaseUserID(userID)
	if err != nil {
		return nil, err
	}
	dbVms, err := getUserVMs(dbUserID)
	if err != nil {
		return nil, err
	}

	type result struct {
		vm VMResponse
		ok bool
	}

	results := make([]result, len(dbVms))
	var wg sync.WaitGroup

	// タイムアウト付きコンテキスト（全体で5秒）
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	for i, dbVm := range dbVms {
		wg.Add(1)
		go func(i int, dbVm *ManageVM) {
			defer wg.Done()

			vm := VMResponse{
				VMID:   dbVm.ProxmoxVMID,
				Status: dbVm.Status,
				IP:     "-",
			}

			// tfstate読み込み（ファイルIOなので並列化の恩恵大）
			tfstatePath := filepath.Join(dbVm.TFWorkdir, "terraform.tfstate")
			b, err := os.ReadFile(tfstatePath)
			if err != nil {
				log.Printf("warning: terraform.tfstate not found for VM %d: %v", dbVm.ProxmoxVMID, err)
				return
			}
			var state TFState
			if err := json.Unmarshal(b, &state); err != nil {
				log.Printf("warning: failed to unmarshal terraform.tfstate for VM %d: %v", dbVm.ProxmoxVMID, err)
				return
			}

			found := false
			for _, res := range state.Resources {
				if res.Type != "proxmox_virtual_environment_vm" || len(res.Instances) == 0 {
					continue
				}
				attr := res.Instances[0].Attributes
				vm.Servername = parseString(attr["name"])
				if parsed, ok := parseInt(attr["vm_id"]); ok {
					vm.VMID = parsed
				}
				if cores, ok := parseFirstMapInt(attr["cpu"], "cores"); ok {
					vm.CPU = cores
				}
				if mem, ok := parseFirstMapInt(attr["memory"], "dedicated"); ok {
					vm.Memory = mem
				}
				if hdd, ok := parseFirstMapInt(attr["disk"], "size"); ok {
					vm.HDD = hdd
				}

				if strings.EqualFold(dbVm.Status, "completed") {
					if info, err := getProxmoxVMInfo(ctx, dbVm.NodeName, dbVm.ProxmoxVMID); err == nil {
						vm.Status = info.Status
						vm.IP = info.IP
					} else {
						log.Printf("warning: failed to get proxmox vm info for VM %d: %v", dbVm.ProxmoxVMID, err)
					}
				}

				if vm.Servername != "" && vm.Memory > 0 && vm.CPU > 0 && vm.HDD > 0 {
					results[i] = result{vm: vm, ok: true}
				} else {
					log.Printf("warning: VM %d has incomplete information: Name=%s, Memory=%d, Cores=%d, Hdd=%d",
						dbVm.ProxmoxVMID, vm.Servername, vm.Memory, vm.CPU, vm.HDD)
				}
				found = true
			}
			if !found {
				log.Printf("warning: proxmox_virtual_environment_vm resource not found in terraform.tfstate for VM %d", dbVm.ProxmoxVMID)
			}
		}(i, dbVm)
	}

	wg.Wait()

	// 順序を保ってフィルタ
	var vms []VMResponse
	for _, r := range results {
		if r.ok {
			vms = append(vms, r.vm)
		}
	}
	return vms, nil
}

type ProxmoxVMInfo struct {
	Status string
	IP     string
}

func getProxmoxVMInfo(ctx context.Context, nodeName string, vmid int) (ProxmoxVMInfo, error) {
	client, err := getProxmoxClient()
	if err != nil {
		return ProxmoxVMInfo{}, err
	}

	node, err := client.Node(ctx, nodeName)
	if err != nil {
		return ProxmoxVMInfo{}, fmt.Errorf("failed to get node: %w", err)
	}

	vm, err := node.VirtualMachine(ctx, vmid)
	if err != nil {
		return ProxmoxVMInfo{}, fmt.Errorf("failed to get vm: %w", err)
	}

	info := ProxmoxVMInfo{
		Status: string(vm.Status),
		IP:     "-",
	}

	// IPはベストエフォート（失敗してもStatusは返す）
	ifaces, err := vm.AgentGetNetworkIFaces(ctx)
	if err == nil {
		for _, iface := range ifaces {
			for _, addr := range iface.IPAddresses {
				if addr.IPAddressType != "ipv4" || addr.IPAddress == "127.0.0.1" {
					continue
				}
				info.IP = addr.IPAddress
				goto done
			}
		}
	}
done:
	return info, nil
}

func parseString(value interface{}) string {
	if value == nil {
		return ""
	}
	if s, ok := value.(string); ok {
		return s
	}
	return fmt.Sprint(value)
}

func parseInt(value interface{}) (int, bool) {
	switch v := value.(type) {
	case float64:
		return int(v), true
	case float32:
		return int(v), true
	case int:
		return v, true
	case int64:
		return int(v), true
	case json.Number:
		i, err := v.Int64()
		if err != nil {
			return 0, false
		}
		return int(i), true
	default:
		return 0, false
	}
}

func parseFirstMapInt(value interface{}, key string) (int, bool) {
	arr, ok := value.([]interface{})
	if !ok || len(arr) == 0 {
		return 0, false
	}

	m, ok := arr[0].(map[string]interface{})
	if !ok {
		return 0, false
	}

	return parseInt(m[key])
}

func parseIPv4Addresses(value interface{}) string {
	var fallback string
	isLoopback := func(ip string) bool {
		return ip == "127.0.0.1" || strings.HasPrefix(ip, "127.") || ip == "::1"
	}

	sanitize := func(raw string) string {
		if raw == "" {
			return ""
		}
		return strings.Split(raw, "/")[0]
	}

	switch v := value.(type) {
	case []interface{}:
		for _, item := range v {
			switch inner := item.(type) {
			case string:
				ip := sanitize(inner)
				if ip == "" {
					continue
				}
				if !isLoopback(ip) {
					return ip
				}
				if fallback == "" {
					fallback = ip
				}
			case []interface{}:
				if len(inner) > 0 {
					ip := sanitize(fmt.Sprint(inner[0]))
					if ip == "" {
						continue
					}
					if !isLoopback(ip) {
						return ip
					}
					if fallback == "" {
						fallback = ip
					}
				}
			}
		}
	case string:
		return sanitize(v)
	}
	return fallback
}

func parseIP(ipconfig string) string {
	for _, part := range strings.Split(ipconfig, ",") {
		if strings.HasPrefix(part, "ip=") {
			ip := strings.TrimPrefix(part, "ip=")
			if ip == "dhcp" {
				return "DHCP"
			}
			return strings.Split(ip, "/")[0]
		}
	}
	return ""
}
