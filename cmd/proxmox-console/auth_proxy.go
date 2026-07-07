package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

// Kratos から返される Location ヘッダーには Kratos の base_url が含まれる。
// クライアントからのリクエスト origin に合わせて書き換えることで、
// クロスオリジンリダイレクトによる Cookie 未送信エラーを防ぐ。
var kratosHostPattern = regexp.MustCompile(`^https?://[^/]+`)

func rewriteLocation(location string, r *http.Request) string {
	if location == "" {
		return "/"
	}
	if strings.HasPrefix(location, "http://") || strings.HasPrefix(location, "https://") {
		origin := fmt.Sprintf("http://%s", r.Host)
		if strings.HasPrefix(location, AppConfig.Kratos.UIURL) || strings.HasPrefix(location, AppConfig.App.URL) {
			location = origin + kratosHostPattern.ReplaceAllString(location, "")
		}
	}
	return location
}

// proxyAuthHandler はログイン/登録フォームの送信を Kratos にプロキシする。
// native form submit (fetch ではなくフォームのネイティブ POST) に対応。
// 成功時は / へリダイレクト、失敗時はフォームを再描画してエラー表示。
func proxyAuthHandler(flowType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[proxy] %s request from %s", flowType, r.RemoteAddr)

		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// 登録は 2 段階 (traits.email → password) を 1 リクエストにまとめる
		if flowType == "registration" {
			handleCombinedRegistration(w, r)
			return
		}

		// ── ログイン ──
		flowID := r.FormValue("flow")
		if flowID == "" {
			http.Error(w, "missing flow", http.StatusBadRequest)
			return
		}

		kratosURL := fmt.Sprintf("%s/self-service/%s?flow=%s",
			AppConfig.Kratos.BROWSERURL, flowType, url.QueryEscape(flowID))

		body := r.Form.Encode()
		req, err := http.NewRequest(http.MethodPost, kratosURL, strings.NewReader(body))
		if err != nil {
			http.Error(w, "failed to create request", http.StatusInternalServerError)
			return
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

		for _, c := range r.Cookies() {
			req.AddCookie(c)
		}

		client := &http.Client{
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}

		resp, err := client.Do(req)
		if err != nil {
			http.Error(w, "authentication service unavailable", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		// Set-Cookie をブラウザへ転送
		for _, c := range resp.Header["Set-Cookie"] {
			w.Header().Add("Set-Cookie", c)
		}

		// 成功 (303/302/200) → / へリダイレクト
		if resp.StatusCode == http.StatusSeeOther || resp.StatusCode == http.StatusFound || resp.StatusCode == http.StatusOK {
			log.Printf("[proxy] %s success, redirecting to /", flowType)
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}

		// エラー (422 等) → Kratos の flow JSON を取得してフォーム再描画
		log.Printf("[proxy] %s error, status=%d, re-rendering form", flowType, resp.StatusCode)
		bodyBytes, _ := io.ReadAll(resp.Body)

		var flowData map[string]interface{}
		if err := json.Unmarshal(bodyBytes, &flowData); err == nil {
			serveSPAWithFlow(w, flowData)
			return
		}

		http.Error(w, "authentication failed", http.StatusInternalServerError)
	}
}

// handleCombinedRegistration は Registration の 2 段階 (traits.email → password) を
// 1 リクエストにまとめる。クライアントは email と password 両方を一度の送信で渡し、
// Go プロキシ側で 2 回の Kratos API 呼び出しを行う。
//
// 手順:
// 1. Kratos に traits.email + method=profile を送信
// 2. 成功したら更新 flow を取得し、バリデーションエラーをチェック
// 3. Kratos に password + method=password を送信
// 4. 両方成功したら自動ログインして / へリダイレクト
// 5. いずれかでエラーがあればフォームを再描画
func handleCombinedRegistration(w http.ResponseWriter, r *http.Request) {
	log.Printf("[combined-reg] start: flow=%s, email=%s",
		r.FormValue("flow"), r.FormValue("traits.email"))

	flowID := r.FormValue("flow")
	if flowID == "" {
		log.Printf("[combined-reg] missing flow")
		http.Error(w, "missing flow", http.StatusBadRequest)
		return
	}
	email := r.FormValue("traits.email")
	password := r.FormValue("password")
	if email == "" || password == "" {
		log.Printf("[combined-reg] missing email or password")
		http.Redirect(w, r, "/registration?flow="+url.QueryEscape(flowID), http.StatusSeeOther)
		return
	}

	// Step 1: traits.email + method=profile を送信
	flow1, err := fetchKratosFlow("/self-service/registration/flows?id="+flowID, r)
	if err != nil {
		log.Printf("[combined-reg] fetch initial flow failed: %v", err)
		http.Error(w, "authentication service unavailable", http.StatusBadGateway)
		return
	}

	csrf1 := extractCsrfToken(flow1)
	step1Body := url.Values{
		"csrf_token":   {csrf1},
		"traits.email": {email},
		"method":       {"profile"},
	}

	resp1, err := kratosPost("/self-service/registration?flow="+flowID, step1Body, r.Cookies())
	if err != nil {
		log.Printf("[combined-reg] step1 request failed: %v", err)
		http.Error(w, "authentication service unavailable", http.StatusBadGateway)
		return
	}
	defer resp1.Body.Close()

	// Set-Cookie をブラウザへ転送
	for _, c := range resp1.Cookies() {
		http.SetCookie(w, c)
	}

	log.Printf("[combined-reg] step1 response status=%d", resp1.StatusCode)

	// Step 1 失敗 → フォーム再描画
	if resp1.StatusCode != http.StatusSeeOther && resp1.StatusCode != http.StatusFound && resp1.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp1.Body)
		log.Printf("[combined-reg] step1 error, body=%s", string(bodyBytes))
		tryRenderAuthForm(w, bodyBytes, true)
		return
	}

	// Step 1 成功 → 更新 flow を取得してバリデーションエラーを確認
	flow2, err := fetchKratosFlow("/self-service/registration/flows?id="+flowID, r)
	if err != nil {
		log.Printf("[combined-reg] fetch updated flow failed: %v", err)
		http.Error(w, "authentication service unavailable", http.StatusBadGateway)
		return
	}

	if hasFlowErrors(flow2) {
		log.Printf("[combined-reg] step2 flow has errors")
		serveSPAWithFlow(w, flow2)
		return
	}

	// Step 2: password + method=password を送信
	csrf2 := extractCsrfToken(flow2)
	step2Body := url.Values{
		"csrf_token":   {csrf2},
		"traits.email": {email},
		"password":     {password},
		"method":       {"password"},
	}

	// Step 1 の Cookie を元 Cookie にマージ (Step 1 で更新された Cookie を優先)
	mergedCookies := mergeCookies(r.Cookies(), resp1.Cookies())
	resp2, err := kratosPost("/self-service/registration?flow="+flowID, step2Body, mergedCookies)
	if err != nil {
		log.Printf("[combined-reg] step2 request failed: %v", err)
		http.Error(w, "authentication service unavailable", http.StatusBadGateway)
		return
	}
	defer resp2.Body.Close()

	for _, c := range resp2.Cookies() {
		http.SetCookie(w, c)
	}

	log.Printf("[combined-reg] step2 response status=%d", resp2.StatusCode)

	// Step 2 成功 → 自動ログインして / へリダイレクト
	if resp2.StatusCode == http.StatusSeeOther || resp2.StatusCode == http.StatusFound || resp2.StatusCode == http.StatusOK {
		sessionCookie, err := performKratosLogin(email, password)
		if err == nil {
			log.Printf("[combined-reg] post-reg login OK, setting session cookie")
			http.SetCookie(w, sessionCookie)
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		log.Printf("[combined-reg] post-reg login failed: %v, redirecting to /login", err)
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	// Step 2 エラー → フォーム再描画
	bodyBytes, _ := io.ReadAll(resp2.Body)
	log.Printf("[combined-reg] step2 error, body=%s", string(bodyBytes))
	tryRenderAuthForm(w, bodyBytes, true)
}

// ── ヘルパー関数 ──

func kratosPost(path string, body url.Values, cookies []*http.Cookie) (*http.Response, error) {
	u := AppConfig.Kratos.BROWSERURL + path
	req, err := http.NewRequest("POST", u, strings.NewReader(body.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	return client.Do(req)
}

// mergeCookies は base に update の Cookie をマージする。
// update に同名の Cookie があれば base の値を更新する（update 優先）。
func mergeCookies(base, update []*http.Cookie) []*http.Cookie {
	m := make(map[string]*http.Cookie, len(base))
	for _, c := range base {
		m[c.Name] = c
	}
	for _, c := range update {
		m[c.Name] = c
	}
	merged := make([]*http.Cookie, 0, len(m))
	for _, c := range m {
		merged = append(merged, c)
	}
	return merged
}

func extractCsrfToken(flow map[string]interface{}) string {
	ui, _ := flow["ui"].(map[string]interface{})
	if ui == nil {
		return ""
	}
	nodes, _ := ui["nodes"].([]interface{})
	for _, n := range nodes {
		node, _ := n.(map[string]interface{})
		if node == nil {
			continue
		}
		attrs, _ := node["attributes"].(map[string]interface{})
		if attrs == nil {
			continue
		}
		if name, _ := attrs["name"].(string); name == "csrf_token" {
			val, _ := attrs["value"].(string)
			return val
		}
	}
	return ""
}

func hasFlowErrors(flow map[string]interface{}) bool {
	checkMessages := func(msgs []interface{}) bool {
		for _, m := range msgs {
			msg, _ := m.(map[string]interface{})
			if msg == nil {
				continue
			}
			if typ, _ := msg["type"].(string); typ == "error" {
				return true
			}
		}
		return false
	}

	ui, _ := flow["ui"].(map[string]interface{})
	if ui == nil {
		return false
	}

	// グローバルメッセージ
	if msgs, _ := ui["messages"].([]interface{}); len(msgs) > 0 {
		if checkMessages(msgs) {
			return true
		}
	}

	// ノード単位のメッセージ
	nodes, _ := ui["nodes"].([]interface{})
	for _, n := range nodes {
		node, _ := n.(map[string]interface{})
		if node == nil {
			continue
		}
		if msgs, _ := node["messages"].([]interface{}); len(msgs) > 0 {
			if checkMessages(msgs) {
				return true
			}
		}
	}
	return false
}

func createKratosFlowInternal(flowType string) (map[string]interface{}, []*http.Cookie, error) {
	req, err := http.NewRequest("GET", AppConfig.Kratos.BROWSERURL+"/self-service/"+flowType+"/browser", nil)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, nil, fmt.Errorf("kratos returned %d on flow creation", resp.StatusCode)
	}

	var flow map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&flow); err != nil {
		return nil, nil, err
	}
	return flow, resp.Cookies(), nil
}

// performKratosLogin は登録後の自動ログインに使用。email/password で Kratos にログインし、
// セッションクッキーを返す。
func performKratosLogin(email, password string) (*http.Cookie, error) {
	flow, cookies, err := createKratosFlowInternal("login")
	if err != nil {
		return nil, fmt.Errorf("create login flow: %w", err)
	}

	flowID, _ := flow["id"].(string)
	if flowID == "" {
		return nil, fmt.Errorf("flow id not found")
	}

	csrf := extractCsrfToken(flow)
	body := url.Values{
		"csrf_token": {csrf},
		"identifier": {email},
		"password":   {password},
		"method":     {"password"},
	}

	resp, err := kratosPost("/self-service/login?flow="+flowID, body, cookies)
	if err != nil {
		return nil, fmt.Errorf("login request: %w", err)
	}
	defer resp.Body.Close()

	for _, c := range resp.Cookies() {
		if c.Name == "ory_kratos_session" {
			return c, nil
		}
	}
	return nil, fmt.Errorf("session cookie not found (status=%d)", resp.StatusCode)
}

// tryRenderAuthForm は Kratos から返されたエラーレスポンス (flow JSON または raw body)
// をパースしてフロントエンド SPA を描画する。
func tryRenderAuthForm(w http.ResponseWriter, bodyBytes []byte, isRegistration bool) {
	var flowData map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &flowData); err == nil {
		serveSPAWithFlow(w, flowData)
	} else {
		http.Error(w, "authentication failed", http.StatusInternalServerError)
	}
}
