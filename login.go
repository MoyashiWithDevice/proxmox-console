package main

import "net/http"

func requireLogin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {

		whoamiURL := AppConfig.Kratos.APIURL + "/sessions/whoami"
		req, _ := http.NewRequest("GET", whoamiURL, nil)

		for _, c := range r.Cookies() {
			req.AddCookie(c)
		}

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			http.Redirect(w, r, "/error.html?code=503", http.StatusFound)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusOK {
			next(w, r)
			return
		}

		if resp.StatusCode == http.StatusUnauthorized {
			http.Redirect(w, r, "/login", http.StatusFound)
			return
		}

		http.Redirect(w, r, "/error.html?code=500", http.StatusFound)
	}
}