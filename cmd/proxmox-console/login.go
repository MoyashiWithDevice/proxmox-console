package main

import (
	"context"
	"encoding/json"
	"io"
	"log"
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
			// Extract Kratos ID and store in request context
			body, _ := io.ReadAll(resp.Body)
			var whoamiResp struct {
				Identity struct {
					ID string `json:"id"`
				} `json:"identity"`
			}
			if err := json.Unmarshal(body, &whoamiResp); err == nil && whoamiResp.Identity.ID != "" {
				ctx := r.Context()
				ctx = context.WithValue(ctx, "kratosID", whoamiResp.Identity.ID)
				next(w, r.WithContext(ctx))
			} else {
				next(w, r)
			}
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

func requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return requireLogin(func(w http.ResponseWriter, r *http.Request) {
		isAPI := strings.HasPrefix(r.URL.Path, "/api/")
		kratosID, ok := r.Context().Value("kratosID").(string)
		if !ok || kratosID == "" {
			if isAPI {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
			} else {
				http.Redirect(w, r, "/login", http.StatusFound)
			}
			return
		}

		admin, err := isAdmin(kratosID)
		if err != nil || !admin {
			log.Printf("admin access denied for user %s: %v", kratosID, err)
			if isAPI {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]string{"error": "admin access required"})
			} else {
				http.Redirect(w, r, "/", http.StatusFound)
			}
			return
		}

		next(w, r)
	})
}
