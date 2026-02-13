package main

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func resetVerificationStoreForTest() {
	verificationStore.mu.Lock()
	verificationStore.byPair = map[string]verificationRecord{}
	verificationStore.byTxHash = map[string]string{}
	verificationStore.mu.Unlock()
	atomic.StoreUint64(&requestCounter, 0)
}

func setupMockConfigForHandler() {
	appConfig = Config{
		JWTSecret:               []byte("test-secret"),
		JWTIssuer:               "apix-cloud-test",
		JWTKeyID:                "test-kid",
		JWTTTL:                  60 * time.Second,
		EnableMockVerify:        true,
		DefaultMinConfirmations: 1,
		AllowAnyOrigin:          true,
		AllowedOrigins:          map[string]struct{}{},
	}
}

func TestVerifyHandlerIdempotentReplayReturnsSameToken(t *testing.T) {
	resetVerificationStoreForTest()
	setupMockConfigForHandler()

	body := `{"tx_hash":"0xabc123","request_id":"req_1"}`

	firstReq := httptest.NewRequest(http.MethodPost, "/v1/verify", strings.NewReader(body))
	firstRes := httptest.NewRecorder()
	verifyHandler(firstRes, firstReq)
	if firstRes.Code != http.StatusOK {
		t.Fatalf("expected first request status 200, got %d", firstRes.Code)
	}

	var firstPayload VerifyResponse
	if err := json.Unmarshal(firstRes.Body.Bytes(), &firstPayload); err != nil {
		t.Fatalf("failed to decode first response: %v", err)
	}
	if firstPayload.Token == "" {
		t.Fatal("expected first token to be present")
	}

	secondReq := httptest.NewRequest(http.MethodPost, "/v1/verify", strings.NewReader(body))
	secondRes := httptest.NewRecorder()
	verifyHandler(secondRes, secondReq)
	if secondRes.Code != http.StatusOK {
		t.Fatalf("expected second request status 200, got %d", secondRes.Code)
	}

	var secondPayload VerifyResponse
	if err := json.Unmarshal(secondRes.Body.Bytes(), &secondPayload); err != nil {
		t.Fatalf("failed to decode second response: %v", err)
	}
	if secondPayload.Token != firstPayload.Token {
		t.Fatal("expected idempotent replay to return same token")
	}
}

func TestVerifyHandlerRejectsTxHashReuseAcrossRequestIDs(t *testing.T) {
	resetVerificationStoreForTest()
	setupMockConfigForHandler()

	firstReq := httptest.NewRequest(http.MethodPost, "/v1/verify", strings.NewReader(`{"tx_hash":"0xabc123","request_id":"req_1"}`))
	firstRes := httptest.NewRecorder()
	verifyHandler(firstRes, firstReq)
	if firstRes.Code != http.StatusOK {
		t.Fatalf("expected first request status 200, got %d", firstRes.Code)
	}

	secondReq := httptest.NewRequest(http.MethodPost, "/v1/verify", strings.NewReader(`{"tx_hash":"0xabc123","request_id":"req_2"}`))
	secondRes := httptest.NewRecorder()
	verifyHandler(secondRes, secondReq)
	if secondRes.Code != http.StatusForbidden {
		t.Fatalf("expected second request status 403, got %d", secondRes.Code)
	}

	var payload VerifyResponse
	if err := json.Unmarshal(secondRes.Body.Bytes(), &payload); err != nil {
		t.Fatalf("failed to decode second response: %v", err)
	}
	if payload.Code != "tx_hash_already_used" {
		t.Fatalf("expected tx_hash_already_used, got %s", payload.Code)
	}
}

func TestCleanupExpiredVerificationRecords(t *testing.T) {
	resetVerificationStoreForTest()

	saveVerificationRecord("req_active", "0xactive", "token_active", time.Now().Add(30*time.Second))
	saveVerificationRecord("req_expired", "0xexpired", "token_expired", time.Now().Add(-30*time.Second))

	removed := cleanupExpiredVerificationRecords(time.Now())
	if removed != 1 {
		t.Fatalf("expected 1 removed record, got %d", removed)
	}

	if _, ok := getVerificationRecord("req_active", "0xactive"); !ok {
		t.Fatal("expected active record to remain")
	}
	if _, ok := getVerificationRecord("req_expired", "0xexpired"); ok {
		t.Fatal("expected expired record to be removed")
	}
}

func TestWriteErrorIncludesStandardFields(t *testing.T) {
	w := httptest.NewRecorder()
	writeError(w, http.StatusForbidden, "verification_failed", "rpc http error status=503", true, "req_123")

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d", w.Code)
	}

	var response VerifyResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("failed to decode error response: %v", err)
	}
	if response.Valid {
		t.Fatal("expected valid=false")
	}
	if response.Code != "verification_failed" {
		t.Fatalf("unexpected code: %s", response.Code)
	}
	if !response.Retryable {
		t.Fatal("expected retryable=true")
	}
	if response.RequestID != "req_123" {
		t.Fatalf("unexpected request_id: %s", response.RequestID)
	}
}

func TestIsRetryableVerificationError(t *testing.T) {
	if isRetryableVerificationError(io.EOF) {
		t.Fatal("io.EOF should not be retryable")
	}

	if !isRetryableVerificationError(errors.New("failed to get receipt: rpc http error status=500")) {
		t.Fatal("expected retryable pattern to match")
	}

	if isRetryableVerificationError(errors.New("recipient mismatch expected=a actual=b")) {
		t.Fatal("recipient mismatch should not be retryable")
	}
}

func TestApplyCORSHeadersAllowlist(t *testing.T) {
	cfg := Config{
		AllowAnyOrigin: false,
		AllowedOrigins: map[string]struct{}{
			"http://localhost:5173": {},
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/v1/verify", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	w := httptest.NewRecorder()

	ok := applyCORSHeaders(w, req, cfg)
	if !ok {
		t.Fatal("expected origin to be allowed")
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Fatalf("unexpected allow-origin header: %s", got)
	}
}

func TestApplyCORSHeadersRejectUnknownOrigin(t *testing.T) {
	cfg := Config{
		AllowAnyOrigin: false,
		AllowedOrigins: map[string]struct{}{
			"http://localhost:5173": {},
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/v1/verify", nil)
	req.Header.Set("Origin", "http://localhost:9999")
	w := httptest.NewRecorder()

	ok := applyCORSHeaders(w, req, cfg)
	if ok {
		t.Fatal("expected origin to be rejected")
	}
}

func TestValidateVerifyRequest(t *testing.T) {
	err := validateVerifyRequest(VerifyRequest{}, true)
	if err == nil || err.Error() != "tx_hash is required" {
		t.Fatalf("expected tx_hash required error, got: %v", err)
	}

	err = validateVerifyRequest(VerifyRequest{
		TxHash:    "0xabc",
		Network:   "eip155:43114",
		Recipient: "0x1",
		AmountWei: "1",
	}, false)
	if err != nil {
		t.Fatalf("expected valid request, got: %v", err)
	}

	err = validateVerifyRequest(VerifyRequest{TxHash: "0xabc"}, false)
	if err == nil || err.Error() != "network is required" {
		t.Fatalf("expected network required error, got: %v", err)
	}
}

func TestChainIDFromNetwork(t *testing.T) {
	chainID, err := chainIDFromNetwork("eip155:43114")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if chainID != 43114 {
		t.Fatalf("expected 43114, got %d", chainID)
	}

	_, err = chainIDFromNetwork("avalanche:43114")
	if err == nil {
		t.Fatal("expected error for invalid network format")
	}
}

func TestHexToUint64(t *testing.T) {
	value, err := hexToUint64("0x1a")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if value != 26 {
		t.Fatalf("expected 26, got %d", value)
	}

	_, err = hexToUint64("0x")
	if err == nil {
		t.Fatal("expected error for empty hex value")
	}
}

func TestRPCCallRetryRecreatesRequestBody(t *testing.T) {
	var attempts int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("failed reading request body: %v", err)
		}
		if !strings.Contains(string(body), `"method":"eth_chainId"`) {
			t.Fatalf("unexpected request payload: %s", string(body))
		}

		currentAttempt := atomic.AddInt32(&attempts, 1)
		if currentAttempt == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"jsonrpc": "2.0",
			"id":      1,
			"result":  "0xa86a",
		})
	}))
	defer server.Close()

	appConfig = Config{
		RPCTimeout:    2 * time.Second,
		RPCMaxRetries: 1,
	}

	var chainIDHex string
	err := rpcCall(server.URL, "eth_chainId", []interface{}{}, &chainIDHex)
	if err != nil {
		t.Fatalf("expected rpcCall to succeed on retry, got: %v", err)
	}
	if chainIDHex != "0xa86a" {
		t.Fatalf("expected chain id 0xa86a, got: %s", chainIDHex)
	}
	if atomic.LoadInt32(&attempts) != 2 {
		t.Fatalf("expected 2 attempts, got %d", attempts)
	}
}
