package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"log"
	"os"
	"path/filepath"
	"strings"
	"fmt"
	"net/url"
	"golang.org/x/crypto/ssh"
)

type ResourceLimit struct {
	Min  int `json:"min"`
	Max  int `json:"max"`
	Step int `json:"step,omitempty"`
}
type OSOption struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	// Terraformに渡すテンプレートID等、内部用フィールドは json:"-" で隠す
	TemplateID int    `json:"-"`
	Image      string `json:"image,omitempty"`
}
type ResourceConstraints struct {
	CPU    ResourceLimit `json:"cpu"`
	Memory ResourceLimit `json:"memory"`
	HDD    ResourceLimit `json:"hdd"`
}

type AgentConfig struct {
	User      string `json:"user"`
	PublicKey string `json:"-"`
}

type VLANConfig struct {
	Min int `json:"min"`
	Max int `json:"max"`
}

type SettingsConfig struct {
	Resources ResourceConstraints `json:"resources"`
	OS        []OSOption          `json:"os"`
	Agent     AgentConfig         `json:"agent"`
	VLAN      VLANConfig          `json:"vlan"`
}

type Config struct {
	Kratos struct {
		BROWSERURL string // サーバー間通信用 (例: http://kratos:4433)
		UIURL  string
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

func loadConfig() error {
	AppConfig = Config{}

	AppConfig.Kratos.BROWSERURL = mustGetenv("KRATOS_BROWSER_URL")
	AppConfig.Kratos.UIURL = mustGetenv("KRATOS_UI_URL")
	AppConfig.App.URL = mustGetenv("APP_URL")

	// TF_VAR_ プレフィックスの環境変数を Terraform と共通で使用
	rawEndpoint := os.Getenv("PROXMOX_VE_ENDPOINT")
	apiURL, err := url.JoinPath(rawEndpoint, "api2/json")
	if err != nil {
		return fmt.Errorf("failed to build endpoint url: %w", err)
	}
	AppConfig.Proxmox.APIURL = apiURL

	parts := strings.SplitN(os.Getenv("PROXMOX_VE_API_TOKEN"), "=", 2)
	if len(parts) == 2 {
		AppConfig.Proxmox.APITokenID     = parts[0]
		AppConfig.Proxmox.APITokenSecret = parts[1]
	}

	AppConfig.Proxmox.Username = os.Getenv("PROXMOX_VE_USERNAME")
	AppConfig.Proxmox.Password = os.Getenv("PROXMOX_VE_PASSWORD")
	AppConfig.Proxmox.InsecureSkipVerify = strings.EqualFold(os.Getenv("TF_VAR_proxmox_insecure"), "true")

	// Load settings from setting.json
	loadSettingsConfig()
	loadAgentKeys()

	return nil
}

func loadSettingsConfig() {
	// Default values
	SettingsConf = SettingsConfig{
		Resources: ResourceConstraints{
			CPU:    ResourceLimit{Min: 1, Max: 3},
			Memory: ResourceLimit{Min: 512, Max: 4096, Step: 512},
			HDD:    ResourceLimit{Min: 1, Max: 64, Step: 1},
		},
		OS: []OSOption{
			{ID: "ubuntu-24.04", Label: "Ubuntu 24.04 LTS", TemplateID: 9000},
		},
		Agent: AgentConfig{
			User: "agent",
		},
		VLAN: VLANConfig{
			Min: 100,
			Max: 500,
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

func loadAgentKeys() {
	certDir := filepath.Join("cert")
	if err := os.MkdirAll(certDir, 0700); err != nil {
		log.Fatalf("failed to create cert directory: %v", err)
	}

	privPath := filepath.Join(certDir, "agent_id_rsa")
	pubPath := privPath + ".pub"

	if _, err := os.Stat(privPath); err == nil {
		pubBytes, err := os.ReadFile(pubPath)
		if err == nil {
			SettingsConf.Agent.PublicKey = strings.TrimSpace(string(pubBytes))
			return
		}
	}

	privateKey, publicKey, err := generateSSHKeyPair()
	if err != nil {
		log.Fatalf("failed to generate agent SSH key: %v", err)
	}

	if err := os.WriteFile(privPath, privateKey, 0600); err != nil {
		log.Fatalf("failed to write agent private key: %v", err)
	}
	if err := os.WriteFile(pubPath, publicKey, 0644); err != nil {
		log.Fatalf("failed to write agent public key: %v", err)
	}

	SettingsConf.Agent.PublicKey = strings.TrimSpace(string(publicKey))
}

func generateSSHKeyPair() ([]byte, []byte, error) {
	key, err := rsa.GenerateKey(rand.Reader, 4096)
	if err != nil {
		return nil, nil, err
	}

	privDER := x509.MarshalPKCS1PrivateKey(key)
	privPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: privDER,
	})

	pubKey, err := ssh.NewPublicKey(&key.PublicKey)
	if err != nil {
		return nil, nil, err
	}
	pubBytes := ssh.MarshalAuthorizedKey(pubKey)

	return privPEM, pubBytes, nil
}
