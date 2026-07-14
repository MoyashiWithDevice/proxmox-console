package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

var PORT string

func main() {
	godotenv.Load()
	PORT = os.Getenv("PORT")
	err := loadConfig()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// データベース初期化
	if err := initDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer closeDB()

	// SPA 静的アセット
	http.Handle("/assets/", http.FileServer(http.Dir("./static/dist")))

	http.HandleFunc("/", requireLogin(func(w http.ResponseWriter, r *http.Request) {
		// 静的ファイルが存在する場合はそれを配信
		fp := filepath.Join("./static/dist", filepath.Clean(r.URL.Path))
		if info, err := os.Stat(fp); err == nil && !info.IsDir() {
			http.FileServer(http.Dir("./static/dist")).ServeHTTP(w, r)
			return
		}

		// SPA fallback: それ以外は index.html を返す
		http.ServeFile(w, r, "static/dist/index.html")
	}))
	http.HandleFunc("/api/vms", requireLogin(userVMListHandler))
	http.HandleFunc("/api/vm", requireLogin(vmDetailHandler))
	http.HandleFunc("/api/vm/key", requireLogin(vmPrivateKeyHandler))
	http.HandleFunc("/api/vm/terminal", requireLogin(vmTerminalHandler))
	http.HandleFunc("/api/vm/retry", requireLogin(retryVMHandler))
	http.HandleFunc("/api/vm/state", requireLogin(chStateHandler))
	http.HandleFunc("/api/jobs", requireLogin(listJobsHandler))
	http.HandleFunc("/api/settings", requireLogin(settingsAPIHandler))
	http.HandleFunc("/api/iso/upload", requireLogin(uploadISOHandler))
	http.HandleFunc("/api/iso/download", requireLogin(downloadISOHandler))
	http.HandleFunc("/api/isos", requireLogin(listISOsHandler))
	http.HandleFunc("/api/support", requireLogin(supportHandler))
	http.HandleFunc("/api/auth/flow", authFlowAPIHandler)
	http.HandleFunc("/logout", requireLogin(logoutHandler))
	http.HandleFunc("/login", loginUIHandler)
	http.HandleFunc("/registration", registrationUIHandler)
	// Kratos プロキシエンドポイント - フォームからの POST を Kratos に転送
	http.HandleFunc("/api/auth/login", proxyAuthHandler("login"))
	http.HandleFunc("/api/auth/registration", proxyAuthHandler("registration"))
	http.HandleFunc("/error", errorUIHandler)

	fmt.Printf("Server started at %s\n", AppConfig.App.URL)
	log.Fatal(http.ListenAndServe(":"+PORT, loggingMiddleware(http.DefaultServeMux)))
}

func logoutHandler(w http.ResponseWriter, r *http.Request) {
	returnTo := AppConfig.App.URL + "/login"
	kratosURL := AppConfig.Kratos.BROWSERURL + "/self-service/logout/browser?return_to=" + url.QueryEscape(returnTo)

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

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			start := time.Now()
			log.Printf("[API] --> %s %s", r.Method, r.URL.Path)
			lw := &loggingResponseWriter{ResponseWriter: w, statusCode: 200}
			next.ServeHTTP(lw, r)
			log.Printf("[API] <-- %s %s %d %s", r.Method, r.URL.Path, lw.statusCode, time.Since(start).Round(time.Millisecond))
		} else {
			next.ServeHTTP(w, r)
		}
	})
}

type loggingResponseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (lw *loggingResponseWriter) WriteHeader(code int) {
	lw.statusCode = code
	lw.ResponseWriter.WriteHeader(code)
}
func (lw *loggingResponseWriter) Flush() {
	if flusher, ok := lw.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}
func (lw *loggingResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if h, ok := lw.ResponseWriter.(http.Hijacker); ok {
		return h.Hijack()
	}
	return nil, nil, fmt.Errorf("hijacker unsupported")
}
