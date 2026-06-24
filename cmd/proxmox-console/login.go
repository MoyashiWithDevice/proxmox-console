package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

func requireLogin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		isAPI := strings.HasPrefix(r.URL.Path, "/api/")

		whoamiURL := AppConfig.Kratos.BROWSERURL + "/sessions/whoami"
		req, _ := http.NewRequest("GET", whoamiURL, nil)

		for _, c := range r.Cookies() {
			req.AddCookie(c)
		}

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			if isAPI {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusServiceUnavailable)
				json.NewEncoder(w).Encode(map[string]string{"error": "authentication service unavailable"})
				return
			}
			http.Redirect(w, r, "/error?code=503", http.StatusFound)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusOK {
			next(w, r)
			return
		}

		if resp.StatusCode == http.StatusUnauthorized {
			if isAPI {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
				return
			}
			http.Redirect(w, r, "/login", http.StatusFound)
			return
		}

		if isAPI {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "authentication failed"})
			return
		}
		http.Redirect(w, r, "/error?code=500", http.StatusFound)
	}
}
