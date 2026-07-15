resource "proxmox_virtual_environment_file" "cloudcfg" {
  content_type = "snippets"
  datastore_id = "local"
  node_name    = var.node_name

  source_raw {
    file_name = "cloudinit-${var.cloudinit_id}.yaml"
    
    data = templatefile("${path.module}/cloud-config.yaml", {
      username      = var.username
      user_pubkey   = var.user_pubkey
      agent_user    = var.agent_user
      agent_pubkey  = var.agent_pubkey
      runcmd        = var.runcmd
      vm_ip         = var.vm_ip
      vm_gateway    = var.vm_gateway
      vm_netmask    = var.vm_netmask
    })
  }
}