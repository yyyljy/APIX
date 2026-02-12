package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Secret key for signing JWTs (Mock for MVP)
var jwtSecret = []byte("apix-mvp-secret-key")

// Request payload for verification
type VerifyRequest struct {
	TxHash string `json:"tx_hash"`
}

// Response payload
type VerifyResponse struct {
	Valid   bool   `json:"valid"`
	Message string `json:"message"`
	Token   string `json:"token,omitempty"`
}

// Claims structure
type ApixClaims struct {
	TxHash      string `json:"tx_hash"`
	MaxRequests int    `json:"max_requests"`
	jwt.RegisteredClaims
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

	// Create JWT
	claims := ApixClaims{
		TxHash:      req.TxHash,
		MaxRequests: 100, // Hardcoded limit for MVP
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(1 * time.Minute)), // 1 Minute Session
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "apix-cloud",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		log.Printf("Error signing token: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	resp := VerifyResponse{
		Valid:   true,
		Message: "Verification successful",
		Token:   tokenString,
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
