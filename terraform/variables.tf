variable "proxmox_endpoint" {
  type        = string
  description = "Proxmox API endpoint"
}

variable "proxmox_username" {
  type        = string
  description = "Proxmox username"
  sensitive   = true
}

variable "proxmox_password" {
  type        = string
  description = "Proxmox password"
  sensitive   = true
}

variable "node_name" {}

variable "servername" {}
variable "cpu" {}
variable "memory" {}
variable "hdd" {}
variable "username" { sensitive = true }
variable "password_hash" { sensitive = true }
variable "agent_user" { sensitive = true }
variable "agent_pubkey" { sensitive = true }