package main
import (
	"os"
	"path/filepath"
	"encoding/json"
	"fmt"
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
	Hdd    int	  `json:"Hdd"` 
}

func listUserVMs(userID string) ([]VMInfo, error) {
	baseDir := filepath.Join("terraform", "vms", userID)

	var vms []VMInfo
	err := filepath.Walk(baseDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		// ディレクトリはそのまま降りる
		if info.IsDir() {
			return nil
		}

		// tfstate だけ処理
		if info.Name() != "terraform.tfstate" {
			return nil
		}

		b, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		var raw map[string]interface{}
		json.Unmarshal(b, &raw)

		resources := raw["resources"].([]interface{})

		for _, r := range resources {
			res := r.(map[string]interface{})

			if res["type"] != "proxmox_virtual_environment_vm" {
				continue
			}

			instances := res["instances"].([]interface{})
			attr := instances[0].(map[string]interface{})["attributes"].(map[string]interface{})

			vm := VMInfo{
				Name: fmt.Sprint(attr["name"]),
				VMID: int(attr["vm_id"].(float64)),
			}

			// CPU cores
			cpu := attr["cpu"].([]interface{})[0].(map[string]interface{})
			vm.Cores = int(cpu["cores"].(float64))

			// Memory
			mem := attr["memory"].([]interface{})[0].(map[string]interface{})
			vm.Memory = int(mem["dedicated"].(float64))
			
			// HDD (disk size)
			if disks, ok := attr["disk"].([]interface{}); ok && len(disks) > 0 {
				d0 := disks[0].(map[string]interface{})
				if size, ok := d0["size"].(float64); ok {
					vm.Hdd = int(size)
				}
			}

			// IP
			ipv4 := attr["ipv4_addresses"].([]interface{})[1].([]interface{})
			vm.IP = fmt.Sprint(ipv4[0])

			vms = append(vms, vm)
		}

		return nil
	})

	return vms, err
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