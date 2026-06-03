terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = "~> 0.66"
    }
  }
}

provider "proxmox" {
  # endpoint / api_token は環境変数 PROXMOX_VE_ENDPOINT / PROXMOX_VE_API_TOKEN から自動取得
  insecure = true
}


