variable "node_name" {}

variable "cloudinit_id" {}

variable "servername" {}
variable "cpu" {}
variable "memory" {}
variable "hdd" {}
variable "username" { sensitive = true }
variable "template_id" {}
variable "user_pubkey" { sensitive = true }
variable "agent_user" { sensitive = true }
variable "agent_pubkey" { sensitive = true }
variable "runcmd" {
  default = ""
}

variable "iso_volume_id" {
  default = ""
}

variable "vm_ip" {
  default = ""
}

variable "vm_gateway" {
  default = ""
}

variable "vm_netmask" {
  default = "24"
}