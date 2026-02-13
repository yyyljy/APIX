package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Config struct {
	JWTSecret               []byte
	JWTIssuer               string
	JWTKeyID                string
	JWTTTL                  time.Duration
	RPCURL                  string
	RPCTimeout              time.Duration
	RPCMaxRetries           int
	EnableMockVerify        bool
	DefaultMinConfirmations uint64
	AllowAnyOrigin          bool
	AllowedOrigins          map[string]struct{}
}

var appConfig Config
var requestCounter uint64

type verificationRecord struct {
	Token     string
	ExpiresAt time.Time
	RequestID string
	TxHash    string
}

var verificationStore = struct {
	mu       sync.RWMutex
	byPair   map[string]verificationRecord
	byTxHash map[string]string
}{
	byPair:   map[string]verificationRecord{},
	byTxHash: map[string]string{},
}

// Request payload for verification
type VerifyRequest struct {
	TxHash           string `json:"tx_hash"`
	RequestID        string `json:"request_id,omitempty"`
	ChainID          int64  `json:"chain_id,omitempty"`
	Network          string `json:"network,omitempty"` // CAIP-2 style, e.g. eip155:43114
	Recipient        string `json:"recipient,omitempty"`
	AmountWei        string `json:"amount_wei,omitempty"`
	Currency         string `json:"currency,omitempty"`
	MinConfirmations uint64 `json:"min_confirmations,omitempty"`
}

// Response payload
type VerifyResponse struct {
	Valid     bool   `json:"valid"`
	Message   string `json:"message"`
	Token     string `json:"token,omitempty"`
	Code      string `json:"code,omitempty"`
	Retryable bool   `json:"retryable"`
	RequestID string `json:"request_id,omitempty"`
}

// Claims structure
type ApixClaims struct {
	TxHash      string `json:"tx_hash"`
	MaxRequests int    `json:"max_requests"`
	RequestID   string `json:"request_id,omitempty"`
	Network     string `json:"network,omitempty"`
	Recipient   string `json:"recipient,omitempty"`
	AmountWei   string `json:"amount_wei,omitempty"`
	ChainID     int64  `json:"chain_id,omitempty"`
	Currency    string `json:"currency,omitempty"`
	jwt.RegisteredClaims
}

type rpcRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      int         `json:"id"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   *rpcError       `json:"error"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type ethTransaction struct {
	Hash        string `json:"hash"`
	To          string `json:"to"`
	Value       string `json:"value"`
	BlockNumber string `json:"blockNumber"`
}

type ethTransactionReceipt struct {
	TransactionHash string `json:"transactionHash"`
	BlockNumber     string `json:"blockNumber"`
	Status          string `json:"status"`
}

func applyCORSHeaders(w http.ResponseWriter, r *http.Request, cfg Config) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		if cfg.AllowAnyOrigin {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, PAYMENT-SIGNATURE")
		return true
	}

	if cfg.AllowAnyOrigin {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, PAYMENT-SIGNATURE")
		return true
	}

	if _, ok := cfg.AllowedOrigins[origin]; !ok {
		return false
	}

	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Vary", "Origin")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, PAYMENT-SIGNATURE")
	return true
}

func ensureRequestID(r *http.Request, req *VerifyRequest) string {
	requestID := strings.TrimSpace(req.RequestID)
	if requestID == "" {
		requestID = getOrGenerateRequestID(strings.TrimSpace(r.Header.Get("X-Request-ID")))
	}
	req.RequestID = requestID
	return requestID
}

func getOrGenerateRequestID(requestID string) string {
	requestID = strings.TrimSpace(requestID)
	if requestID != "" {
		return requestID
	}
	next := atomic.AddUint64(&requestCounter, 1)
	return fmt.Sprintf("req_%d_%d", time.Now().UnixMilli(), next)
}

func logEvent(level, event string, fields map[string]interface{}) {
	payload := map[string]interface{}{
		"ts":    time.Now().UTC().Format(time.RFC3339Nano),
		"level": level,
		"event": event,
	}
	for k, v := range fields {
		payload[k] = v
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		log.Printf("event=%s level=%s marshal_error=%v", event, level, err)
		return
	}
	log.Print(string(encoded))
}

func pairKey(requestID, txHash string) string {
	return fmt.Sprintf("%s|%s", strings.TrimSpace(requestID), strings.ToLower(strings.TrimSpace(txHash)))
}

func getVerificationRecord(requestID, txHash string) (verificationRecord, bool) {
	now := time.Now()
	key := pairKey(requestID, txHash)

	verificationStore.mu.RLock()
	record, ok := verificationStore.byPair[key]
	verificationStore.mu.RUnlock()
	if !ok {
		return verificationRecord{}, false
	}
	if now.After(record.ExpiresAt) {
		removeVerificationRecord(record.RequestID, record.TxHash)
		return verificationRecord{}, false
	}
	return record, true
}

func getTxHashOwner(txHash string) (string, bool) {
	now := time.Now()
	normalizedTxHash := strings.ToLower(strings.TrimSpace(txHash))

	verificationStore.mu.RLock()
	requestID, ok := verificationStore.byTxHash[normalizedTxHash]
	verificationStore.mu.RUnlock()
	if !ok {
		return "", false
	}

	record, found := getVerificationRecord(requestID, normalizedTxHash)
	if !found || now.After(record.ExpiresAt) {
		removeVerificationRecord(requestID, normalizedTxHash)
		return "", false
	}
	return requestID, true
}

func saveVerificationRecord(requestID, txHash, token string, expiresAt time.Time) {
	record := verificationRecord{
		Token:     token,
		ExpiresAt: expiresAt,
		RequestID: strings.TrimSpace(requestID),
		TxHash:    strings.ToLower(strings.TrimSpace(txHash)),
	}
	key := pairKey(record.RequestID, record.TxHash)

	verificationStore.mu.Lock()
	verificationStore.byPair[key] = record
	verificationStore.byTxHash[record.TxHash] = record.RequestID
	verificationStore.mu.Unlock()
}

func removeVerificationRecord(requestID, txHash string) {
	normalizedTxHash := strings.ToLower(strings.TrimSpace(txHash))
	key := pairKey(requestID, normalizedTxHash)

	verificationStore.mu.Lock()
	delete(verificationStore.byPair, key)
	delete(verificationStore.byTxHash, normalizedTxHash)
	verificationStore.mu.Unlock()
}

func cleanupExpiredVerificationRecords(now time.Time) int {
	removed := 0
	verificationStore.mu.Lock()
	for key, record := range verificationStore.byPair {
		if now.After(record.ExpiresAt) {
			delete(verificationStore.byPair, key)
			delete(verificationStore.byTxHash, record.TxHash)
			removed++
		}
	}
	verificationStore.mu.Unlock()
	return removed
}

func verifyHandler(w http.ResponseWriter, r *http.Request) {
	startedAt := time.Now()
	requestID := getOrGenerateRequestID(strings.TrimSpace(r.Header.Get("X-Request-ID")))
	responseCode := "ok"
	statusCode := http.StatusOK
	outcome := "success"
	w.Header().Set("X-Request-ID", requestID)
	defer func() {
		logEvent("info", "verify.request_completed", map[string]interface{}{
			"request_id": requestID,
			"status":     statusCode,
			"code":       responseCode,
			"outcome":    outcome,
			"latency_ms": time.Since(startedAt).Milliseconds(),
		})
	}()

	if !applyCORSHeaders(w, r, appConfig) {
		outcome = "error"
		statusCode = http.StatusForbidden
		responseCode = "cors_origin_not_allowed"
		writeError(w, http.StatusForbidden, "cors_origin_not_allowed", "Origin is not allowed", false, "")
		return
	}

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		outcome = "error"
		statusCode = http.StatusMethodNotAllowed
		responseCode = "method_not_allowed"
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed", false, "")
		return
	}

	var req VerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		outcome = "error"
		statusCode = http.StatusBadRequest
		responseCode = "invalid_request_body"
		writeError(w, http.StatusBadRequest, "invalid_request_body", "Invalid request body", false, "")
		return
	}
	requestID = ensureRequestID(r, &req)
	w.Header().Set("X-Request-ID", requestID)

	if req.MinConfirmations == 0 {
		req.MinConfirmations = appConfig.DefaultMinConfirmations
	}
	if err := validateVerifyRequest(req, appConfig.EnableMockVerify); err != nil {
		outcome = "error"
		statusCode = http.StatusBadRequest
		responseCode = "invalid_request"
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error(), false, req.RequestID)
		return
	}

	logEvent("info", "verify.request_received", map[string]interface{}{
		"request_id": requestID,
		"tx_hash":    req.TxHash,
		"network":    req.Network,
		"chain_id":   req.ChainID,
	})

	if existingRecord, ok := getVerificationRecord(req.RequestID, req.TxHash); ok {
		logEvent("info", "verify.idempotent_hit", map[string]interface{}{
			"request_id": requestID,
			"tx_hash":    req.TxHash,
		})
		resp := VerifyResponse{
			Valid:     true,
			Message:   "Verification already processed",
			Token:     existingRecord.Token,
			RequestID: requestID,
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
		return
	}

	if ownerRequestID, exists := getTxHashOwner(req.TxHash); exists && ownerRequestID != req.RequestID {
		outcome = "error"
		statusCode = http.StatusForbidden
		responseCode = "tx_hash_already_used"
		writeError(w, http.StatusForbidden, "tx_hash_already_used", "Transaction hash already used by another request", false, requestID)
		return
	}

	if !appConfig.EnableMockVerify {
		if err := verifyOnChain(req, appConfig); err != nil {
			logEvent("warn", "verify.verification_failed", map[string]interface{}{
				"request_id": requestID,
				"tx_hash":    req.TxHash,
				"error":      err.Error(),
			})
			outcome = "error"
			statusCode = http.StatusForbidden
			responseCode = "verification_failed"
			writeError(w, http.StatusForbidden, "verification_failed", err.Error(), isRetryableVerificationError(err), req.RequestID)
			return
		}
	}

	claims := ApixClaims{
		TxHash:      req.TxHash,
		MaxRequests: 100,
		RequestID:   req.RequestID,
		Network:     req.Network,
		Recipient:   req.Recipient,
		AmountWei:   req.AmountWei,
		ChainID:     req.ChainID,
		Currency:    req.Currency,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(appConfig.JWTTTL)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    appConfig.JWTIssuer,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	token.Header["kid"] = appConfig.JWTKeyID
	tokenString, err := token.SignedString(appConfig.JWTSecret)
	if err != nil {
		logEvent("error", "verify.signing_failed", map[string]interface{}{
			"request_id": requestID,
			"error":      err.Error(),
		})
		outcome = "error"
		statusCode = http.StatusInternalServerError
		responseCode = "signing_error"
		writeError(w, http.StatusInternalServerError, "signing_error", "Internal server error", true, req.RequestID)
		return
	}
	saveVerificationRecord(req.RequestID, req.TxHash, tokenString, claims.ExpiresAt.Time)

	resp := VerifyResponse{
		Valid:     true,
		Message:   "Verification successful",
		Token:     tokenString,
		RequestID: req.RequestID,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
	logEvent("info", "verify.success", map[string]interface{}{
		"request_id": requestID,
		"tx_hash":    req.TxHash,
		"expires_at": claims.ExpiresAt.Time.UTC().Format(time.RFC3339),
	})
}

func loadConfig() (Config, error) {
	secret := strings.TrimSpace(os.Getenv("APIX_JWT_SECRET"))
	if secret == "" {
		return Config{}, errors.New("missing required env APIX_JWT_SECRET")
	}

	issuer := strings.TrimSpace(os.Getenv("APIX_JWT_ISSUER"))
	if issuer == "" {
		issuer = "apix-cloud"
	}

	keyID := strings.TrimSpace(os.Getenv("APIX_JWT_KID"))
	if keyID == "" {
		keyID = "v1"
	}

	ttlSeconds := 60
	if raw := strings.TrimSpace(os.Getenv("APIX_JWT_TTL_SECONDS")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v <= 0 {
			return Config{}, fmt.Errorf("invalid APIX_JWT_TTL_SECONDS: %q", raw)
		}
		ttlSeconds = v
	}

	enableMockVerify := strings.EqualFold(strings.TrimSpace(os.Getenv("APIX_ENABLE_MOCK_VERIFY")), "true")
	rpcURL := strings.TrimSpace(os.Getenv("APIX_RPC_URL"))
	if !enableMockVerify && rpcURL == "" {
		return Config{}, errors.New("missing required env APIX_RPC_URL (or set APIX_ENABLE_MOCK_VERIFY=true for local demo)")
	}
	rpcTimeoutMS := 8000
	if raw := strings.TrimSpace(os.Getenv("APIX_RPC_TIMEOUT_MS")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v <= 0 {
			return Config{}, fmt.Errorf("invalid APIX_RPC_TIMEOUT_MS: %q", raw)
		}
		rpcTimeoutMS = v
	}
	rpcMaxRetries := 2
	if raw := strings.TrimSpace(os.Getenv("APIX_RPC_MAX_RETRIES")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 0 {
			return Config{}, fmt.Errorf("invalid APIX_RPC_MAX_RETRIES: %q", raw)
		}
		rpcMaxRetries = v
	}

	minConf := uint64(1)
	if raw := strings.TrimSpace(os.Getenv("APIX_MIN_CONFIRMATIONS")); raw != "" {
		v, err := strconv.ParseUint(raw, 10, 64)
		if err != nil || v == 0 {
			return Config{}, fmt.Errorf("invalid APIX_MIN_CONFIRMATIONS: %q", raw)
		}
		minConf = v
	}

	allowAnyOrigin := true
	allowedOrigins := map[string]struct{}{}
	if raw := strings.TrimSpace(os.Getenv("APIX_ALLOWED_ORIGINS")); raw != "" {
		allowAnyOrigin = false
		for _, item := range strings.Split(raw, ",") {
			origin := strings.TrimSpace(item)
			if origin == "" {
				continue
			}
			if origin == "*" {
				allowAnyOrigin = true
				allowedOrigins = map[string]struct{}{}
				break
			}
			allowedOrigins[origin] = struct{}{}
		}
		if !allowAnyOrigin && len(allowedOrigins) == 0 {
			return Config{}, errors.New("invalid APIX_ALLOWED_ORIGINS: expected comma-separated origins or '*'")
		}
	}

	return Config{
		JWTSecret:               []byte(secret),
		JWTIssuer:               issuer,
		JWTKeyID:                keyID,
		JWTTTL:                  time.Duration(ttlSeconds) * time.Second,
		RPCURL:                  rpcURL,
		RPCTimeout:              time.Duration(rpcTimeoutMS) * time.Millisecond,
		RPCMaxRetries:           rpcMaxRetries,
		EnableMockVerify:        enableMockVerify,
		DefaultMinConfirmations: minConf,
		AllowAnyOrigin:          allowAnyOrigin,
		AllowedOrigins:          allowedOrigins,
	}, nil
}

func validateVerifyRequest(req VerifyRequest, enableMock bool) error {
	if strings.TrimSpace(req.TxHash) == "" {
		return errors.New("tx_hash is required")
	}
	if enableMock {
		return nil
	}
	if strings.TrimSpace(req.Network) == "" {
		return errors.New("network is required")
	}
	if strings.TrimSpace(req.Recipient) == "" {
		return errors.New("recipient is required")
	}
	if strings.TrimSpace(req.AmountWei) == "" {
		return errors.New("amount_wei is required")
	}
	return nil
}

func verifyOnChain(req VerifyRequest, cfg Config) error {
	var tx ethTransaction
	if err := rpcCall(cfg.RPCURL, "eth_getTransactionByHash", []interface{}{req.TxHash}, &tx); err != nil {
		return fmt.Errorf("failed to get transaction: %w", err)
	}
	if tx.Hash == "" {
		return errors.New("transaction not found")
	}
	if tx.BlockNumber == "" || tx.BlockNumber == "0x" {
		return errors.New("transaction is not confirmed yet")
	}

	var receipt ethTransactionReceipt
	if err := rpcCall(cfg.RPCURL, "eth_getTransactionReceipt", []interface{}{req.TxHash}, &receipt); err != nil {
		return fmt.Errorf("failed to get receipt: %w", err)
	}
	if receipt.TransactionHash == "" {
		return errors.New("transaction receipt not found")
	}
	if !strings.EqualFold(receipt.Status, "0x1") {
		return errors.New("transaction execution failed")
	}

	expectedRecipient := strings.ToLower(strings.TrimSpace(req.Recipient))
	actualRecipient := strings.ToLower(strings.TrimSpace(tx.To))
	if expectedRecipient != actualRecipient {
		return fmt.Errorf("recipient mismatch expected=%s actual=%s", req.Recipient, tx.To)
	}

	valueWei, ok := new(big.Int).SetString(strings.TrimPrefix(tx.Value, "0x"), 16)
	if !ok {
		return errors.New("failed to parse transaction value")
	}
	requiredWei, ok := new(big.Int).SetString(strings.TrimSpace(req.AmountWei), 10)
	if !ok {
		return errors.New("failed to parse amount_wei")
	}
	if valueWei.Cmp(requiredWei) < 0 {
		return fmt.Errorf("insufficient payment expected=%s actual=%s", req.AmountWei, valueWei.String())
	}

	if err := verifyNetwork(cfg.RPCURL, req); err != nil {
		return err
	}
	if err := verifyConfirmations(cfg.RPCURL, tx.BlockNumber, req.MinConfirmations); err != nil {
		return err
	}
	return nil
}

func verifyNetwork(rpcURL string, req VerifyRequest) error {
	networkChainID, err := chainIDFromNetwork(req.Network)
	if err != nil {
		return err
	}
	rpcChainID, err := getRPCChainID(rpcURL)
	if err != nil {
		return fmt.Errorf("failed to get chain id from rpc: %w", err)
	}
	if rpcChainID != networkChainID {
		return fmt.Errorf("network mismatch expected_chain=%d rpc_chain=%d", networkChainID, rpcChainID)
	}
	if req.ChainID != 0 && req.ChainID != networkChainID {
		return fmt.Errorf("chain_id mismatch request_chain=%d network_chain=%d", req.ChainID, networkChainID)
	}
	return nil
}

func verifyConfirmations(rpcURL, txBlockHex string, minConfirmations uint64) error {
	txBlock, err := hexToUint64(txBlockHex)
	if err != nil {
		return fmt.Errorf("failed to parse transaction block number: %w", err)
	}
	var latestBlockHex string
	if err := rpcCall(rpcURL, "eth_blockNumber", []interface{}{}, &latestBlockHex); err != nil {
		return fmt.Errorf("failed to get latest block number: %w", err)
	}
	latestBlock, err := hexToUint64(latestBlockHex)
	if err != nil {
		return fmt.Errorf("failed to parse latest block number: %w", err)
	}
	if latestBlock < txBlock {
		return errors.New("latest block is behind transaction block")
	}
	confirmations := latestBlock - txBlock + 1
	if confirmations < minConfirmations {
		return fmt.Errorf("insufficient confirmations required=%d actual=%d", minConfirmations, confirmations)
	}
	return nil
}

func getRPCChainID(rpcURL string) (int64, error) {
	var chainIDHex string
	if err := rpcCall(rpcURL, "eth_chainId", []interface{}{}, &chainIDHex); err != nil {
		return 0, err
	}
	parsed, err := hexToUint64(chainIDHex)
	if err != nil {
		return 0, err
	}
	return int64(parsed), nil
}

func chainIDFromNetwork(network string) (int64, error) {
	parts := strings.Split(strings.TrimSpace(network), ":")
	if len(parts) != 2 || parts[0] != "eip155" {
		return 0, fmt.Errorf("network must be CAIP-2 format eip155:<chain_id>, got %q", network)
	}
	chainID, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || chainID <= 0 {
		return 0, fmt.Errorf("invalid chain id in network %q", network)
	}
	return chainID, nil
}

func hexToUint64(hexValue string) (uint64, error) {
	cleaned := strings.TrimPrefix(strings.TrimSpace(hexValue), "0x")
	if cleaned == "" {
		return 0, errors.New("empty hex value")
	}
	return strconv.ParseUint(cleaned, 16, 64)
}

func rpcCall(rpcURL, method string, params interface{}, out interface{}) error {
	payload := rpcRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  method,
		Params:  params,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	timeout := appConfig.RPCTimeout
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	attempts := appConfig.RPCMaxRetries + 1
	if attempts < 1 {
		attempts = 1
	}

	var lastErr error
	client := &http.Client{Timeout: timeout}
	for attempt := 1; attempt <= attempts; attempt++ {
		req, err := http.NewRequest(http.MethodPost, rpcURL, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
		} else {
			respBody, readErr := io.ReadAll(resp.Body)
			resp.Body.Close()
			if readErr != nil {
				lastErr = readErr
			} else if resp.StatusCode >= 400 {
				lastErr = fmt.Errorf("rpc http error status=%d", resp.StatusCode)
			} else {
				var rpcResp rpcResponse
				if err := json.Unmarshal(respBody, &rpcResp); err != nil {
					lastErr = err
				} else if rpcResp.Error != nil {
					lastErr = fmt.Errorf("rpc error code=%d message=%s", rpcResp.Error.Code, rpcResp.Error.Message)
				} else if string(rpcResp.Result) == "null" {
					return nil
				} else if err := json.Unmarshal(rpcResp.Result, out); err != nil {
					lastErr = err
				} else {
					return nil
				}
			}
		}

		if attempt < attempts {
			time.Sleep(time.Duration(attempt) * 150 * time.Millisecond)
		}
	}
	return lastErr
}

func isRetryableVerificationError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	retryablePatterns := []string{
		"failed to get transaction",
		"failed to get receipt",
		"failed to get chain id from rpc",
		"failed to get latest block number",
		"rpc http error",
		"rpc error",
	}
	for _, pattern := range retryablePatterns {
		if strings.Contains(message, pattern) {
			return true
		}
	}
	return false
}

func writeError(w http.ResponseWriter, status int, code, message string, retryable bool, requestID string) {
	w.Header().Set("Content-Type", "application/json")
	if strings.TrimSpace(requestID) != "" {
		w.Header().Set("X-Request-ID", requestID)
	}
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(VerifyResponse{
		Valid:     false,
		Code:      code,
		Message:   message,
		Retryable: retryable,
		RequestID: requestID,
	})
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}
	appConfig = cfg

	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for now := range ticker.C {
			removed := cleanupExpiredVerificationRecords(now)
			if removed > 0 {
				logEvent("info", "verify.cleanup_expired_records", map[string]interface{}{
					"removed": removed,
				})
			}
		}
	}()

	http.HandleFunc("/v1/verify", verifyHandler)

	port := ":8080"
	fmt.Printf("Apix Cloud Server listening on %s (mock_verify=%v)\n", port, appConfig.EnableMockVerify)
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatal(err)
	}
}
