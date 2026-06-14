resource "proxmox_virtual_environment_vm" "vm" {
  name      = var.servername
  node_name = var.node_name
  on_boot = true

  clone {
    vm_id = 9000
  }

  cpu {
    cores = var.cpu
  }

  memory {
    dedicated = var.memory
  }

  disk {
    datastore_id = "local-lvm"
    interface    = "scsi0"
    size         = var.hdd
  }

  network_device {
    bridge  = "vmbr0"
    model   = "virtio"
    vlan_id = 10
  }

  initialization {
    ip_config {
      ipv4 {
        address = "dhcp"
      }
    }

    user_data_file_id = proxmox_virtual_environment_file.cloudcfg.id
  }

  agent {
    enabled = true
  }
}

output "vm_ip" {
  value = try(
    proxmox_virtual_environment_vm.vm.ipv4_addresses[1],
    "waiting"
  )
}