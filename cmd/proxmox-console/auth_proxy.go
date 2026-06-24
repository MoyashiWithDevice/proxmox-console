package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

var kratosHostPattern = regexp.MustCompile(`^https?://[^/]+`)

func rewriteLocation(location string, r *http.Request) string {
	if location == "" {
		return "/"
	}
	if strings.HasPrefix(location, "http://") || strings.HasPrefix(location, "https://") {
		origin := fmt.Sprintf("http://%s", r.Host)
		if strings.HasPrefix(location, AppConfig.Kratos.UIURL) || strings.HasPrefix(location, AppConfig.App.URL) {
			location = origin + strings.TrimPrefix(kratosHostPattern.ReplaceAllString(location, ""), "/")
			if location == origin+"/" {
				location = origin
			}
		}
	}
	return location
}

func proxyAuthHandler(flowType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		flowID := r.FormValue("flow")
		if flowID == "" {
			http.Error(w, "missing flow", http.StatusBadRequest)
			return
		}

		kratosAction := fmt.Sprintf("%s/self-service/%s?flow=%s",
			AppConfig.Kratos.BROWSERURL, flowType, url.QueryEscape(flowID))

		body := r.Form.Encode()
		req, err := http.NewRequest(http.MethodPost, kratosAction, strings.NewReader(body))
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
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadGateway)
			json.NewEncoder(w).Encode(map[string]string{"error": "authentication service unavailable"})
			return
		}
		defer resp.Body.Close()

		// Kratos returns 303/302 on success.  Response as JSON redirect_to
		// so fetch() doesn't follow cross-origin redirects automatically.
		if resp.StatusCode == http.StatusSeeOther || resp.StatusCode == http.StatusFound {
			for _, c := range resp.Header["Set-Cookie"] {
				w.Header().Add("Set-Cookie", c)
			}

			location := resp.Header.Get("Location")
			if location == "" {
				location = "/"
			} else {
				location = rewriteLocation(location, r)
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{
				"redirect_to": location,
			})
			return
		}

		// 200 OK means flow completed
		if resp.StatusCode == http.StatusOK {
			for _, c := range resp.Header["Set-Cookie"] {
				w.Header().Add("Set-Cookie", c)
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{
				"redirect_to": "/",
			})
			return
		}

		// Error responses (422, 400, etc.) contain updated flow JSON
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
