# Terraform cloud-init 設定

## snippets.tf

cloud-init設定ファイルをProxmoxのスニペットとしてアップロード:

```hcl
resource "proxmox_virtual_environment_file" "cloudcfg" {
  content_type = "snippets"
  datastore_id = "local"
  node_name    = var.node_name

  source_raw {
    file_name = "cloudinit-${var.servername}.yaml"
    data = templatefile("${path.module}/cloud-config.yaml", {
      username      = var.username
      password_hash = var.password_hash
    })
  }
}
```

### パラメータ

| パラメータ | 型 | 説明 |
|---|---|---|
| `content_type` | string | `snippets`, `iso`, `vztmpl`, `backup` |
| `datastore_id` | string | ストレージ名（スニペットは `local` 必須） |
| `node_name` | string | 対象ノード |
| `source_raw.file_name` | string | ファイル名 |
| `source_raw.data` | string | ファイル内容（`templatefile()` で変数展開） |

### ファイルアップロード方法

`source_raw`（インライン）と `source_file`（ローカルファイル）の2種類:

```hcl
# インライン（現在の構成）
source_raw {
  file_name = "config.yaml"
  data      = templatefile("template.yaml", { ... })
}

# ローカルファイル
source_file {
  file_name = "config.yaml"
  path      = "${path.module}/files/config.yaml"
}
```

## cloud-config.yaml（テンプレート）

```yaml
#cloud-config
ssh_pwauth: true

users:
  - name: ${username}
    sudo: ALL=(ALL) NOPASSWD:ALL
    groups: sudo
    shell: /bin/bash
    lock_passwd: false
    passwd: ${password_hash}

chpasswd:
  expire: false
```

### cloud-init ディレクティブ

| ディレクティブ | 説明 |
|---|---|
| `#cloud-config` | ファイルの先頭行（必須） |
| `ssh_pwauth: true` | SSHパスワード認証を有効化 |
| `users[].name` | ユーザー名（`${username}` でTerraform変数を展開） |
| `users[].sudo` | sudo権限 |
| `users[].passwd` | ハッシュ化パスワード |
| `users[].lock_passwd: false` | パスワードログインを許可 |
| `chpasswd.expire: false` | 初回ログイン時のパスワード変更要求を無効化 |

## パスワードハッシュ化（Go側）

```go
// main.go (feature_backend)
func hashPasswordForLinux(password string) (string, error) {
    saltBytes := make([]byte, 16)
    rand.Read(saltBytes)
    salt := base64.RawStdEncoding.EncodeToString(saltBytes)
    // $6$ = SHA-512 crypt
    hash, err := crypt.Crypt(password, "$6$"+salt)
    return hash, err
}
```

ハッシュ方式の比較:

| 方式 | プレフィックス | 強度 | 互換性 |
|---|---|---|---|
| SHA-512 | `$6$` | 高 | 広（Linux標準） |
| SHA-256 | `$5$` | 中 | 広 |
| MD5 | `$1$` | 低（非推奨） | 非常に広 |
| bcrypt | `$2b$` | 高 | 制限あり |
| yescrypt | `$y$` | 最高 | 新しい（glibc 2.36+） |

現在の `$6$`（SHA-512）はLinux全般で互換性が高く適切。

## cloud-init の拡張オプション

### SSH鍵の追加

```yaml
users:
  - name: ${username}
    ssh_authorized_keys:
      - ssh-ed25519 AAAA... user@host
      - ssh-rsa AAAA... user@host
```

### パッケージインストール

```yaml
packages:
  - nginx
  - docker.io
  - curl

package_update: true
package_upgrade: true
```

### ファイル配置

```yaml
write_files:
  - path: /etc/myapp/config.yaml
    content: |
      key: value
    owner: root:root
    permissions: '0644'
```

### コマンド実行

```yaml
runcmd:
  - systemctl enable nginx
  - systemctl start nginx
  - curl -fsSL https://get.docker.com | sh
```

### ネットワーク設定（静的IP）

`vm.tf` の `initialization.ip_config` で設定するか、cloud-initの `network` セクションで設定可能:

```yaml
# network-config（別ファイル）
version: 2
ethernets:
  eth0:
    dhcp4: true
    # addresses:
    #   - 192.168.10.100/24
    # gateway4: 192.168.10.1
    # nameservers:
    #   addresses: [8.8.8.8, 8.8.4.4]
```

### ディスク自動拡張（growpart）

cloud-init標準で `growpart` モジュールが有効な場合、クローン元のディスクサイズに合わせて自動拡張される。Terraformで `size` を変更すれば、VM初回起動時にパーティションが自動拡張される。

## トラブルシューティング

### cloud-initが実行されない

1. VM内で `cloud-init status` で状態確認
2. `/var/log/cloud-init.log`, `/var/log/cloud-init-output.log` を確認
3. テンプレートVMに `cloud-init` パッケージがインストールされているか確認
4. Proxmox UIでVMの Cloud-Init タブに設定が表示されているか確認

### IPアドレスが取得できない

- `agent.enabled = true` が必要
- VM内で `qemu-guest-agent` が動作している必要がある
- DHCPサーバーがVLANに設定されているか確認（当プロジェクトはVLAN 10）
- `terraform output` の `ipv4_addresses[1]` はlo以外の最初のNIC
- DHCPリースに時間がかかる場合がある（数秒〜数十秒）
