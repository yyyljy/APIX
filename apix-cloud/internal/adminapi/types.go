package adminapi

import "time"

// HealthResponse matches GET /v1/health.
type HealthResponse struct {
	Status         string  `json:"status"`
	CheckedAt      string  `json:"checked_at"`
	ChainID        int64   `json:"chain_id,omitempty"`
	WSConnected    bool    `json:"websocket_connected,omitempty"`
	KafkaHealthy   bool    `json:"kafka_healthy,omitempty"`
	LagMS          float64 `json:"lag_ms,omitempty"`
	ServiceVersion string  `json:"service_version,omitempty"`
}

// Shared pagination shape.
type PageInfo struct {
	Page     int    `json:"page"`
	Size     int    `json:"size"`
	Total    int    `json:"total"`
	HasMore  bool   `json:"has_more"`
	NextCursor string `json:"next_cursor,omitempty"`
	PrevCursor string `json:"prev_cursor,omitempty"`
}

// Event list response shape.
type L1Event struct {
	EventID         string `json:"event_id"`
	DedupeKey       string `json:"dedupe_key"`
	ChainID         int64  `json:"chain_id"`
	BlockNumber     uint64 `json:"block_number"`
	BlockHash       string `json:"block_hash"`
	TxHash          string `json:"tx_hash"`
	LogIndex        uint64 `json:"log_index"`
	ContractAddress string `json:"contract_address"`
	EventType       string `json:"event_type"`
	Wallet          string `json:"wallet"`
	APIID           string `json:"api_id"`
	PlanID          string `json:"plan_id"`
	Amount          string `json:"amount"`
	TokenSymbol     string `json:"token_symbol"`
	Status          string `json:"status"`
	Source          string `json:"source"`
	Timestamp       string `json:"timestamp"`
}

type EventListResponse struct {
	Items []L1Event `json:"items"`
	Page  PageInfo  `json:"page"`
}

type ListEventsQuery struct {
	Wallet    string
	EventType string
	APIID     string
	From      *time.Time
	To        *time.Time
	Status    string
	Page      int
	Size      int
}

// Risk alert list response shape.
type RiskAlert struct {
	AlertID    string    `json:"alert_id"`
	Wallet     string    `json:"wallet"`
	RiskScore  float64   `json:"risk_score"`
	RiskGrade  string    `json:"risk_grade"`
	Status     string    `json:"status"`
	RuleIDs    []string  `json:"rule_ids"`
	Reasons    []string  `json:"reasons"`
	CreatedAt  string    `json:"created_at"`
	UpdatedAt  string    `json:"updated_at"`
	AssignedTo string    `json:"assigned_to,omitempty"`
	TTL        int       `json:"ttl_sec"`
}

type RiskAlertListResponse struct {
	Items []RiskAlert `json:"items"`
	Page  PageInfo    `json:"page"`
}

type RiskScoreResponse struct {
	Wallet     string                 `json:"wallet"`
	RiskScore  float64                `json:"risk_score"`
	RiskGrade  string                 `json:"risk_grade"`
	Signals    map[string]interface{} `json:"signals"`
	ComputedAt string                 `json:"computed_at"`
	TTL        int                    `json:"ttl_sec"`
}

type RiskAlertAckRequest struct {
	Status string `json:"status"`
	Note   string `json:"note,omitempty"`
	AssignedTo string `json:"assigned_to,omitempty"`
}

type RiskAlertResponse struct {
	RiskAlert
	Comment string `json:"comment,omitempty"`
}

type LagSnapshotResponse struct {
	KafkaLag          int64  `json:"kafka_lag"`
	WSLagSeconds      float64 `json:"ws_lag_seconds"`
	MismatchCount     int64  `json:"mismatch_count"`
	LatestBlock       uint64 `json:"latest_block"`
	LastReconciledBlock uint64 `json:"last_reconciled_block"`
}

type ReplayRequest struct {
	FromBlock int64  `json:"from_block"`
	ToBlock   int64  `json:"to_block"`
	Reason    string `json:"reason,omitempty"`
}

type ReplayResponse struct {
	JobID    string `json:"job_id"`
	Accepted bool   `json:"accepted"`
	ExpectedRecords int64 `json:"expected_records"`
}

type RuleReloadRequest struct {
	DryRun bool `json:"dry_run"`
	Force  bool `json:"force"`
}

type RuleReloadResponse struct {
	AppliedVersion string `json:"applied_version"`
	RulesLoaded   int    `json:"rules_loaded"`
	Changed       bool   `json:"changed"`
	StartedAt     string `json:"started_at"`
}

type WebhookEnvelope struct {
	Source    string                 `json:"source"`
	EventType string                 `json:"event_type"`
	EventID   string                 `json:"event_id"`
	Payload   map[string]interface{} `json:"payload"`
	ReceivedAt string                `json:"received_at"`
	Signature string                 `json:"signature,omitempty"`
}

type WebhookResponse struct {
	Accepted bool   `json:"accepted"`
	Message  string `json:"message"`
}

type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	RequestID string `json:"request_id,omitempty"`
}

type ServiceConfig struct {
	DatabaseURL             string
	KafkaBrokers           []string
	KafkaTopics            KafkaTopics
	KafkaTimeoutMs         int
	WebhookSecret          string
	WebhookSignatureHeader  string
	WebhookReplaySkewSecs   int
	RuleVersion            string
	RiskWindowSmallSec      int
	RiskWindowMediumSec     int
	DBQueryTimeoutSecs      int
	KafkaEnabled           bool
	WebhookVerificationEnabled bool
}

type KafkaTopics struct {
	Raw             string
	Normalized      string
	RiskScore       string
	RiskAlert       string
	Mismatch        string
	DeadLetter      string
}

// APIContract defines required handlers for the Gin admin API.
type APIContract interface {
	GetHealth() (HealthResponse, error)
	ListEvents(query ListEventsQuery) (EventListResponse, error)
	ListRiskAlerts(wallet, grade, status string, page, size int) (RiskAlertListResponse, error)
	GetWalletRiskScore(wallet string) (RiskScoreResponse, error)
	AcknowledgeRiskAlert(alertID string, req RiskAlertAckRequest) (RiskAlertResponse, error)
	GetLagSnapshot() (LagSnapshotResponse, error)
	TriggerReplay(req ReplayRequest) (ReplayResponse, error)
	ReloadRules(req RuleReloadRequest) (RuleReloadResponse, error)
	ReceiveWebhook(req WebhookEnvelope, signature string, rawBody []byte) (WebhookResponse, error)
}
