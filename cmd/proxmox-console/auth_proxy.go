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
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		flowID := r.FormValue("flow")
		if flowID == "" {
			http.Error(w, "missing flow", http.StatusBadRequest)
			return
		}

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
