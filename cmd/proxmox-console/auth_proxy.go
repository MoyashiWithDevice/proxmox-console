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

// When Kratos sends a redirect in response to a login/registration,
// the Location URL uses Kratos's configured base_url / return_url
// (e.g. http://100.99.181.127:8080).  This rewrites the Location
// to match the origin of the incoming request, so the browser
// follows the redirect correctly (avoiding cross-origin redirect issues
// when the app is accessed via localhost vs an internal IP).
var kratosHostPattern = regexp.MustCompile(`^https?://[^/]+`)

func rewriteLocation(location string, r *http.Request) string {
	if location == "" {
		return "/"
	}
	// If the Location points to the same host as Kratos (e.g. the Kratos UI URL),
	// or to a hard-coded IP, rewrite it to the request's origin.
	// Otherwise return as-is (relative URLs are fine).
	if strings.HasPrefix(location, "http://") || strings.HasPrefix(location, "https://") {
		// Only rewrite if it looks like it's pointing at our app (not an external service)
		origin := fmt.Sprintf("http://%s", r.Host)
		if strings.HasPrefix(location, AppConfig.Kratos.UIURL) || strings.HasPrefix(location, AppConfig.App.URL) {
			location = origin + kratosHostPattern.ReplaceAllString(location, "")
			if location == origin+"/" {
				location = origin
			}
		}
	}
	return location
}

// proxyAuthHandler handles login/registration form submission by proxying to Kratos.
// This avoids CORS issues when the browser posts directly to Kratos's public API.
func proxyAuthHandler(flowType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[proxy] %s request received from %s, Content-Type: %s, flow: %s",
			flowType, r.RemoteAddr, r.Header.Get("Content-Type"), r.FormValue("flow"))

		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Registration は2段階フローを1リクエストにまとめる
		if flowType == "registration" {
			handleCombinedRegistration(w, r)
			return
		}

		flowID := r.FormValue("flow")
		if flowID == "" {
			http.Error(w, "missing flow", http.StatusBadRequest)
			return
		}

		// 以下、Login 用の既存ハンドラ

		// Build the Kratos self-service URL
		kratosAction := fmt.Sprintf("%s/self-service/%s?flow=%s",
			AppConfig.Kratos.BROWSERURL, flowType, url.QueryEscape(flowID))

	// Forward form data to Kratos
	body := r.Form.Encode()
	req, err := http.NewRequest(http.MethodPost, kratosAction, strings.NewReader(body))
		if err != nil {
			http.Error(w, "failed to create request", http.StatusInternalServerError)
			return
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

		// Forward cookies from the original request (csrf_token, session, etc.)
		for _, c := range r.Cookies() {
			req.AddCookie(c)
		}

		client := &http.Client{
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				// Don't follow redirects - we need to capture the 303 Location header
				return http.ErrUseLastResponse
			},
		}

		resp, err := client.Do(req)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadGateway)
			json.NewEncoder(w).Encode(map[string]string{"error": "authentication service unavailable"})
			return
		}
		defer resp.Body.Close()

		// If Kratos returns a redirect (303/302), forward the cookies and redirect the browser
		if resp.StatusCode == http.StatusSeeOther || resp.StatusCode == http.StatusFound {
			// Forward Set-Cookie headers from Kratos to the browser
			for _, c := range resp.Header["Set-Cookie"] {
				w.Header().Add("Set-Cookie", c)
			}

			location := resp.Header.Get("Location")
			if location == "" {
				location = "/"
			} else {
				location = rewriteLocation(location, r)
			}
			http.Redirect(w, r, location, http.StatusSeeOther)
			return
		}

		// For a successful response (200 OK), the flow completed - redirect to app root
		if resp.StatusCode == http.StatusOK {
			for _, c := range resp.Header["Set-Cookie"] {
				w.Header().Add("Set-Cookie", c)
			}
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}

		// For error responses (422, 400, etc.), Kratos returns updated flow JSON
		// Read the body and return it to the browser for re-rendering
		bodyBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			http.Error(w, "failed to read response", http.StatusInternalServerError)
			return
		}

		var flowData map[string]interface{}
		if err := json.Unmarshal(bodyBytes, &flowData); err == nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(resp.StatusCode)
			json.NewEncoder(w).Encode(flowData)
		} else {
			w.WriteHeader(resp.StatusCode)
			w.Write(bodyBytes)
		}
	}
}

// handleCombinedRegistration は Registration の2段階（email→password）を
// 1リクエストにまとめて処理する。
// 1. Kratos に traits.email + method=profile を送信
// 2. エラーがあれば flow JSON ごと返す
// 3. 正常なら Kratos に password + method=password を送信
// 4. 完了したら 303 リダイレクト、エラーなら flow JSON を返す
func handleCombinedRegistration(w http.ResponseWriter, r *http.Request) {
	log.Printf("[combined-reg] start: Content-Type=%s, flow=%s, email=%s",
		r.Header.Get("Content-Type"), r.FormValue("flow"), r.FormValue("traits.email"))

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
		http.Error(w, "email and password are required", http.StatusBadRequest)
		return
	}

	// Step 1: traits.email + method=profile を送信
	flow1, err := fetchKratosFlow("/self-service/registration/flows?id="+flowID, r)
	if err != nil {
		log.Printf("[combined-reg] fetch initial flow failed: %v", err)
		writeKratosError(w, http.StatusInternalServerError, "authentication service unavailable")
		return
	}
	log.Printf("[combined-reg] step1 flow fetched OK, has csrf=%v", extractCsrfToken(flow1) != "")

	csrf1 := extractCsrfToken(flow1)
	step1Body := url.Values{
		"csrf_token":   {csrf1},
		"traits.email": {email},
		"method":       {"profile"},
	}

	resp1, err := kratosPost("/self-service/registration?flow="+flowID, step1Body, r.Cookies())
	if err != nil {
		log.Printf("[combined-reg] step1 request failed: %v", err)
		writeKratosError(w, http.StatusBadGateway, "authentication service unavailable")
		return
	}
	defer resp1.Body.Close()

	log.Printf("[combined-reg] step1 response status=%d", resp1.StatusCode)

	// Kratos からの Set-Cookie を転送
	for _, c := range resp1.Cookies() {
		http.SetCookie(w, c)
	}

	// Step 1 が 303 以外 → エラーとして flow を返す
	if resp1.StatusCode != http.StatusSeeOther && resp1.StatusCode != http.StatusFound {
		bodyBytes, _ := io.ReadAll(resp1.Body)
		log.Printf("[combined-reg] step1 not redirect, body=%s", string(bodyBytes))
		tryReturnFlowAsJSON(w, resp1.StatusCode, bodyBytes)
		return
	}

	// Step 1 成功 → 更新された flow を取得してバリデーションエラーを確認
	flow2, err := fetchKratosFlow("/self-service/registration/flows?id="+flowID, r)
	if err != nil {
		log.Printf("[combined-reg] fetch updated flow failed: %v", err)
		writeKratosError(w, http.StatusInternalServerError, "authentication service unavailable")
		return
	}

	hasErrors := hasFlowErrors(flow2)
	log.Printf("[combined-reg] step2 flow fetched OK, has errors=%v", hasErrors)
	if hasFlowErrors(flow2) {
		// traits.email にエラーがある場合（重複・書式違反など）
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnprocessableEntity)
		json.NewEncoder(w).Encode(flow2)
		return
	}

	// Step 2: password + method=password を送信
	csrf2 := extractCsrfToken(flow2)
	log.Printf("[combined-reg] step2 csrf present=%v", csrf2 != "")
	step2Body := url.Values{
		"csrf_token":   {csrf2},
		"traits.email": {email},
		"password":     {password},
		"method":       {"password"},
	}

	resp2, err := kratosPost("/self-service/registration?flow="+flowID, step2Body, r.Cookies())
	if err != nil {
		log.Printf("[combined-reg] step2 request failed: %v", err)
		writeKratosError(w, http.StatusBadGateway, "authentication service unavailable")
		return
	}
	defer resp2.Body.Close()

	log.Printf("[combined-reg] step2 response status=%d", resp2.StatusCode)

	for _, c := range resp2.Cookies() {
		http.SetCookie(w, c)
	}

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

	// Step 2 エラー → flow JSON を返す
	bodyBytes, _ := io.ReadAll(resp2.Body)
	log.Printf("[combined-reg] step2 error status=%d body=%s", resp2.StatusCode, string(bodyBytes))
	tryReturnFlowAsJSON(w, resp2.StatusCode, bodyBytes)
}

// createKratosFlowInternal creates a login/registration flow server-to-server
// and returns the flow data + response cookies (no browser forwarding).
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

// performKratosLogin authenticates with email/password and returns the session cookie.
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

// --- helpers ---

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

func writeKratosError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func tryReturnFlowAsJSON(w http.ResponseWriter, statusCode int, bodyBytes []byte) {
	var flowData map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &flowData); err == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		json.NewEncoder(w).Encode(flowData)
	} else {
		w.WriteHeader(statusCode)
		w.Write(bodyBytes)
	}
}
