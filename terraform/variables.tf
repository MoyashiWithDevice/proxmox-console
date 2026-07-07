variable "node_name" {}

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