package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

func getKratosUserIDFromRequest(r *http.Request) (string, error) {
	cookie, err := r.Cookie("ory_kratos_session")
	if err != nil {
		return "", fmt.Errorf("kratos session cookie not found: %w", err)
	}

	client := &http.Client{}
	url := AppConfig.Kratos.BROWSERURL + "/sessions/whoami"
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

// getDatabaseUserID は Kratos ID からデータベースのユーザーID を取得または作成します
func getDatabaseUserID(kratosID string) (int, error) {
	user, err := getOrCreateUser(kratosID)
	if err != nil {
		log.Printf("failed to get or create user for kratos id %s: %v", kratosID, err)
		return 0, err
	}
	return user.ID, nil
}

func hashRequest(req *VMRequest) (string, error) {
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}

	safe := struct {
		VM     *VMRequest
		Time   time.Time
		Random string
	}{
		VM:     req,
		Time:   time.Now(),
		Random: hex.EncodeToString(random),
	}

	b, err := json.Marshal(safe)
	if err != nil {
		return "", err
	}

	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:]), nil
}
