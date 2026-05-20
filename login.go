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
			http.Error(w, "auth service unavailable", http.StatusServiceUnavailable)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusOK {
			next(w, r)
			return
		}

		if resp.StatusCode == http.StatusUnauthorized {
			// Go 側の /login へリダイレクト。Kratos URL はブラウザに見せない
			http.Redirect(w, r, "/login", http.StatusFound)
			return
		}

		http.Error(w, "unexpected auth response", http.StatusInternalServerError)
	}
}