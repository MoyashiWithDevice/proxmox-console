package main
import (
	"encoding/json"
	"log"
	"os"
	"strings"
)

type ResourceLimit struct {
	Min  int `json:"min"`
	Max  int `json:"max"`
	Step int `json:"step,omitempty"`
}

type ResourceConstraints struct {
	CPU    ResourceLimit `json:"cpu"`
	Memory ResourceLimit `json:"memory"`
	HDD    ResourceLimit `json:"hdd"`
}

type SettingsConfig struct {
	Resources ResourceConstraints `json:"resources"`
}

type Config struct {
	Kratos struct {
		APIURL     string // サーバー間通信用 (例: http://kratos:4433)
		UIURL      string
	}

	App struct {
		URL string
	}

	Proxmox ProxmoxConfig
}

var AppConfig Config
var SettingsConf SettingsConfig

func (c *Config) KratosLoginURL() string {
	return c.Kratos.UIURL + "/login"
}

func mustGetenv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		log.Fatalf("environment variable %s is required", key)
	}
	return v
}

func loadConfig() {
	AppConfig = Config{}

	AppConfig.Kratos.APIURL     = mustGetenv("KRATOS_API_URL")
	AppConfig.Kratos.UIURL      = mustGetenv("KRATOS_UI_URL")
	AppConfig.App.URL           = mustGetenv("APP_URL")

	AppConfig.Proxmox.APIURL = os.Getenv("PROXMOX_API_URL")
	AppConfig.Proxmox.APITokenID = os.Getenv("PROXMOX_API_TOKEN_ID")
	AppConfig.Proxmox.APITokenSecret = os.Getenv("PROXMOX_API_TOKEN_SECRET")
	AppConfig.Proxmox.Username = os.Getenv("PROXMOX_USERNAME")
	AppConfig.Proxmox.Password = os.Getenv("PROXMOX_PASSWORD")
	AppConfig.Proxmox.InsecureSkipVerify = strings.EqualFold(os.Getenv("PROXMOX_INSECURE_SKIP_VERIFY"), "true")

	// Terraform 用環境変数を設定 (.env の値を TF_VAR_ 経由で Terraform に渡す)
	tfEndpoint := strings.TrimSuffix(AppConfig.Proxmox.APIURL, "/api2/json")
	os.Setenv("TF_VAR_proxmox_endpoint", tfEndpoint)
	os.Setenv("TF_VAR_proxmox_username", AppConfig.Proxmox.Username)
	os.Setenv("TF_VAR_proxmox_password", AppConfig.Proxmox.Password)

	// Load settings from setting.json
	loadSettingsConfig()
}

func loadSettingsConfig() {
	// Default values
	SettingsConf = SettingsConfig{
		Resources: ResourceConstraints{
			CPU:    ResourceLimit{Min: 1, Max: 3},
			Memory: ResourceLimit{Min: 512, Max: 4096, Step: 512},
			HDD:    ResourceLimit{Min: 1, Max: 64, Step: 1},
		},
	}

	// Try to load from setting.json
	data, err := os.ReadFile("setting.json")
	if err != nil {
		log.Println("Warning: could not read setting.json, using defaults:", err)
		return
	}

	err = json.Unmarshal(data, &SettingsConf)
	if err != nil {
		log.Println("Warning: could not parse setting.json, using defaults:", err)
	}
}