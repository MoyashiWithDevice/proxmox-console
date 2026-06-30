package main

import (
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"strconv"
)

type authPageData struct {
	Title          string
	FlowJSON       template.JS
	IsRegistration bool
}

var authTmpl = template.Must(template.ParseFiles("templates/auth.html"))

var errTmpl = template.Must(template.ParseGlob("templates/*.html"))

// createKratosFlow creates a new login/registration flow by calling Kratos
// server-side and forwards Set-Cookie headers to the browser.
func createKratosFlow(flowType string, w http.ResponseWriter, r *http.Request) (map[string]interface{}, error) {
	req, err := http.NewRequest("GET", AppConfig.Kratos.BROWSERURL+"/self-service/"+flowType+"/browser", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	for _, c := range r.Cookies() {
		req.AddCookie(c)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	for _, c := range resp.Header["Set-Cookie"] {
		w.Header().Add("Set-Cookie", c)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("kratos returned %d on flow creation", resp.StatusCode)
	}

	var flow map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&flow); err != nil {
		return nil, err
	}
	return flow, nil
}

func fetchKratosFlow(apiPath string, r *http.Request) (map[string]interface{}, error) {
	req, err := http.NewRequest("GET", AppConfig.Kratos.BROWSERURL+apiPath, nil)
	if err != nil {
		return nil, err
	}
	for _, c := range r.Cookies() {
		req.AddCookie(c)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("kratos returned %d", resp.StatusCode)
	}
	var flow map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&flow); err != nil {
		return nil, err
	}
	return flow, nil
}

func loginUIHandler(w http.ResponseWriter, r *http.Request) {
	flowID := r.URL.Query().Get("flow")
	if flowID == "" {
		flow, err := createKratosFlow("login", w, r)
		if err != nil {
			http.Error(w, "Failed to create login flow", http.StatusServiceUnavailable)
			return
		}
		flowJSON, _ := json.Marshal(flow)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		authTmpl.ExecuteTemplate(w, "auth.html", authPageData{Title: "Sign in", FlowJSON: template.JS(flowJSON), IsRegistration: false})
		return
	}
	flow, err := fetchKratosFlow("/self-service/login/flows?id="+flowID, r)
	if err != nil {
		http.Error(w, "Failed to fetch login flow", http.StatusServiceUnavailable)
		return
	}
	flowJSON, _ := json.Marshal(flow)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	authTmpl.ExecuteTemplate(w, "auth.html", authPageData{Title: "Sign in", FlowJSON: template.JS(flowJSON), IsRegistration: false})
}

func registrationUIHandler(w http.ResponseWriter, r *http.Request) {
	flowID := r.URL.Query().Get("flow")
	if flowID == "" {
		flow, err := createKratosFlow("registration", w, r)
		if err != nil {
			http.Error(w, "Failed to create registration flow", http.StatusServiceUnavailable)
			return
		}
		flowJSON, _ := json.Marshal(flow)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		authTmpl.ExecuteTemplate(w, "auth.html", authPageData{Title: "Create account", FlowJSON: template.JS(flowJSON), IsRegistration: true})
		return
	}
	flow, err := fetchKratosFlow("/self-service/registration/flows?id="+flowID, r)
	if err != nil {
		http.Error(w, "Failed to fetch registration flow", http.StatusServiceUnavailable)
		return
	}
	flowJSON, _ := json.Marshal(flow)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	authTmpl.ExecuteTemplate(w, "auth.html", authPageData{Title: "Create account", FlowJSON: template.JS(flowJSON), IsRegistration: true})
}

func errorUIHandler(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code != "" {
		var d struct {
			ErrCode, ErrTitle, ErrDesc string
		}
		d.ErrCode = code
		switch code {
		case "404":
			d.ErrTitle = "Not Found"
			d.ErrDesc = "お探しのページは存在しません。"
		case "500":
			d.ErrTitle = "Internal Server Error"
			d.ErrDesc = "サーバー内部でエラーが発生しました。"
		case "503":
			d.ErrTitle = "Service Unavailable"
			d.ErrDesc = "認証サービスが利用できません。"
		default:
			d.ErrTitle = "Unknown Error"
			d.ErrDesc = "不明なエラーが発生しました。"
		}
		statusCode := 500
		if c, err2 := strconv.Atoi(code); err2 == nil {
			statusCode = c
		}
		w.WriteHeader(statusCode)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		errTmpl.ExecuteTemplate(w, "error.html", d)
		return
	}

	errorID := r.URL.Query().Get("id")
	var flowJSON template.JS = template.JS("{}")
	if errorID != "" {
		flow, err := fetchKratosFlow("/self-service/errors?id="+errorID, r)
		if err == nil {
			b, _ := json.Marshal(flow)
			flowJSON = template.JS(b)
		}
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	authTmpl.ExecuteTemplate(w, "auth.html", authPageData{Title: "Error", FlowJSON: flowJSON})
}

