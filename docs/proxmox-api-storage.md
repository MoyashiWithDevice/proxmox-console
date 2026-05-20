# Proxmox VE API - ストレージ管理

## ストレージ一覧取得

```
GET /api2/json/storage
```

**レスポンス例**:

```json
{
  "data": [
    {
      "storage": "local",
      "type": "dir",
      "content": "iso,vztmpl,backup",
      "shared": 0,
      "active": 1
    },
    {
      "storage": "local-lvm",
      "type": "lvmthin",
      "content": "images,rootdir",
      "shared": 0,
      "active": 1
    },
    {
      "storage": "ceph-pool",
      "type": "rbd",
      "content": "images,rootdir",
      "shared": 1,
      "active": 1
    }
  ]
}
```

## ノードのストレージ一覧

```
GET /api2/json/nodes/{node}/storage
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `content` | string | フィルタ: `images`, `rootdir`, `vztmpl`, `iso`, `backup` |
| `format` | boolean | フォーマット情報付き |
| `storage` | string | 特定ストレージ名 |

## ストレージステータス

```
GET /api2/json/nodes/{node}/storage/{storage}/status
```

```json
{
  "data": {
    "total": 107374182400,
    "used": 53687091200,
    "avail": 53687091200,
    "type": "lvmthin",
    "content": "images,rootdir",
    "active": 1
  }
}
```

## ストレージ内容一覧

```
GET /api2/json/nodes/{node}/storage/{storage}/content
```

| パラメータ | 型 | 説明 |
|---|---|---|
| `content` | string | フィルタ: `images`, `rootdir`, `vztmpl`, `iso`, `backup` |
| `vmid` | integer | 特定VMIDでフィルタ |

**レスポンス例**:

```json
{
  "data": [
    {
      "volid": "local:iso/ubuntu-22.04-server-amd64.iso",
      "volname": "ubuntu-22.04-server-amd64.iso",
      "size": 1476395008,
      "content": "iso",
      "storage": "local",
      "type": "iso"
    },
    {
      "volid": "local-lvm:vm-100-disk-0",
      "volname": "vm-100-disk-0",
      "size": 10737418240,
      "content": "images",
      "storage": "local-lvm",
      "vmid": 100,
      "type": "images"
    }
  ]
}
```

## ISO イメージアップロード

```
POST /api2/json/nodes/{node}/storage/{storage}/upload
```

**Content-Type**: `multipart/form-data`

| パラメータ | 型 | 説明 |
|---|---|---|
| `content` | string | `iso` or `vztmpl` |
| `filename` | file | アップロードファイル |

## ストレージ内容削除

```
DELETE /api2/json/nodes/{node}/storage/{storage}/content/{volume}
```

## ストレージ種別

| 種別 | タイプ | content対応 | 説明 |
|---|---|---|---|
| `dir` | ディレクトリ | iso, vztmpl, backup, images, rootdir | ローカルディレクトリ |
| `lvm` | LVM | images, rootdir | LVMボリューム |
| `lvmthin` | LVM-Thin | images, rootdir | LVM Thin Provisioning |
| `nfs` | NFS | iso, vztmpl, backup, images, rootdir | NFSマウント |
| `cifs` | CIFS/SMB | iso, vztmpl, backup, images, rootdir | SMBマウント |
| `rbd` | Ceph RBD | images, rootdir | Cephブロックデバイス |
| `cephfs` | CephFS | iso, vztmpl, backup | Cephファイルシステム |
| `zfspool` | ZFS Pool | images, rootdir | ZFSプール |
| `btrfs` | BTRFS | images, rootdir | BTRFSサブボリューム |

## content種別

| content | 説明 |
|---|---|
| `images` | QEMU VM ディスクイメージ |
| `rootdir` | LXC コンテナのルートディレクトリ |
| `vztmpl` | LXC OSテンプレート |
| `iso` | ISO イメージ |
| `backup` | バックアップファイル（vma, tar） |
| `snippets` | スニペットファイル（cloud-init等） |

当プロジェクトでは `local-lvm` (LVM-Thin) にVMディスク（`images`）を配置している。
