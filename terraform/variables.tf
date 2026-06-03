variable "proxmox_endpoint" {
  type        = string
  description = "Proxmox API endpoint"
}

variable "proxmox_api_token_id" {
  type        = string
  description = "Proxmox API Token ID (e.g. root@pam!token1)"
  sensitive   = true
}

variable "proxmox_api_token_secret" {
  type        = string
  description = "Proxmox API Token Secret (UUID)"
  sensitive   = true
}

variable "proxmox_username" {
  type        = string
  description = "Proxmox username"
  sensitive   = true
  default     = ""
}

variable "proxmox_password" {
  type        = string
  description = "Proxmox password"
  sensitive   = true
  default     = ""
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