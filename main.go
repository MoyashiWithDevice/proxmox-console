package main

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"path/filepath"

	"github.com/amoghe/go-crypt"
	"github.com/joho/godotenv"
)

var PORT string

func main() {
	godotenv.Load()
	PORT = os.Getenv("PORT")
	loadConfig()

	// データベース初期化
	if err := initDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer closeDB()

	// エラーページは認証なしで配信
	http.HandleFunc("/error.html", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./static/error.html")
	})

	fs := http.FileServer(http.Dir("./static"))
	http.HandleFunc("/", requireLogin(func(w http.ResponseWriter, r *http.Request) {

		// ルートは dashboard.html を表示
		if r.URL.Path == "/" {
			http.ServeFile(w, r, "./static/dashboard.html")
			return
		}

		// 静的ファイルが存在しない場合は404エラーページへ
		fp := filepath.Join("./static", filepath.Clean(r.URL.Path))
		if info, err := os.Stat(fp); err != nil || info.IsDir() {
			http.Redirect(w, r, "/error.html?code=404", http.StatusFound)
			return
		}

		// それ以外は静的ファイルとして配信（一覧は出ない）
		fs.ServeHTTP(w, r)
	}))
	http.HandleFunc("/api/vms", requireLogin(userVMListHandler))
	http.HandleFunc("/api/vm", requireLogin(vmDetailHandler))
	http.HandleFunc("/api/vm/exec", requireLogin(vmExecHandler))
	http.HandleFunc("/api/vm/start", requireLogin(startVMHandler))
	http.HandleFunc("/api/vm/stop", requireLogin(stopVMHandler))
	http.HandleFunc("/api/create", requireLogin(createVMHandler))
	http.HandleFunc("/api/update", updateVMHandler)
	http.HandleFunc("/api/status", requireLogin(statusHandler))
	http.HandleFunc("/api/jobs", requireLogin(listJobsHandler))
	http.HandleFunc("/api/settings", settingsAPIHandler)
	http.HandleFunc("/api/support", requireLogin(supportHandler))
	http.HandleFunc("/logout", logoutHandler)
	http.HandleFunc("/login", loginUIHandler)
	http.HandleFunc("/registration", registrationUIHandler)
	http.HandleFunc("/error", errorUIHandler)

	fmt.Println("Server started")
	log.Fatal(http.ListenAndServe(":"+PORT, nil))
}

func logoutHandler(w http.ResponseWriter, r *http.Request) {
	returnTo := AppConfig.App.URL + "/login"
	kratosURL := AppConfig.Kratos.APIURL + "/self-service/logout/browser?return_to=" + url.QueryEscape(returnTo)

	req, err := http.NewRequest("GET", kratosURL, nil)
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusFound)
		return
	}
	for _, c := range r.Cookies() {
		req.AddCookie(c)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusFound)
		return
	}
	defer resp.Body.Close()

	var data struct {
		LogoutURL string `json:"logout_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil || data.LogoutURL == "" {
		http.Redirect(w, r, "/login", http.StatusFound)
		return
	}

	http.Redirect(w, r, data.LogoutURL, http.StatusFound)
}

func listJobsHandler(w http.ResponseWriter, r *http.Request) {
	type jobResp struct {
		ID         string `json:"id"`
		Status     string `json:"status"`
		IP         string `json:"ip"`
		Servername string `json:"servername"`
	}

	var result []jobResp
	jobs.Range(func(key, value interface{}) bool {
		j := value.(*Job)
		result = append(result, jobResp{
			ID:         key.(string),
			Status:     j.Status,
			IP:         j.IP,
			Servername: j.Servername,
		})
		return true
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func supportHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	userID, err := getKratosUserIDFromRequest(r)
	if err != nil {
		http.Error(w, "認証情報が取得できませんでした", http.StatusUnauthorized)
		return
	}

	var req struct {
		Subject string `json:"subject"`
		VMID    string `json:"vmid"`
		Details string `json:"details"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "リクエストの読み取りに失敗しました", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Subject) == "" || strings.TrimSpace(req.Details) == "" {
		http.Error(w, "件名と詳細は必須です。", http.StatusBadRequest)
		return
	}

	log.Printf("support request from user=%s vmid=%s subject=%s details=%s", userID, req.VMID, req.Subject, req.Details)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "サポート依頼を送信しました。"})
}

func copyFile(src, dst string) {
	input, err := os.ReadFile(src)
	if err != nil {
		fmt.Println("Error reading source file:", err)
		return
	}
	os.WriteFile(dst, input, 0644)
}

func runCmdWithLog(cmd *exec.Cmd, logFile *os.File) ([]byte, error) {
	var buf bytes.Buffer

	cmd.Stdout = io.MultiWriter(logFile, &buf)
	cmd.Stderr = io.MultiWriter(logFile, &buf)

	err := cmd.Run()
	if err != nil {
		log.Printf("Command failed: %v", err)
	}

	return buf.Bytes(), err
}

func hashPasswordForLinux(password string) (string, error) {
	// ランダムsalt生成（16byte）
	saltBytes := make([]byte, 16)
	_, err := rand.Read(saltBytes)
	if err != nil {
		fmt.Println("Error generating salt:", err)
		return "", err
	}

	salt := base64.RawStdEncoding.EncodeToString(saltBytes)

	// $6$ = SHA-512 crypt
	hash, err := crypt.Crypt(password, "$6$"+salt)
	if err != nil {
		fmt.Println("Error hashing password:", err)
		return "", err
	}

	return hash, nil
}
