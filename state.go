package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
)

type TFState struct {
	Resources []struct {
		Type      string `json:"type"`
		Instances []struct {
			Attributes map[string]interface{} `json:"attributes"`
		} `json:"instances"`
	} `json:"resources"`
}

type VMInfo struct {
	Name   string `json:"Name"`
	VMID   int    `json:"VMID"`
	IP     string `json:"IP"`
	Memory int    `json:"Memory"`
	Cores  int    `json:"Cores"`
	Hdd    int    `json:"Hdd"`
	Status string `json:"status,omitempty"`
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

func listUserVMs(userID string) ([]VMInfo, error) {
	// KratosIDからAppIDを取得
	dbUserID, err := getDatabaseUserID(userID)
	if err != nil {
		return nil, err
	}

	// AppIDから当該ユーザが所有するVM一覧を取得
	dbVms, err := getUserVMs(dbUserID)
	if err != nil {
		return nil, err
	}

	var vms []VMInfo
	for _, dbVm := range dbVms {
		// VMのIDとステータスはDBから取得済み
		// IPアドレスはAPIから取得するため、初期値は「-」とする
		vm := VMInfo{
			VMID:   dbVm.ProxmoxVMID,
			Status: dbVm.Status,
			IP:     "-",
		}

		if strings.EqualFold(dbVm.Status, "completed") {
			if status, err := getProxmoxVMStatus(context.Background(), dbVm.NodeName, dbVm.ProxmoxVMID); err == nil {
				vm.Status = status
			} else {
				log.Printf("warning: failed to resolve Proxmox runtime status for VM %d on node %s: %v", dbVm.ProxmoxVMID, dbVm.NodeName, err)
			}
		}

		// その他のリソースはtfstateから取得する
		tfstatePath := filepath.Join(dbVm.TFWorkdir, "terraform.tfstate")
		b, err := os.ReadFile(tfstatePath)
		if err != nil {
			// tfstate が読み込めない場合、そのVMは返さない (情報が不完全)
			log.Printf("warning: terraform.tfstate not found for VM %d: %v", dbVm.ProxmoxVMID, err)
			continue
		}

		var state TFState
		if err := json.Unmarshal(b, &state); err != nil {
			// JSON のアンマーシャルに失敗した場合、そのVMは返さない
			log.Printf("warning: failed to unmarshal terraform.tfstate for VM %d: %v", dbVm.ProxmoxVMID, err)
			continue
		}

		found := false
		for _, res := range state.Resources {
			if res.Type != "proxmox_virtual_environment_vm" || len(res.Instances) == 0 {
				continue
			}

			attr := res.Instances[0].Attributes
			vm.Name = parseString(attr["name"])
			if parsed, ok := parseInt(attr["vm_id"]); ok {
				vm.VMID = parsed
			}
			if cores, ok := parseFirstMapInt(attr["cpu"], "cores"); ok {
				vm.Cores = cores
			}
			if mem, ok := parseFirstMapInt(attr["memory"], "dedicated"); ok {
				vm.Memory = mem
			}
			if hdd, ok := parseFirstMapInt(attr["disk"], "size"); ok {
				vm.Hdd = hdd
			}

			// リアルタイムのIPアドレスをProxmox APIから取得
			if apiIP, err := getProxmoxVMIP(context.Background(), dbVm.NodeName, dbVm.ProxmoxVMID); err == nil && apiIP != "" {
				vm.IP = apiIP
			}

			// 必須情報が全て揃っているかチェック (Name, Memory, Cores, Hdd)
			// IP は任意情報なので、「-」でも OK
			if vm.Name != "" && vm.Memory > 0 && vm.Cores > 0 && vm.Hdd > 0 {
				vms = append(vms, vm)
			} else {
				log.Printf("warning: VM %d has incomplete information: Name=%s, Memory=%d, Cores=%d, Hdd=%d",
					dbVm.ProxmoxVMID, vm.Name, vm.Memory, vm.Cores, vm.Hdd)
			}
			found = true
		}

		if !found {
			// tfstate から VM リソースが見つからない場合、そのVMは返さない
			log.Printf("warning: proxmox_virtual_environment_vm resource not found in terraform.tfstate for VM %d", dbVm.ProxmoxVMID)
		}
	}

	return vms, nil
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
