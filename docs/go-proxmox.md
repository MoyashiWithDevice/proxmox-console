# go-proxmox

https://github.com/luthermonson/go-proxmox

Proxmox VE `/api2/json` のGoクライアントライブラリ。
username/password認証とAPI Token認証の両方をサポート。内部でセッション管理・自動再認証を行う。

## インストール

```
go get github.com/luthermonson/go-proxmox
```

## クライアント初期化

### API Token認証

```go
insecureHTTPClient := &http.Client{
    Transport: &http.Transport{
        TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
    },
}
client := proxmox.NewClient("https://proxmox:8006/api2/json",
    proxmox.WithHTTPClient(insecureHTTPClient),
    proxmox.WithAPIToken("root@pam!tokenid", "secret"),
)
```

### Username/Password認証

```go
credentials := proxmox.Credentials{
    Username: "root@pam",
    Password: "password",
}
client := proxmox.NewClient("https://proxmox:8006/api2/json",
    proxmox.WithCredentials(&credentials),
)
```

### 既存セッションの再利用（実験的）

```go
client := proxmox.NewClient("https://proxmox:8006/api2/json",
    proxmox.WithSession(ticket, csrfToken),
)
```

## Client Options

| Option | シグネチャ | 説明 |
|--------|-----------|------|
| `WithHTTPClient` | `(client *http.Client) Option` | カスタムHTTPクライアント（自己署名証明書用） |
| `WithCredentials` | `(credentials *Credentials) Option` | Username/Password認証 |
| `WithAPIToken` | `(tokenID, secret string) Option` | API Token認証（`"tokenID=secret"`としてヘッダー送信） |
| `WithSession` | `(ticket, CSRFPreventionToken string) Option` | 既存セッションの再利用（実験的） |
| `WithUserAgent` | `(ua string) Option` | User-Agentのカスタマイズ（デフォルト: `"go-proxmox/dev"`） |
| `WithLogger` | `(logger LeveledLoggerInterface) Option` | ロガーの設定 |

Deprecated options:
- `WithClient` → `WithHTTPClient` を使用
- `WithLogins` → `WithCredentials` を使用

## 主要型

### Client

```go
type Client struct {
    httpClient  *http.Client
    userAgent   string
    baseURL     string
    token       string
    credentials *Credentials
    version     *Version
    session     *Session
    log         LeveledLoggerInterface
    sessionExpiresAt time.Time
    sessionMux       sync.Mutex
}
```

すべてのAPI呼び出しの起点。内部でセッション管理・自動再認証を行う。
401/403を受信した場合、credentialsが設定されていれば自動的に`CreateSession`を呼んでリトライする。

### Credentials

```go
type Credentials struct {
    Username string `json:"username"`
    Password string `json:"password"`
}
```

### Session

```go
type Session struct {
    Ticket              string `json:"ticket"`
    CSRFPreventionToken string `json:"CSRFPreventionToken"`
}
```

### Version

```go
type Version struct {
    Version string `json:"version"`
    Release string `json:"release"`
    RepoID  string `json:"repoid"`
}
```

### Term（ターミナルプロキシ）

```go
type Term struct {
    User   string `json:"user"`
    Ticket string `json:"ticket"`
    Port   int    `json:"port"`
    UPMID  string `json:"upid"`
}
```

### VNC / VNCConfig

```go
type VNC struct {
    Port   int    `json:"port"`
    Ticket string `json:"ticket"`
    Cert   string `json:"cert"`
}

type VNCConfig struct {
    GeneratePassword bool `json:"generate-password"`
    WebSocket        bool `json:"websocket"`
}
```

## Cluster型

### Cluster

```go
type Cluster struct {
    client *Client
    ID     string       `json:"id"`
    Name   string       `json:"name"`
    Nodes  NodeStatuses `json:"nodes"`
    Quorate int         `json:"quorate"`
    Version int         `json:"version"`
}
```

### ClusterResource

```go
type ClusterResource struct {
    ID         string  `json:"id"`
    Type       string  `json:"type"`
    Content    string  `json:"content,omitempty"`
    CPU        float64 `json:"cpu,omitempty"`
    Disk       int64   `json:"disk,omitempty"`
    Hastrate   int     `json:"hastrate,omitempty"`
    Level      string  `json:"level,omitempty"`
    MaxCPU     int     `json:"maxcpu,omitempty"`
    MaxDisk    int64   `json:"maxdisk,omitempty"`
    MaxMem     int64   `json:"maxmem,omitempty"`
    Mem        int64   `json:"mem,omitempty"`
    Name       string  `json:"name,omitempty"`
    Node       string  `json:"node,omitempty"`
    PluginType string  `json:"plugintype,omitempty"`
    PoolID     string  `json:"poolid,omitempty"`
    Status     string  `json:"status,omitempty"`
    Storage    string  `json:"storage,omitempty"`
    Uptime     int64   `json:"uptime,omitempty"`
    VMID       int     `json:"vmid,omitempty"`
}
```

## Node型

### NodeStatus / Node

```go
type NodeStatus struct {
    CPU     float64 `json:"cpu"`
    Disk    int64   `json:"disk"`
    Level   string  `json:"level"`
    MaxCPU  int     `json:"maxcpu"`
    MaxDisk int64   `json:"maxdisk"`
    MaxMem  int64   `json:"maxmem"`
    Mem     int64   `json:"mem"`
    NodeID  string  `json:"nodeid"`
    SSLFingerprint string `json:"ssl_fingerprint"`
    Status  string  `json:"status"`
    Type    string  `json:"type"`
    Uptime  int64   `json:"uptime"`
}

type Node struct {
    client           *Client
    Name             string  `json:"node"`
    Status           string  `json:"status"`
    CPU              float64 `json:"cpu"`
    MaxCPU           int     `json:"maxcpu"`
    Mem              int64   `json:"mem"`
    MaxMem           int64   `json:"maxmem"`
    Disk             int64   `json:"disk"`
    MaxDisk          int64   `json:"maxdisk"`
    Uptime           int64   `json:"uptime"`
    Level            string  `json:"level"`
    SSLFingerprint   string  `json:"ssl_fingerprint"`
    HA               *HA     `json:"ha,omitempty"`
    CPUInfo          *CPUInfo `json:"cpuinfo,omitempty"`
    Memory           *Memory `json:"memory,omitempty"`
    RootFS           *RootFS `json:"rootfs,omitempty"`
    Ksm              *Ksm    `json:"ksm,omitempty"`
    Time             *Time   `json:"time,omitempty"`
}
```

## VirtualMachine型

### VirtualMachine

```go
type VirtualMachine struct {
    client *Client
    Node   string         `json:"node"`
    VMID   StringOrUint64 `json:"vmid"`
    Name   string         `json:"name"`
    Status string         `json:"status"`
    QMPStatus string      `json:"qmpstatus,omitempty"`
    Lock      string      `json:"lock,omitempty"`
    CPU      float64 `json:"cpu"`
    CPUs     int     `json:"cpus"`
    MaxCPU   int     `json:"maxcpu"`
    Mem      int64   `json:"mem"`
    MaxMem   int64   `json:"maxmem"`
    Disk     int64   `json:"disk"`
    MaxDisk  int64   `json:"maxdisk"`
    Uptime   int64   `json:"uptime"`
    PID      StringOrUint64 `json:"pid"`
    NetIn    int64   `json:"netin"`
    NetOut   int64   `json:"netout"`
    DiskRead  int64  `json:"diskread"`
    DiskWrite int64  `json:"diskwrite"`
    HAState  string  `json:"hastate,omitempty"`
    HAManaged int    `json:"hamanaged,omitempty"`
    Tags                  string `json:"tags,omitempty"`
    Description           string `json:"description,omitempty"`
    Agent                 int    `json:"agent,omitempty"`
    Template              int    `json:"template,omitempty"`
    VirtualMachineConfig  *VirtualMachineConfig `json:"-"`
}
```

### VirtualMachineConfig

```go
type VirtualMachineConfig struct {
    Affinity       string  `json:"affinity,omitempty"`
    Arch           string  `json:"arch,omitempty"`
    Args           string  `json:"args,omitempty"`
    Balloon        int     `json:"balloon,omitempty"`
    Bios           string  `json:"bios,omitempty"`
    Boot           string  `json:"boot,omitempty"`
    Bootdisk       string  `json:"bootdisk,omitempty"`
    Ciuser         string  `json:"ciuser,omitempty"`
    Cipassword     string  `json:"cipassword,omitempty"`
    Cores          int     `json:"cores,omitempty"`
    CPU            string  `json:"cpu,omitempty"`
    Cpulimit       int     `json:"cpulimit,omitempty"`
    CPUunits       int     `json:"cpuunits,omitempty"`
    Description    string  `json:"description,omitempty"`
    Efidisk0       string  `json:"efidisk0,omitempty"`
    Freeze         int     `json:"freeze,omitempty"`
    Hookscript     string  `json:"hookscript,omitempty"`
    Hugepages      string  `json:"hugepages,omitempty"`
    Ivshmem        string  `json:"ivshmem,omitempty"`
    Keephugepages  int     `json:"keephugepages,omitempty"`
    Keyboard       string  `json:"keyboard,omitempty"`
    KVM            int     `json:"kvm,omitempty"`
    Localtime      int     `json:"localtime,omitempty"`
    Lock           string  `json:"lock,omitempty"`
    Machine        string  `json:"machine,omitempty"`
    Memory         int     `json:"memory,omitempty"`
    MigrateDowntime float64 `json:"migrate_downtime,omitempty"`
    MigrateSpeed   int     `json:"migrate_speed,omitempty"`
    Name           string  `json:"name,omitempty"`
    Nameserver     string  `json:"nameserver,omitempty"`
    Numa           int     `json:"numa,omitempty"`
    Onboot         int     `json:"onboot,omitempty"`
    Ostype         string  `json:"ostype,omitempty"`
    Overwrite      int     `json:"overwrite,omitempty"`
    Protection     int     `json:"protection,omitempty"`
    Reboot         int     `json:"reboot,omitempty"`
    Searchdomain   string  `json:"searchdomain,omitempty"`
    Shares         int     `json:"shares,omitempty"`
    Startdate      string  `json:"startdate,omitempty"`
    Startup        string  `json:"startup,omitempty"`
    Tablet         int     `json:"tablet,omitempty"`
    Tags           string  `json:"tags,omitempty"`
    TagsSlice      []string `json:"-"`
    Tdf            int     `json:"tdf,omitempty"`
    Template       int     `json:"template,omitempty"`
    Timezone       string  `json:"timezone,omitempty"`
    Tpmstate0      string  `json:"tpmstate0,omitempty"`
    Vga            string  `json:"vga,omitempty"`
    VMgenid        string  `json:"vmgenid,omitempty"`
    VMstatestorage string  `json:"vmstatestorage,omitempty"`
    Watchdog       string  `json:"watchdog,omitempty"`
    Scsihw         string  `json:"scsihw,omitempty"`
    // マージ済みデバイスマップ
    IDEs      map[string]string `json:"-"`
    SCSIs     map[string]string `json:"-"`
    SATAs     map[string]string `json:"-"`
    VirtIOs   map[string]string `json:"-"`
    Nets      map[string]string `json:"-"`
    Unuseds   map[string]string `json:"-"`
    Serials   map[string]string `json:"-"`
    USBs      map[string]string `json:"-"`
    HostPCIs  map[string]string `json:"-"`
    Numas     map[string]string `json:"-"`
    Parallels map[string]string `json:"-"`
    IPConfigs map[string]string `json:"-"`
}
```

### VirtualMachineOption

```go
type VirtualMachineOption struct {
    Name  string
    Value interface{}
}
```

### VirtualMachineMigrateOptions

```go
type VirtualMachineMigrateOptions struct {
    Target          string `json:"target"`
    Online          int    `json:"online,omitempty"`
    Force           int    `json:"force,omitempty"`
    MigrationType   string `json:"migration_type,omitempty"`
    MigrationNetwork string `json:"migration_network,omitempty"`
    WithLocalDisks  int    `json:"with-local-disks,omitempty"`
}
```

### VirtualMachineCloneOptions

```go
type VirtualMachineCloneOptions struct {
    NewID       int    `json:"newid"`
    Name        string `json:"name,omitempty"`
    Target      string `json:"target,omitempty"`
    Full        int    `json:"full,omitempty"`
    Storage     string `json:"storage,omitempty"`
    Format      string `json:"format,omitempty"`
    Description string `json:"description,omitempty"`
    Snapname    string `json:"snapname,omitempty"`
    Pool        string `json:"pool,omitempty"`
}
```

### VirtualMachineMoveDiskOptions

```go
type VirtualMachineMoveDiskOptions struct {
    Disk       string `json:"disk"`
    Storage    string `json:"storage"`
    Format     string `json:"format,omitempty"`
    Delete     int    `json:"delete,omitempty"`
    TargetVMID int    `json:"target_vmid,omitempty"`
    TargetDisk string `json:"target-disk,omitempty"`
    Bwlimit    int    `json:"bwlimit,omitempty"`
}
```

### AgentNetworkIface / AgentOsInfo / AgentExecStatus

```go
type AgentNetworkIface struct {
    Name            string                 `json:"name"`
    HardwareAddress string                 `json:"hardware-address,omitempty"`
    IPAddresses     []*AgentNetworkIfaceIP `json:"ip-addresses,omitempty"`
}

type AgentOsInfo struct {
    KernelVersion string `json:"kernel-version"`
    ID            string `json:"id"`
    Name          string `json:"name"`
    PrettyName    string `json:"pretty-name"`
    Version       string `json:"version"`
    VersionID     string `json:"version-id"`
    Machine       string `json:"machine"`
}

type AgentExecStatus struct {
    Exited       int    `json:"exited"`
    ExitCode     int    `json:"exitcode"`
    Signal       int    `json:"signal,omitempty"`
    OutData      string `json:"out-data,omitempty"`
    ErrData      string `json:"err-data,omitempty"`
    OutTruncated string `json:"out-truncated,omitempty"`
    ErrTruncated string `json:"err-truncated,omitempty"`
}
```

## Container型

### Container

```go
type Container struct {
    client *Client
    Node   string  `json:"node"`
    VMID   int     `json:"vmid"`
    Name   string  `json:"name,omitempty"`
    Status string  `json:"status"`
    CPU    float64 `json:"cpu"`
    MaxCPU int     `json:"maxcpu"`
    Mem    int64   `json:"mem"`
    MaxMem int64   `json:"maxmem"`
    Disk   int64   `json:"disk"`
    MaxDisk int64  `json:"maxdisk"`
    Uptime int64   `json:"uptime"`
    PID    int64   `json:"pid,omitempty"`
    NetIn  int64   `json:"netin"`
    NetOut int64   `json:"netout"`
    DiskRead  int64 `json:"diskread"`
    DiskWrite int64 `json:"diskwrite"`
    Tags      string `json:"tags,omitempty"`
    ContainerConfig *ContainerConfig `json:"-"`
}
```

### ContainerConfig

```go
type ContainerConfig struct {
    Arch         string   `json:"arch,omitempty"`
    CMode        string   `json:"cmode,omitempty"`
    Console      int      `json:"console,omitempty"`
    Cores        int      `json:"cores,omitempty"`
    CPUlimit     int      `json:"cpulimit,omitempty"`
    CPUunits     int      `json:"cpuunits,omitempty"`
    Description  string   `json:"description,omitempty"`
    Features     string   `json:"features,omitempty"`
    Hookscript   string   `json:"hookscript,omitempty"`
    Hostname     string   `json:"hostname,omitempty"`
    Lock         string   `json:"lock,omitempty"`
    Memory       int64    `json:"memory,omitempty"`
    Nameserver   string   `json:"nameserver,omitempty"`
    Onboot       int      `json:"onboot,omitempty"`
    Ostype       string   `json:"ostype,omitempty"`
    Protection   int      `json:"protection,omitempty"`
    Rootfs       string   `json:"rootfs,omitempty"`
    Searchdomain string   `json:"searchdomain,omitempty"`
    Startup      string   `json:"startup,omitempty"`
    Swap         int64    `json:"swap,omitempty"`
    Tags         string   `json:"tags,omitempty"`
    TagsSlice    []string `json:"-"`
    Template     int      `json:"template,omitempty"`
    Timezone     string   `json:"timezone,omitempty"`
    Tty          int      `json:"tty,omitempty"`
    Unprivileged int      `json:"unprivileged,omitempty"`
    // マージ済みフィールド
    Devs    map[string]string `json:"-"`
    Mps     map[string]string `json:"-"`
    Nets    map[string]string `json:"-"`
    Unuseds map[string]string `json:"-"`
}
```

### ContainerOption

```go
type ContainerOption struct {
    Name  string
    Value interface{}
}
```

### ContainerCloneOptions / ContainerMigrateOptions

```go
type ContainerCloneOptions struct {
    NewID       int    `json:"newid"`
    Hostname    string `json:"hostname,omitempty"`
    Description string `json:"description,omitempty"`
    Target      string `json:"target,omitempty"`
    Pool        string `json:"pool,omitempty"`
    Snapname    string `json:"snapname,omitempty"`
    Full        int    `json:"full,omitempty"`
    Storage     string `json:"storage,omitempty"`
}

type ContainerMigrateOptions struct {
    Target  string `json:"target"`
    Online  int    `json:"online,omitempty"`
    Force   int    `json:"force,omitempty"`
    Restart int    `json:"restart,omitempty"`
    Bwlimit int    `json:"bwlimit,omitempty"`
}
```

## Task型

```go
type Task struct {
    client       *Client
    UPID         UPID   `json:"upid"`
    Node         string
    Type         string
    ID           string
    User         string
    Status       string `json:"status"`
    ExitStatus   string `json:"exitstatus,omitempty"`
    IsCompleted  bool
    IsRunning    bool
    IsSuccessful bool
    IsFailed     bool
    PID          int64  `json:"pid,omitempty"`
    PStart       int64  `json:"pstart,omitempty"`
    StartTime    int64  `json:"starttime,omitempty"`
}
```

UPIDはコロン区切り文字列で、パースしてNode/Type/ID/Userを抽出する。

## Storage型

### Storage（ノードレベル）

```go
type Storage struct {
    client  *Client
    Node    string `json:"-"`
    Name    string `json:"-"`
    Active  int    `json:"active"`
    Content string `json:"content"`
    Enabled int    `json:"enabled"`
    Shared  int    `json:"shared"`
    Total   int64  `json:"total"`
    Used    int64  `json:"used"`
    Avail   int64  `json:"avail"`
    Type    string `json:"type"`
    Storage string `json:"storage"`
}
```

### ClusterStorage / ClusterStorageOptions

```go
type ClusterStorage struct {
    client  *Client
    Content string `json:"content"`
    Digest  string `json:"digest"`
    Nodes   string `json:"nodes,omitempty"`
    Shared  int    `json:"shared,omitempty"`
    Storage string `json:"storage"`
    Type    string `json:"type"`
    Disable int    `json:"disable,omitempty"`
}

type ClusterStorageOptions struct {
    Name  string
    Value interface{}
}
```

## Firewall型

### FirewallRule

```go
type FirewallRule struct {
    Pos      int    `json:"pos,omitempty"`
    Action   string `json:"action"`
    Type     string `json:"type"`
    Dir      string `json:"dir,omitempty"`
    DPort    string `json:"dport,omitempty"`
    Dip      string `json:"dip,omitempty"`
    SPort    string `json:"sport,omitempty"`
    SIP      string `json:"sip,omitempty"`
    Proto    string `json:"proto,omitempty"`
    IcmpType string `json:"icmp-type,omitempty"`
    Iface    string `json:"iface,omitempty"`
    Log      string `json:"log,omitempty"`
    Comment  string `json:"comment,omitempty"`
    Macro    string `json:"macro,omitempty"`
    Enable   int    `json:"enable,omitempty"`
}
```

### FirewallIPSet / FirewallIPSetEntry

```go
type FirewallIPSet struct {
    Name    string `json:"name"`
    Comment string `json:"comment,omitempty"`
    Digest  string `json:"digest,omitempty"`
}

type FirewallIPSetEntry struct {
    CIDR    string `json:"cidr"`
    Comment string `json:"comment,omitempty"`
    Digest  string `json:"digest,omitempty"`
    Nomatch int    `json:"nomatch,omitempty"`
}
```

### FirewallNodeOption / FirewallVirtualMachineOption / FirewallSecurityGroup

```go
type FirewallNodeOption struct {
    Enable      int    `json:"enable,omitempty"`
    PolicyIn    string `json:"policy_in,omitempty"`
    PolicyOut   string `json:"policy_out,omitempty"`
    LogLevelIn  string `json:"log_level_in,omitempty"`
    LogLevelOut string `json:"log_level_out,omitempty"`
    Ntp         int    `json:"ntp,omitempty"`
    NDPP        int    `json:"ndp,omitempty"`
    DHCP        int    `json:"dhcp,omitempty"`
    MACFilter   int    `json:"macfilter,omitempty"`
}

type FirewallVirtualMachineOption struct {
    Enable    int    `json:"enable,omitempty"`
    PolicyIn  string `json:"policy_in,omitempty"`
    PolicyOut string `json:"policy_out,omitempty"`
    DHCP      int    `json:"dhcp,omitempty"`
    MACFilter int    `json:"macfilter,omitempty"`
    Ntp       int    `json:"ntp,omitempty"`
    NDPP      int    `json:"ndp,omitempty"`
}

type FirewallSecurityGroup struct {
    client  *Client
    Group   string           `json:"group"`
    Comment string           `json:"comment,omitempty"`
    Digest  string           `json:"digest,omitempty"`
    Rules   []*FirewallRule  `json:"-"`
}
```

## SDN型

```go
type VNet struct {
    Name    string `json:"name"`
    Type    string `json:"type"`
    Zone    string `json:"zone"`
    Comment string `json:"comment,omitempty"`
}

type VNetOptions struct {
    Name    string `json:"name"`
    Zone    string `json:"zone"`
    Comment string `json:"comment,omitempty"`
}

type VNetSubnet struct {
    Name    string `json:"name"`
    Network string `json:"network"`
    Snat    int    `json:"snat,omitempty"`
}

type SDNZone struct {
    Zone  string `json:"zone"`
    Type  string `json:"type"`
    Vnets string `json:"vnets,omitempty"`
    Nodes string `json:"nodes,omitempty"`
    IPAM  string `json:"ipam,omitempty"`
}

type SDNZoneOptions struct {
    Name  string `json:"zone"`
    Type  string `json:"type"`
    Vnets string `json:"vnets,omitempty"`
    Nodes string `json:"nodes,omitempty"`
    IPAM  string `json:"ipam,omitempty"`
}
```

## その他の型

### Pool

```go
type Pool struct {
    client  *Client
    PoolID  string              `json:"poolid"`
    Comment string              `json:"comment,omitempty"`
    Members []*ClusterResource  `json:"members,omitempty"`
}
```

### Snapshot / ContainerSnapshot

```go
type Snapshot struct {
    Name        string `json:"name"`
    Description string `json:"description,omitempty"`
    Parent      string `json:"parent,omitempty"`
    Snaptime    int64  `json:"snaptime,omitempty"`
    VMState     int    `json:"vmstate,omitempty"`
}

type ContainerSnapshot struct {
    Name        string `json:"name"`
    Description string `json:"description,omitempty"`
    Parent      string `json:"parent,omitempty"`
    Snaptime    int64  `json:"snaptime,omitempty"`
}
```

### RRDData / Timeframe / ConsolidationFunction

```go
type Timeframe string
const (
    HOURLY  Timeframe = "hour"
    DAILY   Timeframe = "day"
    WEEKLY  Timeframe = "week"
    MONTHLY Timeframe = "month"
    YEARLY  Timeframe = "year"
)

type ConsolidationFunction string
const (
    AVERAGE ConsolidationFunction = "AVERAGE"
    MAX     ConsolidationFunction = "MAX"
)

type RRDData struct {
    Time  int64   `json:"time"`
    Value float64 `json:"value"`
}
```

### PendingConfiguration

```go
type PendingConfiguration []*PendingConfigItem

type PendingConfigItem struct {
    Key    string `json:"key"`
    Value  string `json:"value,omitempty"`
    Delete int    `json:"delete,omitempty"`
}
```

### NodeNetwork

```go
type NodeNetwork struct {
    client      *Client
    Node        string `json:"-"`
    Iface       string `json:"-"`
    NodeAPI     *Node  `json:"-"`
    Type        string `json:"type,omitempty"`
    Method      string `json:"method,omitempty"`
    Address     string `json:"address,omitempty"`
    Netmask     string `json:"netmask,omitempty"`
    Gateway     string `json:"gateway,omitempty"`
    Method6     string `json:"method6,omitempty"`
    Address6    string `json:"address6,omitempty"`
    Netmask6    string `json:"netmask6,omitempty"`
    Gateway6    string `json:"gateway6,omitempty"`
    Autostart   int    `json:"autostart,omitempty"`
    Active      int    `json:"active,omitempty"`
    BridgePorts string `json:"bridge_ports,omitempty"`
    CIDR        string `json:"cidr,omitempty"`
    CIDR6       string `json:"cidr6,omitempty"`
    Comments    string `json:"comments,omitempty"`
    BondMode    string `json:"bond_mode,omitempty"`
    BondXmit    string `json:"bond_xmit,omitempty"`
    IFType      string `json:"iface_type,omitempty"`
    VLANID      int    `json:"vlan-id,omitempty"`
    VLANRaw     string `json:"vlan-raw-device,omitempty"`
}
```

### Access型

```go
type User struct {
    client    *Client
    UserID    string  `json:"userid"`
    Comment   string  `json:"comment,omitempty"`
    Email     string  `json:"email,omitempty"`
    Enable    int     `json:"enable,omitempty"`
    Expire    int64   `json:"expire,omitempty"`
    FirstName string  `json:"firstname,omitempty"`
    LastName  string  `json:"lastname,omitempty"`
    Groups    string  `json:"groups,omitempty"`
    Keys      string  `json:"keys,omitempty"`
}

type Group struct {
    client  *Client
    GroupID string   `json:"groupid"`
    Comment string   `json:"comment,omitempty"`
    Members []string `json:"members,omitempty"`
}

type Domain struct {
    client  *Client
    Realm   string     `json:"realm"`
    Type    DomainType `json:"type"`
    Comment string     `json:"comment,omitempty"`
}

type ACL struct {
    Path      string `json:"path"`
    Role      string `json:"role"`
    Type      string `json:"type"`
    UGID      string `json:"ugid"`
    Propagate int    `json:"propagate"`
}

type Token struct {
    TokenID string `json:"tokenid"`
    Comment string `json:"comment,omitempty"`
    PrivSep int    `json:"privsep,omitempty"`
}
```

## Client API

### 基本HTTPメソッド

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Req` | `(ctx, method, path string, data []byte, v interface{}) error` | 汎用リクエスト。自動認証・リトライ付き |
| `Get` | `(ctx, path string, v interface{}) error` | GET |
| `GetWithParams` | `(ctx, path string, d interface{}, v interface{}) error` | クエリパラメータ付きGET |
| `Post` | `(ctx, path string, d interface{}, v interface{}) error` | POST（dataをJSONマーシャル） |
| `Put` | `(ctx, path string, d interface{}, v interface{}) error` | PUT |
| `Delete` | `(ctx, path string, v interface{}) error` | DELETE |
| `Upload` | `(path string, fields map[string]string, file *os.File, v interface{}) error` | multipart/form-dataアップロード |

### 認証・アクセス管理

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Version` | `(ctx) (*Version, error)` | Proxmoxバージョン取得 |
| `Cluster` | `(ctx) (*Cluster, error)` | クラスタ情報取得 |
| `Nodes` | `(ctx) (NodeStatuses, error)` | ノード一覧 |
| `Node` | `(ctx, name string) (*Node, error)` | ノード取得 |
| `CreateSession` | `(ctx) error` | セッション作成 |
| `Ticket` | `(ctx, credentials *Credentials) (*Session, error)` | チケット取得 |
| `ACL` | `(ctx) (ACLs, error)` | ACL一覧 |
| `UpdateACL` | `(ctx, aclOptions ACLOptions) error` | ACL更新 |
| `Permissions` | `(ctx, o *PermissionsOptions) (Permissions, error)` | 権限取得 |
| `Password` | `(ctx, userid, password string) error` | パスワード変更 |

### ユーザー・グループ・ドメイン管理

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `NewUser` | `(ctx, user *NewUser) error` | ユーザー作成 |
| `User` | `(ctx, userid string) (*User, error)` | ユーザー取得 |
| `Users` | `(ctx) (Users, error)` | ユーザー一覧 |
| `NewGroup` | `(ctx, groupid, comment string) error` | グループ作成 |
| `Group` | `(ctx, groupid string) (*Group, error)` | グループ取得 |
| `Groups` | `(ctx) (Groups, error)` | グループ一覧 |
| `NewDomain` | `(ctx, realm string, domainType DomainType) error` | ドメイン作成 |
| `Domain` | `(ctx, realm string) (*Domain, error)` | ドメイン取得 |
| `Domains` | `(ctx) (Domains, error)` | ドメイン一覧 |

### Pool管理

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `NewPool` | `(ctx, poolid, comment string) error` | プール作成 |
| `Pools` | `(ctx) (Pools, error)` | プール一覧 |
| `Pool` | `(ctx, poolid string, filters ...string) (*Pool, error)` | プール取得（typeフィルタ可选） |

### Cluster Storage管理

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `ClusterStorages` | `(ctx) (ClusterStorages, error)` | 一覧 |
| `ClusterStorage` | `(ctx, name string) (*ClusterStorage, error)` | 取得 |
| `NewClusterStorage` | `(ctx, options ...ClusterStorageOptions) (*Task, error)` | 作成 |
| `UpdateClusterStorage` | `(ctx, name string, options ...ClusterStorageOptions) (*Task, error)` | 更新 |
| `DeleteClusterStorage` | `(ctx, name string) (*Task, error)` | 削除 |

### WebSocket

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `TermWebSocket` | `(path string, term *Term) (send, recv chan []byte, errs chan error, closer func() error, err error)` | ターミナルWS |
| `VNCWebSocket` | `(path string, vnc *VNC) (send, recv chan []byte, errs chan error, closer func() error, err error)` | VNC WS |

## Cluster メソッド

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Status` | `(ctx) error` | クラスタステータス |
| `NextID` | `(ctx) (int, error)` | 次の空きVMID |
| `CheckID` | `(ctx, vmid int) (bool, error)` | VMID空き確認 |
| `Resources` | `(ctx, filters ...string) (ClusterResources, error)` | リソース一覧 |
| `Tasks` | `(ctx) (Tasks, error)` | タスク一覧 |
| `Ceph` | `(ctx) (*Ceph, error)` | Ceph取得 |

### Cluster Firewall

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `FWGroups` | `(ctx) ([]*FirewallSecurityGroup, error)` | グループ一覧 |
| `FWGroup` | `(ctx, name string) (*FirewallSecurityGroup, error)` | グループ取得 |
| `NewFWGroup` | `(ctx, group *FirewallSecurityGroup) error` | グループ作成 |

### Cluster SDN

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `SDNVNets` | `(ctx) ([]*VNet, error)` | VNet一覧 |
| `SDNVNet` | `(ctx, name string) (*VNet, error)` | VNet取得 |
| `NewSDNVNet` | `(ctx, vnet *VNetOptions) error` | VNet作成 |
| `UpdateSDNVNet` | `(ctx, vnet *VNet) error` | VNet更新 |
| `DeleteSDNVNet` | `(ctx, name string) error` | VNet削除 |
| `SDNZones` | `(ctx, filters ...string) ([]*SDNZone, error)` | ゾーン一覧 |
| `SDNZone` | `(ctx, name string) (*SDNZone, error)` | ゾーン取得 |
| `NewSDNZone` | `(ctx, zone *SDNZoneOptions) error` | ゾーン作成 |
| `UpdateSDNZone` | `(ctx, zone *SDNZoneOptions) error` | ゾーン更新 |
| `DeleteSDNZone` | `(ctx, name string) error` | ゾーン削除 |
| `SDNSubnets` | `(ctx, VNetName string) ([]*VNetSubnet, error)` | サブネット一覧 |
| `SDNApply` | `(ctx) (*Task, error)` | SDN設定適用 |

### Ceph

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Status` | `(ctx) (*ClusterCephStatus, error)` | Cephステータス |

### FirewallSecurityGroup メソッド

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `GetRules` | `(ctx) ([]*FirewallRule, error)` | ルール一覧 |
| `Delete` | `(ctx) error` | グループ削除 |
| `RuleCreate` | `(ctx, rule *FirewallRule) error` | ルール作成 |
| `RuleUpdate` | `(ctx, rule *FirewallRule) error` | ルール更新 |
| `RuleDelete` | `(ctx, rulePos int) error` | ルール削除 |

## Node メソッド

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Status` | `(ctx) error` | ステータス更新 |
| `Version` | `(ctx) (*Version, error)` | バージョン取得 |
| `Report` | `(ctx) (string, error)` | レポート取得 |
| `TermProxy` | `(ctx) (*Term, error)` | ターミナルプロキシ |
| `TermWebSocket` | `(term *Term) (chan []byte, chan []byte, chan error, func() error, error)` | ターミナルWS |
| `VNCWebSocket` | `(vnc *VNC) (chan []byte, chan []byte, chan error, func() error, error)` | VNC WS |
| `VirtualMachines` | `(ctx) (VirtualMachines, error)` | VM一覧 |
| `VirtualMachine` | `(ctx, vmid int) (*VirtualMachine, error)` | 個別VM取得 |
| `NewVirtualMachine` | `(ctx, vmid int, options ...VirtualMachineOption) (*Task, error)` | VM作成 |
| `Containers` | `(ctx) (Containers, error)` | LXC一覧 |
| `Container` | `(ctx, vmid int) (*Container, error)` | 個別LXC取得 |
| `NewContainer` | `(ctx, vmid int, options ...ContainerOption) (*Task, error)` | LXC作成 |
| `Storages` | `(ctx) (Storages, error)` | ストレージ一覧 |
| `Storage` | `(ctx, name string) (*Storage, error)` | ストレージ取得 |
| `StorageISO` | `(ctx) (*Storage, error)` | ISOストレージ検索 |
| `StorageVZTmpl` | `(ctx) (*Storage, error)` | テンプレートストレージ検索 |
| `StorageBackup` | `(ctx) (*Storage, error)` | バックアップストレージ検索 |
| `StorageRootDir` | `(ctx) (*Storage, error)` | RootDirストレージ検索 |
| `StorageImages` | `(ctx) (*Storage, error)` | Imagesストレージ検索 |
| `StorageDownloadURL` | `(ctx, opts *StorageDownloadURLOptions) (string, error)` | URLからDL |
| `Appliances` | `(ctx) (Appliances, error)` | アプライアンス一覧 |
| `DownloadAppliance` | `(ctx, template, storage string) (string, error)` | アプライアンスDL |
| `VzTmpls` | `(ctx, storage string) (VzTmpls, error)` | LXCテンプレート一覧 |
| `VzTmpl` | `(ctx, template, storage string) (*VzTmpl, error)` | LXCテンプレート取得 |

### Node Firewall

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `FirewallOptionGet` | `(ctx) (*FirewallNodeOption, error)` | オプション取得 |
| `FirewallOptionSet` | `(ctx, opt *FirewallNodeOption) error` | オプション設定 |
| `FirewallGetRules` | `(ctx) ([]*FirewallRule, error)` | ルール一覧 |
| `FirewallRulesCreate` | `(ctx, rule *FirewallRule) error` | ルール作成 |
| `FirewallRulesUpdate` | `(ctx, rule *FirewallRule) error` | ルール更新 |

### Node Network

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `NewNetwork` | `(ctx, network *NodeNetwork) (*Task, error)` | 作成（自動リロード付き） |
| `Network` | `(ctx, iface string) (*NodeNetwork, error)` | 取得 |
| `Networks` | `(ctx, ifaceType ...string) (NodeNetworks, error)` | 一覧 |
| `NetworkReload` | `(ctx) (*Task, error)` | 設定リロード |
| `IPAM` | `(ctx) ([]*IPAM, error)` | IPAM情報 |

### NodeNetwork メソッド

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Update` | `(ctx) error` | 設定更新 |
| `Delete` | `(ctx) (*Task, error)` | 削除（自動リロード付き） |

## VirtualMachine メソッド

### ライフサイクル

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Ping` | `(ctx) error` | ステータス+設定更新 |
| `Start` | `(ctx) (*Task, error)` | 起動 |
| `Stop` | `(ctx) (*Task, error)` | 停止 |
| `Shutdown` | `(ctx) (*Task, error)` | シャットダウン |
| `Reboot` | `(ctx) (*Task, error)` | 再起動 |
| `Reset` | `(ctx) (*Task, error)` | リセット |
| `Delete` | `(ctx) (*Task, error)` | 削除（cloud-init ISOも自動削除） |

### 一時停止・再開

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Pause` | `(ctx) (*Task, error)` | 一時停止 |
| `Hibernate` | `(ctx) (*Task, error)` | ハイバネーション |
| `Resume` | `(ctx) (*Task, error)` | 再開 |
| `IsPaused` | `() bool` | 一時停止中か |
| `IsHibernated` | `() bool` | ハイバネーション中か |
| `IsRunning` | `() bool` | 実行中か |
| `IsStopped` | `() bool` | 停止中か |

### 設定・管理

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Config` | `(ctx, options ...VirtualMachineOption) (*Task, error)` | 設定変更 |
| `Monitor` | `(ctx, command string) (string, error)` | QEMUモニターコマンド |
| `Migrate` | `(ctx, params *VirtualMachineMigrateOptions) (*Task, error)` | マイグレーション |
| `Clone` | `(ctx, params *VirtualMachineCloneOptions) (int, *Task, error)` | クローン |
| `ResizeDisk` | `(ctx, disk, size string) (*Task, error)` | ディスクリサイズ |
| `UnlinkDisk` | `(ctx, diskID string, force bool) (*Task, error)` | ディスクアンリンク |
| `MoveDisk` | `(ctx, disk string, params *VirtualMachineMoveDiskOptions) (*Task, error)` | ディスク移動 |
| `ConvertToTemplate` | `(ctx) (*Task, error)` | テンプレート変換 |
| `Pending` | `(ctx) (*PendingConfiguration, error)` | 保留中の設定変更 |

### ターミナル・VNC

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `TermProxy` | `(ctx) (*Term, error)` | ターミナルプロキシ |
| `TermWebSocket` | `(term *Term) (chan []byte, chan []byte, chan error, func() error, error)` | ターミナルWS |
| `VNCProxy` | `(ctx, config *VNCConfig) (*VNC, error)` | VNCプロキシ |
| `VNCWebSocket` | `(vnc *VNC) (chan []byte, chan []byte, chan error, func() error, error)` | VNC WS |

### QEMU Agent

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `AgentGetNetworkIFaces` | `(ctx) ([]*AgentNetworkIface, error)` | NIC一覧（lo除外） |
| `AgentExec` | `(ctx, command []string, inputData string) (int, error)` | コマンド実行（PID返却） |
| `AgentExecStatus` | `(ctx, pid int) (*AgentExecStatus, error)` | 実行ステータス |
| `WaitForAgent` | `(ctx, seconds int) error` | Agent起動待ち |
| `WaitForAgentExecExit` | `(ctx, pid, seconds int) (*AgentExecStatus, error)` | コマンド終了待ち |
| `AgentOsInfo` | `(ctx) (*AgentOsInfo, error)` | OS情報 |
| `AgentSetUserPassword` | `(ctx, password, username string) error` | パスワード設定 |
| `SendKey` | `(ctx, key string) error` | キー送信 |

### Cloud-Init

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `CloudInit` | `(ctx, device, userdata, metadata, vendordata, networkconfig string) error` | ISO作成→アップロード→マウント |
| `UnmountCloudInitISO` | `(ctx, device string) error` | ISOアンマウント→削除 |

### Firewall

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `FirewallOptionGet` | `(ctx) (*FirewallVirtualMachineOption, error)` | オプション取得 |
| `FirewallOptionSet` | `(ctx, opt *FirewallVirtualMachineOption) error` | オプション設定 |
| `FirewallGetRules` | `(ctx) ([]*FirewallRule, error)` | ルール一覧 |
| `FirewallRulesCreate` | `(ctx, rule *FirewallRule) error` | ルール作成 |
| `FirewallRulesUpdate` | `(ctx, rule *FirewallRule) error` | ルール更新 |
| `FirewallRulesDelete` | `(ctx, rulePos int) error` | ルール削除 |
| `GetFirewallIPSet` | `(ctx) ([]*FirewallIPSet, error)` | IPSet一覧 |
| `NewFirewallIPSet` | `(ctx, ipset FirewallIPSetCreationOption) error` | IPSet作成 |
| `DeleteFirewallIPSet` | `(ctx, name string, force bool) error` | IPSet削除 |
| `GetFirewallIPSetEntries` | `(ctx, name string) ([]*FirewallIPSetEntry, error)` | エントリ一覧 |
| `NewFirewallIPSetEntry` | `(ctx, name string, entry FirewallIPSetEntryCreationOption) error` | エントリ作成 |
| `DeleteFirewallIPSetEntry` | `(ctx, name, cidr, digest string) error` | エントリ削除 |
| `GetFirewallIPSetEntry` | `(ctx, name, cidr string) (*FirewallIPSetEntry, error)` | エントリ取得 |
| `UpdateFirewallIPSetEntry` | `(ctx, name, cidr string, entry *FirewallIPSetEntryUpdateOption) error` | エントリ更新 |

### Snapshot

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Snapshots` | `(ctx) ([]*Snapshot, error)` | 一覧 |
| `NewSnapshot` | `(ctx, name string) (*Task, error)` | 作成 |
| `SnapshotRollback` | `(ctx, name string) (*Task, error)` | ロールバック |
| `DeleteSnapshot` | `(ctx, snapshot string) (*Task, error)` | 削除 |

### Tag管理

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `HasTag` | `(value string) bool` | 存在確認 |
| `AddTag` | `(ctx, value string) (*Task, error)` | 追加（重複時ErrNoop） |
| `RemoveTag` | `(ctx, value string) (*Task, error)` | 削除（不在時ErrNoop） |
| `SplitTags` | `()` | セミコロンで分割 |

### その他

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `RRDData` | `(ctx, timeframe Timeframe, cf ...ConsolidationFunction) ([]*RRDData, error)` | RRDデータ |

## Container (LXC) メソッド

### ライフサイクル

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Ping` | `(ctx) error` | ステータス更新 |
| `Start` | `(ctx) (*Task, error)` | 起動 |
| `Stop` | `(ctx) (*Task, error)` | 停止 |
| `Shutdown` | `(ctx, force bool, timeout int) (*Task, error)` | シャットダウン |
| `Reboot` | `(ctx) (*Task, error)` | 再起動 |
| `Suspend` | `(ctx) (*Task, error)` | 一時停止 |
| `Resume` | `(ctx) (*Task, error)` | 再開 |
| `Delete` | `(ctx) (*Task, error)` | 削除 |

### 設定・管理

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Config` | `(ctx, options ...ContainerOption) (*Task, error)` | 設定変更 |
| `Clone` | `(ctx, params *ContainerCloneOptions) (int, *Task, error)` | クローン |
| `Migrate` | `(ctx, params *ContainerMigrateOptions) (*Task, error)` | マイグレーション |
| `Resize` | `(ctx, disk, size string) (*Task, error)` | ディスクリサイズ |
| `MoveVolume` | `(ctx, params *VirtualMachineMoveDiskOptions) (*Task, error)` | ボリューム移動 |
| `Template` | `(ctx) error` | テンプレート変換 |
| `Feature` | `(ctx) (bool, error)` | 機能チェック |
| `Interfaces` | `(ctx) (ContainerInterfaces, error)` | NIC一覧 |

### ターミナル・VNC

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `TermProxy` | `(ctx) (*Term, error)` | ターミナルプロキシ |
| `TermWebSocket` | `(term *Term) (chan []byte, chan []byte, chan error, func() error, error)` | ターミナルWS |
| `VNCProxy` | `(ctx, vncOptions VNCProxyOptions) (*VNC, error)` | VNCプロキシ |
| `VNCWebSocket` | `(vnc *VNC) (chan []byte, chan []byte, chan error, func() error, error)` | VNC WS |

### Firewall

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Firewall` | `(ctx) (*Firewall, error)` | ファイアウォール情報 |
| `GetFirewallOptions` | `(ctx) (*FirewallVirtualMachineOption, error)` | オプション取得 |
| `UpdateFirewallOptions` | `(ctx, options *FirewallVirtualMachineOption) error` | オプション更新 |
| `FirewallRules` | `(ctx) ([]*FirewallRule, error)` | ルール一覧 |
| `NewFirewallRule` | `(ctx, rule *FirewallRule) error` | ルール作成 |
| `GetFirewallRule` | `(ctx, rulePos int) (*FirewallRule, error)` | ルール取得 |
| `UpdateFirewallRule` | `(ctx, rulePos int, rule *FirewallRule) error` | ルール更新 |
| `DeleteFirewallRule` | `(ctx, rulePos int) error` | ルール削除 |
| `GetFirewallAliases` | `(ctx) ([]*FirewallAlias, error)` | エイリアス一覧 |
| `NewFirewallAlias` | `(ctx, alias *FirewallAlias) error` | エイリアス作成 |
| `GetFirewallAlias` | `(ctx, name string) (*FirewallAlias, error)` | エイリアス取得 |
| `UpdateFirewallAlias` | `(ctx, name string, alias *FirewallAlias) error` | エイリアス更新 |
| `DeleteFirewallAlias` | `(ctx, name string) error` | エイリアス削除 |
| `GetFirewallIPSet` | `(ctx) ([]*FirewallIPSet, error)` | IPSet一覧 |
| `NewFirewallIPSet` | `(ctx, ipset FirewallIPSetCreationOption) error` | IPSet作成 |
| `DeleteFirewallIPSet` | `(ctx, name string, force bool) error` | IPSet削除 |
| `GetFirewallIPSetEntries` | `(ctx, name string) ([]*FirewallIPSetEntry, error)` | エントリ一覧 |
| `NewFirewallIPSetEntry` | `(ctx, name string, entry FirewallIPSetEntryCreationOption) error` | エントリ作成 |
| `DeleteFirewallIPSetEntry` | `(ctx, name, cidr, digest string) error` | エントリ削除 |
| `GetFirewallIPSetEntry` | `(ctx, name, cidr string) (*FirewallIPSetEntry, error)` | エントリ取得 |
| `UpdateFirewallIPSetEntry` | `(ctx, name, cidr string, entry *FirewallIPSetEntryUpdateOption) error` | エントリ更新 |

### Snapshot

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Snapshots` | `(ctx) ([]*ContainerSnapshot, error)` | 一覧 |
| `NewSnapshot` | `(ctx, snapName string) (*Task, error)` | 作成 |
| `GetSnapshot` | `(ctx, snapshot string) ([]*ContainerSnapshot, error)` | 取得 |
| `DeleteSnapshot` | `(ctx, snapshot string) (*Task, error)` | 削除 |
| `RollbackSnapshot` | `(ctx, snapshot string, start bool) (*Task, error)` | ロールバック |
| `GetSnapshotConfig` | `(ctx, snapshot string) (map[string]interface{}, error)` | 設定取得 |
| `UpdateSnapshot` | `(ctx, snapshot string) error` | 設定更新 |

### Tag管理

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `HasTag` | `(value string) bool` | 存在確認 |
| `AddTag` | `(ctx, value string) (*Task, error)` | 追加（重複時ErrNoop） |
| `RemoveTag` | `(ctx, value string) (*Task, error)` | 削除（不在時ErrNoop） |
| `SplitTags` | `()` | セミコロンで分割 |

### その他

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `RRDData` | `(ctx, timeframe Timeframe, cf ...ConsolidationFunction) ([]*RRDData, error)` | RRDデータ |

## Task メソッド

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Ping` | `(ctx) error` | ステータス更新。IsCompleted/IsRunning/IsSuccessful/IsFailedを設定 |
| `Stop` | `(ctx) error` | タスク停止 |
| `Log` | `(ctx, start, limit int) (Log, error)` | ログ取得（`Log`は`map[int]string`） |
| `Watch` | `(ctx, start int) (chan string, error)` | ログストリーム監視。完了でチャネル閉じる |
| `WaitFor` | `(ctx, seconds int) error` | 完了待ち（秒指定タイムアウト） |
| `Wait` | `(ctx, interval, max time.Duration) error` | 完了待ち（間隔・タイムアウト指定） |
| `WaitForCompleteStatus` | `(ctx, timesNum int, steps ...int) (status, completed bool, err error)` | 完了待ち（ステータス付き） |

`DefaultWaitInterval = 1 * time.Second`

## Storage メソッド（ノードレベル）

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Upload` | `(content, file string) (*Task, error)` | アップロード（"iso"/"vztmpl"/"import"） |
| `UploadWithName` | `(content, file, storageFilename string) (*Task, error)` | 名前指定アップロード |
| `UploadWithHash` | `(content, file string, storageFilename *string, checksum, algo string) (*Task, error)` | チェックサム付き |
| `DownloadURL` | `(ctx, content, filename, url string) (*Task, error)` | URLからDL |
| `DownloadURLWithHash` | `(ctx, content, filename, url, checksum, algo string) (*Task, error)` | チェックサム付きDL |
| `GetContent` | `(ctx) ([]*StorageContent, error)` | コンテンツ一覧 |
| `DeleteContent` | `(ctx, content string) (*Task, error)` | コンテンツ削除 |
| `ISO` | `(ctx, name string) (*ISO, error)` | ISO取得 |
| `VzTmpl` | `(ctx, name string) (*VzTmpl, error)` | LXCテンプレート取得 |

## User / Group / Domain メソッド

### User

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Update` | `(ctx, options UserOptions) error` | 更新 |
| `Delete` | `(ctx) error` | 削除 |
| `GetAPITokens` | `(ctx) (Tokens, error)` | APIトークン一覧 |

### Group

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Update` | `(ctx) error` | 更新 |
| `Delete` | `(ctx) error` | 削除 |

### Domain

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Update` | `(ctx) error` | 更新 |
| `Delete` | `(ctx) error` | 削除 |
| `Sync` | `(ctx, options DomainSyncOptions) error` | 同期 |

## Pool メソッド

| メソッド | シグネチャ | 説明 |
|----------|-----------|------|
| `Update` | `(ctx, opt *PoolUpdateOption) error` | 更新 |
| `Delete` | `(ctx) error` | 削除 |

## VirtualMachineConfig Merge ヘルパー

リフレクションでインデックス付きデバイスフィールドを`map[string]string`にマージ。

| メソッド | プレフィックス | 範囲 |
|----------|-------------|------|
| `MergeIDEs` | `"IDE"` | 0-3 |
| `MergeSCSIs` | `"SCSI"` | 0-30 |
| `MergeSATAs` | `"SATA"` | 0-5 |
| `MergeVirtIOs` | `"VirtIO"` | 0-15 |
| `MergeNets` | `"Net"` | 0-31 |
| `MergeUnuseds` | `"Unused"` | 0-13 |
| `MergeSerials` | `"Serial"` | 0-3 |
| `MergeUSBs` | `"USB"` | 0-3 |
| `MergeHostPCIs` | `"HostPCI"` | 0-3 |
| `MergeNumas` | `"Numa"` | 0-3 |
| `MergeParallels` | `"Parallel"` | 0-2 |
| `MergeIPConfigs` | `"IPConfig"` | 0-7 |
| `MergeDisks` | — | IDE+SCSI+SATA+VirtIOの全ディスク |

## ContainerConfig Merge ヘルパー

| メソッド | プレフィックス | 範囲 |
|----------|-------------|------|
| `MergeDevs` | `"Dev"` | 0-9 |
| `MergeMps` | `"Mp"` | 0-9 |
| `MergeNets` | `"Net"` | 0-9 |
| `MergeUnuseds` | `"Unused"` | 0-9 |

## エラーハンドリング

```go
var (
    ErrNotAuthorized  = errors.New("not authorized to access endpoint")
    ErrSessionExists  = errors.New("session already exists")
    ErrTimeout        = errors.New("the operation has timed out")
    ErrNotFound       = errors.New("unable to find the item you are looking for")
    ErrNoop           = errors.New("nothing to do")
)

proxmox.IsNotAuthorized(err)  // bool
proxmox.IsTimeout(err)        // bool
proxmox.IsNotFound(err)       // bool
proxmox.IsErrNoop(err)        // bool
```

## 定数

```go
const (
    DefaultUserAgent = "go-proxmox/dev"
    TagFormat        = "go-proxmox+%s"
    StatusVirtualMachineRunning = "running"
    StatusVirtualMachineStopped = "stopped"
    StatusVirtualMachinePaused  = "paused"
    UserDataISOFormat = "user-data-%d.iso"
    TagCloudInit      = "cloud-init"
    TagSeperator      = ";"
)
```

## 使用例: VM作成→起動→完了待ち→IP取得

```go
ctx := context.Background()

node, err := client.Node(ctx, "pve")
if err != nil {
    panic(err)
}

task, err := node.NewVirtualMachine(ctx, 100,
    proxmox.VirtualMachineOption{Name: "name", Value: "test-vm"},
    proxmox.VirtualMachineOption{Name: "cores", Value: 2},
    proxmox.VirtualMachineOption{Name: "memory", Value: 4096},
)
if err != nil {
    panic(err)
}

err = task.Wait(ctx, 5*time.Second, 300*time.Second)
if err != nil {
    panic(err)
}

vm, err := node.VirtualMachine(ctx, 100)
task, err = vm.Start(ctx)
err = task.WaitFor(ctx, 60)

err = vm.WaitForAgent(ctx, 120)
ifaces, err := vm.AgentGetNetworkIFaces(ctx)
for _, iface := range ifaces {
    for _, ip := range iface.IPAddresses {
        fmt.Println(ip.IPAddress)
    }
}
```
