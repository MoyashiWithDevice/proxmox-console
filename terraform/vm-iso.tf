resource "proxmox_virtual_environment_vm" "vm" {
  node_name  = var.node_name
  name       = var.servername
  cpu        = var.cpu
  memory     = var.memory
  disk {
    size   = var.hdd
    datastore_id = "local-lvm"
  }
  cdrom {
    file_id = var.iso_volume_id
  }
  operating_system {
    type = "l26"
  }
  agent {
    enabled = true
  }
  network_device {
    bridge  = "vmbr0"
    model   = "virtio"
  }
  on_boot = true
}
