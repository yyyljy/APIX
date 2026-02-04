package main

import (
	"fmt"
	"log"
	"net/http"
	"encoding/json"
)

// Request payload for verification
type VerifyRequest struct {
	TxHash string `json:"tx_hash"`
}

// Response payload
type VerifyResponse struct {
	Valid   bool   `json:"valid"`
	Message string `json:"message"`
	Token   string `json:"token,omitempty"` // Future: JWT
}

func verifyHandler(w http.ResponseWriter, r *http.Request) {
	// Enable CORS for frontend/demo-server
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req VerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	log.Printf("Received verification request for TxHash: %s", req.TxHash)

	// Mock Logic: Always return valid for now
	// Future: Check Avalanche L1 via RPC
	resp := VerifyResponse{
		Valid:   true,
		Message: "Mock verification successful",
		Token:   "mock-jwt-token-idx-123", 
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func main() {
	http.HandleFunc("/v1/verify", verifyHandler)

	port := ":8080"
	fmt.Printf("Apix Cloud Mock Server listening on %s...\n", port)
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatal(err)
	}
}
