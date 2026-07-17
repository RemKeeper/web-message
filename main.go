package main

import (
	"encoding/json"
	"net/http"

	"github.com/syumai/workers"
)

type response struct {
	OK      bool   `json:"ok"`
	Service string `json:"service"`
	Runtime string `json:"runtime"`
}

func main() {
	workers.Serve(http.HandlerFunc(handleRequest))
}

func handleRequest(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	if req.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "content-type")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if req.Method != http.MethodGet || req.URL.Path != "/health" {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(response{
		OK:      true,
		Service: "web-message-signal",
		Runtime: "go-wasm",
	})
}
