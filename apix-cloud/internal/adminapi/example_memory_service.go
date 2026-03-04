package adminapi

import (
	"fmt"
	"sync"
	"time"
)

// Stub service used as a temporary scaffold for local development.
// Replace implementation with DB + Kafka + risk-engine integrations.
type StubAdminService struct {
	mu sync.Mutex
}

func NewStubAdminService() *StubAdminService {
	return &StubAdminService{}
}

func (s *StubAdminService) GetHealth() (HealthResponse, error) {
	return HealthResponse{
		Status:         "UP",
		CheckedAt:      time.Now().UTC().Format(time.RFC3339),
		ChainID:        402,
		WSConnected:    true,
		KafkaHealthy:   true,
		LagMS:          0,
		ServiceVersion: "scaffold",
	}, nil
}

func (s *StubAdminService) ListEvents(query ListEventsQuery) (EventListResponse, error) {
	page := query.Page
	if page <= 0 {
		page = 1
	}
	size := query.Size
	if size <= 0 {
		size = 50
	}
	_ = size
	return EventListResponse{
		Items: []L1Event{},
		Page:  PageInfo{Page: page, Size: size, Total: 0, HasMore: false},
	}, nil
}

func (s *StubAdminService) ListRiskAlerts(wallet, grade, status string, page, size int) (RiskAlertListResponse, error) {
	_ = wallet
	_ = grade
	_ = status
	if page <= 0 {
		page = 1
	}
	if size <= 0 {
		size = 50
	}
	return RiskAlertListResponse{
		Items: []RiskAlert{},
		Page:  PageInfo{Page: page, Size: size, Total: 0, HasMore: false},
	}, nil
}

func (s *StubAdminService) GetWalletRiskScore(wallet string) (RiskScoreResponse, error) {
	if wallet == "" {
		return RiskScoreResponse{}, fmt.Errorf("wallet is required")
	}
	return RiskScoreResponse{
		Wallet:     wallet,
		RiskScore:  0,
		RiskGrade:  "NORMAL",
		Signals:    map[string]interface{}{},
		ComputedAt: time.Now().UTC().Format(time.RFC3339),
		TTL:        300,
	}, nil
}

func (s *StubAdminService) AcknowledgeRiskAlert(alertID string, req RiskAlertAckRequest) (RiskAlertResponse, error) {
	if alertID == "" {
		return RiskAlertResponse{}, fmt.Errorf("alert_id is required")
	}
	if req.Status == "" {
		return RiskAlertResponse{}, fmt.Errorf("status is required")
	}
	return RiskAlertResponse{RiskAlert: RiskAlert{AlertID: alertID, Status: req.Status}, Comment: "acknowledged"}, nil
}

func (s *StubAdminService) GetLagSnapshot() (LagSnapshotResponse, error) {
	return LagSnapshotResponse{
		KafkaLag:           0,
		WSLagSeconds:       0,
		MismatchCount:      0,
		LatestBlock:        0,
		LastReconciledBlock: 0,
	}, nil
}

func (s *StubAdminService) TriggerReplay(req ReplayRequest) (ReplayResponse, error) {
	if req.FromBlock <= 0 || req.ToBlock <= 0 || req.FromBlock > req.ToBlock {
		return ReplayResponse{}, fmt.Errorf("invalid replay range")
	}
	return ReplayResponse{JobID: "replay-job", Accepted: true, ExpectedRecords: req.ToBlock - req.FromBlock + 1}, nil
}

func (s *StubAdminService) ReloadRules(req RuleReloadRequest) (RuleReloadResponse, error) {
	_ = req
	return RuleReloadResponse{
		AppliedVersion: "v1.0.0",
		RulesLoaded:   0,
		Changed:       false,
		StartedAt:     time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (s *StubAdminService) ReceiveWebhook(req WebhookEnvelope, signature string, rawBody []byte) (WebhookResponse, error) {
	if req.EventID == "" {
		return WebhookResponse{}, fmt.Errorf("event_id is required")
	}
	_ = signature
	_ = rawBody
	return WebhookResponse{Accepted: true, Message: "webhook accepted"}, nil
}
