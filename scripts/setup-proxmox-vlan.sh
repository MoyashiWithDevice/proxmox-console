#!/bin/bash
set -euo pipefail

# Proxmox Console — Proxmox ホスト VLAN セットアップスクリプト
#
# このスクリプトは Proxmox VE ホスト上で実行し、以下の設定を自動で行います:
#   1. vmbr0 を VLAN-aware ブリッジに変更
#   2. IP 転送の有効化
#   3. nftables NAT (masquerade) ルールの追加
#
# 使い方:
#   ssh root@<proxmox-host> "$(cat scripts/setup-proxmox-vlan.sh)"
#   または Proxmox ホストにコピーして実行:
#   scp scripts/setup-proxmox-vlan.sh root@<proxmox-host>:/root/
#   ssh root@<proxmox-host> "bash /root/setup-proxmox-vlan.sh"

BRIDGE="${BRIDGE:-vmbr0}"
VLAN_RANGE="${VLAN_RANGE:-2-4094}"

echo "=== Proxmox Console: VLAN Setup ==="
echo "Bridge:       $BRIDGE"
echo "VLAN range:   $VLAN_RANGE"
echo ""

# ── 1. vmbr0 を VLAN-aware にする ────────────────────────────────────────
echo "[1/3] Configuring $BRIDGE as VLAN-aware bridge..."

if ! grep -q "bridge-vlan-aware yes" /etc/network/interfaces 2>/dev/null; then
    sed -i "/^iface $BRIDGE\b/,/^$/ {
        /^$/i\\tbridge-vlan-aware yes\\n\\tbridge-vids $VLAN_RANGE
    }" /etc/network/interfaces
    echo "  - Added bridge-vlan-aware / bridge-vids to /etc/network/interfaces"
else
    echo "  - Already configured, skipping"
fi

# 設定反映 (ifreload が使えない場合は ifupdown の再起動)
if command -v ifreload &>/dev/null; then
    ifreload -a && echo "  - Network config reloaded (ifreload -a)"
else
    systemctl restart networking && echo "  - Network config reloaded (systemctl restart networking)"
fi

# ── 2. IP 転送を有効化 ────────────────────────────────────────────────────
echo "[2/3] Enabling IP forwarding..."

SYSCTL_FILE="/etc/sysctl.d/99-proxmox-console-forward.conf"
if [ ! -f "$SYSCTL_FILE" ]; then
    echo "net.ipv4.ip_forward=1" > "$SYSCTL_FILE"
    sysctl -p "$SYSCTL_FILE" > /dev/null
    echo "  - IP forwarding enabled (persistent)"
else
    echo "  - Already configured, skipping"
fi

# ── 3. nftables NAT (masquerade) ──────────────────────────────────────────
echo "[3/3] Adding nftables masquerade rule for outbound traffic..."

NFT_TABLE="nat"
NFT_CHAIN="postrouting"

if ! nft list table "$NFT_TABLE" &>/dev/null; then
    nft add table "$NFT_TABLE"
    echo "  - Created nftables table '$NFT_TABLE'"
fi

if ! nft list chain "$NFT_TABLE" "$NFT_CHAIN" &>/dev/null; then
    nft "add chain $NFT_TABLE $NFT_CHAIN { type nat hook postrouting priority 0; }"
    echo "  - Created nftables chain '$NFT_CHAIN'"
fi

# oif $BRIDGE に対する masquerade ルールがなければ追加
if ! nft list chain "$NFT_TABLE" "$NFT_CHAIN" 2>/dev/null | grep -q "oif.*$BRIDGE.*masquerade"; then
    nft add rule "$NFT_TABLE" "$NFT_CHAIN" oif "$BRIDGE" masquerade
    echo "  - Added masquerade rule for oif $BRIDGE"
else
    echo "  - Masquerade rule already exists, skipping"
fi

# nftables ルールセットを永続化
NFT_CONF="/etc/nftables.d/10-proxmox-console.nft"
mkdir -p /etc/nftables.d
nft list table "$NFT_TABLE" > "$NFT_CONF"
echo "  - Saved nftables rules to $NFT_CONF"

echo ""
echo "=== Setup complete ==="
echo ""
echo "Verify with:"
echo "  # VLAN-aware check"
echo "  bridge -c vlan show dev $BRIDGE"
echo ""
echo "  # IP forwarding"
echo "  sysctl net.ipv4.ip_forward"
echo ""
echo "  # NAT rule"
echo "  nft list table $NFT_TABLE"
