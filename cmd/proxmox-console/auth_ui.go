package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
)

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

func authFlowAPIHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	flowType := r.URL.Query().Get("type")
	flowID := r.URL.Query().Get("flow")

	if flowType == "" || flowID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "missing type or flow parameter"})
		return
	}

	var apiPath string
	switch flowType {
	case "login":
		apiPath = "/self-service/login/flows?id=" + flowID
	case "registration":
		apiPath = "/self-service/registration/flows?id=" + flowID
	case "error":
		apiPath = "/self-service/errors?id=" + flowID
	default:
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "invalid flow type"})
		return
	}

	flow, err := fetchKratosFlow(apiPath, r)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	json.NewEncoder(w).Encode(flow)
}

func serveSPA(w http.ResponseWriter) {
	html, err := os.ReadFile("static/dist/index.html")
	if err != nil {
		http.Error(w, "Frontend not built", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write(html)
}

func serveSPAWithFlow(w http.ResponseWriter, flow map[string]interface{}) {
	html, err := os.ReadFile("static/dist/index.html")
	if err != nil {
		http.Error(w, "Frontend not built", http.StatusInternalServerError)
		return
	}
	b, _ := json.Marshal(flow)
	script := []byte(`<script>window.FLOW = ` + string(b) + `;</script>`)
	modified := strings.Replace(string(html), "<head>", "<head>"+string(script), 1)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(modified))
}

func loginUIHandler(w http.ResponseWriter, r *http.Request) {
	flowID := r.URL.Query().Get("flow")
	if flowID == "" {
		flow, cookies, err := createKratosFlowInternal("login", r.Cookies())
		if err != nil {
			http.Error(w, "Failed to create login flow", http.StatusInternalServerError)
			return
		}
		for _, c := range cookies {
			http.SetCookie(w, c)
		}
		if id, ok := flow["id"].(string); ok {
			http.Redirect(w, r, "/login?flow="+id, http.StatusFound)
			return
		}
		http.Error(w, "Failed to get flow id", http.StatusInternalServerError)
		return
	}
	serveSPA(w)
}

func registrationUIHandler(w http.ResponseWriter, r *http.Request) {
	flowID := r.URL.Query().Get("flow")
	if flowID == "" {
		flow, cookies, err := createKratosFlowInternal("registration", r.Cookies())
		if err != nil {
			http.Error(w, "Failed to create registration flow", http.StatusInternalServerError)
			return
		}
		for _, c := range cookies {
			http.SetCookie(w, c)
		}
		if id, ok := flow["id"].(string); ok {
			http.Redirect(w, r, "/registration?flow="+id, http.StatusFound)
			return
		}
		http.Error(w, "Failed to get flow id", http.StatusInternalServerError)
		return
	}
	serveSPA(w)
}

func errorUIHandler(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code != "" {
		statusCode := 500
		if c, err2 := strconv.Atoi(code); err2 == nil {
			statusCode = c
		}
		w.WriteHeader(statusCode)
		serveSPA(w)
		return
	}

	errorID := r.URL.Query().Get("id")
	if errorID != "" {
		flow, err := fetchKratosFlow("/self-service/errors?id="+errorID, r)
		if err == nil {
			serveSPAWithFlow(w, flow)
			return
		}
	}
	serveSPA(w)
}
