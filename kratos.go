package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
)

func getKratosUserIDFromRequest(r *http.Request) (string, error) {
	cookie, err := r.Cookie("ory_kratos_session")
	if err != nil {
		return "", fmt.Errorf("kratos session cookie not found: %w", err)
	}

	client := &http.Client{}
	url := AppConfig.Kratos.APIURL + "/sessions/whoami"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}

	req.AddCookie(cookie)
	req.Header = r.Header.Clone()

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("kratos whoami failed: %s", resp.Status)
	}

	var data struct {
		Identity struct {
			ID string `json:"id"`
		} `json:"identity"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", err
	}

	return data.Identity.ID, nil
}

func hashRequest(req *VMRequest) (string, error) {
	safe := struct {
		CPU        int
		Memory     int
		HDD        int
		Servername string
		Username   string
	}{
		CPU:        req.CPU,
		Memory:     req.Memory,
		HDD:        req.HDD,
		Servername: req.Servername,
		Username:   req.Username,
	}

	b, err := json.Marshal(safe)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:]), nil
}