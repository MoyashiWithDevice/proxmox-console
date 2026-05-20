package main
import (
	"os"
	"log"
	"encoding/json"
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