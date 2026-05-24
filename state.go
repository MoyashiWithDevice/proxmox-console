package main

import (
	"encoding/json"
	"fmt"
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
	fmt.Println(dbVms)
	var vms []VMInfo
	for _, dbVm := range dbVms {
		// VMのIDとステータスはDBから取得済み
		vm := VMInfo{
			VMID:   dbVm.ProxmoxVMID,
			Status: dbVm.Status,
		}

		// その他のリソースはtfstateから取得する
		tfstatePath := filepath.Join(dbVm.TFWorkdir, "terraform.tfstate")
		b, err := os.ReadFile(tfstatePath)
		if err != nil {
			vms = append(vms, vm)
			continue
		}

		var state TFState
		if err := json.Unmarshal(b, &state); err != nil {
			vms = append(vms, vm)
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
			if ip := parseIPv4Addresses(attr["ipv4_addresses"]); ip != "" {
				vm.IP = ip
			}

			vms = append(vms, vm)
			found = true
		}

		if !found {
			vms = append(vms, vm)
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
	switch v := value.(type) {
	case []interface{}:
		for _, item := range v {
			switch inner := item.(type) {
			case string:
				if inner != "" {
					return strings.Split(inner, "/")[0]
				}
			case []interface{}:
				if len(inner) > 0 {
					return fmt.Sprint(inner[0])
				}
			}
		}
	case string:
		if v != "" {
			return strings.Split(v, "/")[0]
		}
	}
	return ""
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
