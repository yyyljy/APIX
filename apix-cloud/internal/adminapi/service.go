package adminapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/lib/pq"
)

const (
	defaultRiskWindowSmallSec  = 60
	defaultRiskWindowMediumSec = 300
	defaultRiskWindowLargeSec  = 3600
	defaultDBTimeoutSec        = 4
)

// AdminService implements APIContract with DB + Kafka + risk engine integration.
type AdminService struct {
	db      *sql.DB
	kafka   *KafkaPublisher
	cfg     ServiceConfig
	dbAlive bool
}

func NewAdminService(cfg ServiceConfig, kafka *KafkaPublisher) (*AdminService, error) {
	if cfg.DBQueryTimeoutSecs <= 0 {
		cfg.DBQueryTimeoutSecs = defaultDBTimeoutSec
	}
	if cfg.WebhookReplaySkewSecs <= 0 {
		cfg.WebhookReplaySkewSecs = 300
	}
	if strings.TrimSpace(cfg.WebhookSignatureHeader) == "" {
		cfg.WebhookSignatureHeader = "X-Webhook-Signature"
	}
	if cfg.WebhookVerificationEnabled && strings.TrimSpace(cfg.WebhookSecret) == "" {
		cfg.WebhookVerificationEnabled = false
	}
	if cfg.KafkaTopics.Raw == "" {
		cfg.KafkaTopics.Raw = "apix.l1.events.raw.v1"
	}
	if cfg.KafkaTopics.Normalized == "" {
		cfg.KafkaTopics.Normalized = "apix.l1.events.normalized.v1"
	}
	if cfg.KafkaTopics.RiskScore == "" {
		cfg.KafkaTopics.RiskScore = "apix.risk.score.v1"
	}
	if cfg.KafkaTopics.RiskAlert == "" {
		cfg.KafkaTopics.RiskAlert = "apix.risk.alert.v1"
	}
	if cfg.KafkaTopics.Mismatch == "" {
		cfg.KafkaTopics.Mismatch = "apix.l1.events.mismatch.v1"
	}
	if cfg.KafkaTopics.DeadLetter == "" {
		cfg.KafkaTopics.DeadLetter = "apix.l1.events.deadletter.v1"
	}
	if cfg.RuleVersion == "" {
		cfg.RuleVersion = "policy-v1"
	}
	if cfg.RiskWindowSmallSec <= 0 {
		cfg.RiskWindowSmallSec = defaultRiskWindowSmallSec
	}
	if cfg.RiskWindowMediumSec <= 0 {
		cfg.RiskWindowMediumSec = defaultRiskWindowMediumSec
	}
	if cfg.KafkaTimeoutMs <= 0 {
		cfg.KafkaTimeoutMs = 3000
	}

	service := &AdminService{
		cfg:     cfg,
		dbAlive: false,
		kafka:   kafka,
	}

	if strings.TrimSpace(cfg.DatabaseURL) == "" {
		return service, nil
	}

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		return service, nil
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(cfg.DBQueryTimeoutSecs)*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return service, nil
	}

	service.db = db
	service.dbAlive = true
	return service, nil
}

func (s *AdminService) GetHealth() (HealthResponse, error) {
	resp := HealthResponse{
		Status:         "UP",
		CheckedAt:      time.Now().UTC().Format(time.RFC3339),
		ChainID:        402,
		WSConnected:    true,
		KafkaHealthy:   s.kafka != nil && s.kafka.Enabled,
		LagMS:          0,
		ServiceVersion: s.cfg.RuleVersion,
	}

	if s.db == nil {
		resp.Status = "DEGRADED"
		return resp, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(s.cfg.DBQueryTimeoutSecs)*time.Second)
	defer cancel()
	if err := s.db.PingContext(ctx); err != nil {
		resp.Status = "DEGRADED"
		resp.KafkaHealthy = false
		return resp, nil
	}
	return resp, nil
}

func (s *AdminService) ListEvents(q ListEventsQuery) (EventListResponse, error) {
	if s.db == nil {
		return EventListResponse{Items: []L1Event{}, Page: PageInfo{Page: q.Page, Size: q.Size, Total: 0, HasMore: false}}, nil
	}
	if q.Page <= 0 {
		q.Page = 1
	}
	if q.Size <= 0 || q.Size > 200 {
		q.Size = 50
	}

	where, args := buildWhereForEvents(q)
	countQuery := `SELECT COUNT(*) FROM l1_events_normalized` + where
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(s.cfg.DBQueryTimeoutSecs)*time.Second)
	defer cancel()

	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		if isRelationMissing(err) {
			return EventListResponse{Items: []L1Event{}, Page: PageInfo{Page: q.Page, Size: q.Size, Total: 0, HasMore: false}}, nil
		}
		return EventListResponse{}, err
	}

	limitPos := len(args) + 1
	offsetPos := len(args) + 2
	query := `
		SELECT event_id, dedupe_key, chain_id, block_number, block_hash, tx_hash, log_index, contract_address, event_type,
		       wallet, api_id, plan_id, amount, token_symbol, status, source, created_at
		FROM l1_events_normalized` + where +
		fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", limitPos, offsetPos)

	offset := (q.Page - 1) * q.Size
	rowsArgs := append(append([]interface{}{}, args...), q.Size, offset)
	rows, err := s.db.QueryContext(ctx, query, rowsArgs...)
	if err != nil {
		if isRelationMissing(err) {
			return EventListResponse{Items: []L1Event{}, Page: PageInfo{Page: q.Page, Size: q.Size, Total: 0, HasMore: false}}, nil
		}
		return EventListResponse{}, err
	}
	defer rows.Close()

	items := make([]L1Event, 0)
	for rows.Next() {
		var e L1Event
		var createdAt time.Time
		var blockNumber int64
		var logIndex int64
		if err := rows.Scan(
			&e.EventID,
			&e.DedupeKey,
			&e.ChainID,
			&blockNumber,
			&e.BlockHash,
			&e.TxHash,
			&logIndex,
			&e.ContractAddress,
			&e.EventType,
			&e.Wallet,
			&e.APIID,
			&e.PlanID,
			&e.Amount,
			&e.TokenSymbol,
			&e.Status,
			&e.Source,
			&createdAt,
		); err != nil {
			return EventListResponse{}, err
		}
		e.BlockNumber = uint64(maxInt64(blockNumber, 0))
		e.LogIndex = uint64(maxInt64(logIndex, 0))
		e.Timestamp = createdAt.UTC().Format(time.RFC3339)
		items = append(items, e)
	}
	if err := rows.Err(); err != nil {
		return EventListResponse{}, err
	}

	totalPages := (total + q.Size - 1) / q.Size
	if totalPages < 1 {
		totalPages = 1
	}
	return EventListResponse{
		Items: items,
		Page: PageInfo{
			Page:       q.Page,
			Size:       q.Size,
			Total:      total,
			HasMore:    q.Page < totalPages,
			NextCursor: fmt.Sprintf("%d", q.Page),
			PrevCursor: fmt.Sprintf("%d", q.Page-1),
		},
	}, nil
}

func (s *AdminService) ListRiskAlerts(wallet, grade, status string, page, size int) (RiskAlertListResponse, error) {
	if s.db == nil {
		return RiskAlertListResponse{Items: []RiskAlert{}, Page: PageInfo{Page: page, Size: size, Total: 0, HasMore: false}}, nil
	}
	if page <= 0 {
		page = 1
	}
	if size <= 0 || size > 200 {
		size = 50
	}

	where := " WHERE 1=1"
	args := []interface{}{}
	if wallet != "" {
		args = append(args, wallet)
		where += fmt.Sprintf(" AND wallet = $%d", len(args))
	}
	if grade != "" {
		args = append(args, strings.ToUpper(strings.TrimSpace(grade)))
		where += fmt.Sprintf(" AND risk_grade = $%d", len(args))
	}
	if status != "" {
		args = append(args, strings.ToUpper(strings.TrimSpace(status)))
		where += fmt.Sprintf(" AND status = $%d", len(args))
	}

	countQuery := `SELECT COUNT(*) FROM risk_alerts` + where
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(s.cfg.DBQueryTimeoutSecs)*time.Second)
	defer cancel()

	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		if isRelationMissing(err) {
			return RiskAlertListResponse{Items: []RiskAlert{}, Page: PageInfo{Page: page, Size: size, Total: 0, HasMore: false}}, nil
		}
		return RiskAlertListResponse{}, err
	}

	limitPos := len(args) + 1
	offsetPos := len(args) + 2
	query := `SELECT alert_id, wallet, risk_score, risk_grade, status, rule_ids, reasons, created_at, updated_at, assigned_to, ttl_sec
		FROM risk_alerts` + where + fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", limitPos, offsetPos)
	offset := (page - 1) * size
	rowsArgs := append(append([]interface{}{}, args...), size, offset)
	rows, err := s.db.QueryContext(ctx, query, rowsArgs...)
	if err != nil {
		if isRelationMissing(err) {
			return RiskAlertListResponse{Items: []RiskAlert{}, Page: PageInfo{Page: page, Size: size, Total: 0, HasMore: false}}, nil
		}
		return RiskAlertListResponse{}, err
	}
	defer rows.Close()

	items := make([]RiskAlert, 0)
	for rows.Next() {
		var alert RiskAlert
		var ruleIDs pq.StringArray
		var reasons pq.StringArray
		var createdAt time.Time
		var updatedAt time.Time
		if err := rows.Scan(
			&alert.AlertID,
			&alert.Wallet,
			&alert.RiskScore,
			&alert.RiskGrade,
			&alert.Status,
			&ruleIDs,
			&reasons,
			&createdAt,
			&updatedAt,
			&alert.AssignedTo,
			&alert.TTL,
		); err != nil {
			return RiskAlertListResponse{}, err
		}
		alert.RuleIDs = []string(ruleIDs)
		alert.Reasons = []string(reasons)
		alert.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		alert.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
		items = append(items, alert)
	}
	if err := rows.Err(); err != nil {
		return RiskAlertListResponse{}, err
	}

	totalPages := (total + size - 1) / size
	if totalPages < 1 {
		totalPages = 1
	}
	return RiskAlertListResponse{
		Items: items,
		Page: PageInfo{
			Page:       page,
			Size:       size,
			Total:      total,
			HasMore:    page < totalPages,
			NextCursor: fmt.Sprintf("%d", page),
			PrevCursor: fmt.Sprintf("%d", page-1),
		},
	}, nil
}

func (s *AdminService) GetWalletRiskScore(wallet string) (RiskScoreResponse, error) {
	if wallet == "" {
		return RiskScoreResponse{}, errors.New("wallet is required")
	}
	if s.db == nil {
		return RiskScoreResponse{
			Wallet:     wallet,
			RiskScore:  0,
			RiskGrade:  "NORMAL",
			Signals:    map[string]interface{}{},
			ComputedAt: time.Now().UTC().Format(time.RFC3339),
			TTL:        300,
		}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(s.cfg.DBQueryTimeoutSecs)*time.Second)
	defer cancel()

	var score float64
	var grade, walletRet string
	var signalsRaw []byte
	var computedAt time.Time
	var ttl int
	q := `SELECT wallet, risk_score, risk_grade, signals, created_at, ttl_sec
		FROM risk_scores
		WHERE wallet = $1
		ORDER BY created_at DESC
		LIMIT 1`

	if err := s.db.QueryRowContext(ctx, q, wallet).Scan(&walletRet, &score, &grade, &signalsRaw, &computedAt, &ttl); err != nil {
		if errors.Is(err, sql.ErrNoRows) || isRelationMissing(err) {
			return RiskScoreResponse{
				Wallet:     wallet,
				RiskScore:  0,
				RiskGrade:  "NORMAL",
				Signals:    map[string]interface{}{},
				ComputedAt: time.Now().UTC().Format(time.RFC3339),
				TTL:        300,
			}, nil
		}
		return RiskScoreResponse{}, err
	}

	signals := map[string]interface{}{}
	if len(signalsRaw) > 0 {
		_ = json.Unmarshal(signalsRaw, &signals)
	}
	if signals == nil {
		signals = map[string]interface{}{}
	}
	return RiskScoreResponse{
		Wallet:     walletRet,
		RiskScore:  score,
		RiskGrade:  grade,
		Signals:    signals,
		ComputedAt: computedAt.UTC().Format(time.RFC3339),
		TTL:        ttl,
	}, nil
}

func (s *AdminService) AcknowledgeRiskAlert(alertID string, req RiskAlertAckRequest) (RiskAlertResponse, error) {
	if alertID == "" {
		return RiskAlertResponse{}, errors.New("alert_id is required")
	}
	if req.Status == "" {
		return RiskAlertResponse{}, errors.New("status is required")
	}

	status := strings.ToUpper(strings.TrimSpace(req.Status))
	if status != "ACKNOWLEDGED" && status != "RESOLVED" && status != "INVESTIGATING" {
		return RiskAlertResponse{}, errors.New("invalid status")
	}

	if s.db == nil {
		return RiskAlertResponse{RiskAlert: RiskAlert{AlertID: alertID, Status: status}, Comment: strings.TrimSpace(req.Note)}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(s.cfg.DBQueryTimeoutSecs)*time.Second)
	defer cancel()

	updateQuery := `UPDATE risk_alerts SET status = $1, updated_at = NOW(), assigned_to = COALESCE(NULLIF($2, ''), assigned_to) WHERE alert_id = $3`
	if _, err := s.db.ExecContext(ctx, updateQuery, status, req.AssignedTo, alertID); err != nil {
		if isRelationMissing(err) {
			return RiskAlertResponse{}, nil
		}
		return RiskAlertResponse{}, err
	}

	var alert RiskAlert
	var createdAt, updatedAt time.Time
	var ruleIDs pq.StringArray
	var reasons pq.StringArray
	row := s.db.QueryRowContext(ctx, `
		SELECT alert_id, wallet, risk_score, risk_grade, status, rule_ids, reasons, created_at, updated_at, assigned_to, ttl_sec
		FROM risk_alerts
		WHERE alert_id = $1`, alertID)
	if err := row.Scan(
		&alert.AlertID,
		&alert.Wallet,
		&alert.RiskScore,
		&alert.RiskGrade,
		&alert.Status,
		&ruleIDs,
		&reasons,
		&createdAt,
		&updatedAt,
		&alert.AssignedTo,
		&alert.TTL,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return RiskAlertResponse{}, errors.New("alert not found")
		}
		if isRelationMissing(err) {
			return RiskAlertResponse{RiskAlert: RiskAlert{AlertID: alertID, Status: status}, Comment: strings.TrimSpace(req.Note)}, nil
		}
		return RiskAlertResponse{}, err
	}
	alert.RuleIDs = []string(ruleIDs)
	alert.Reasons = []string(reasons)
	alert.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	alert.UpdatedAt = updatedAt.UTC().Format(time.RFC3339)
	return RiskAlertResponse{RiskAlert: alert, Comment: strings.TrimSpace(req.Note)}, nil
}

func (s *AdminService) GetLagSnapshot() (LagSnapshotResponse, error) {
	if s.db == nil {
		return LagSnapshotResponse{KafkaLag: 0, WSLagSeconds: 0, MismatchCount: 0, LatestBlock: 0, LastReconciledBlock: 0}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(s.cfg.DBQueryTimeoutSecs)*time.Second)
	defer cancel()

	var latestRaw uint64
	var latestNorm uint64
	var mismatch int64
	query := `SELECT
		COALESCE((SELECT MAX(block_number) FROM l1_events_raw), 0),
		COALESCE((SELECT MAX(block_number) FROM l1_events_normalized), 0),
		COALESCE((SELECT COUNT(*) FROM webhook_mismatch), 0)`
	if err := s.db.QueryRowContext(ctx, query).Scan(&latestRaw, &latestNorm, &mismatch); err != nil {
		if isRelationMissing(err) {
			return LagSnapshotResponse{KafkaLag: 0, WSLagSeconds: 0, MismatchCount: 0, LatestBlock: 0, LastReconciledBlock: 0}, nil
		}
		return LagSnapshotResponse{}, err
	}
	return LagSnapshotResponse{
		KafkaLag:           0,
		WSLagSeconds:       0,
		MismatchCount:      mismatch,
		LatestBlock:        latestRaw,
		LastReconciledBlock: latestNorm,
	}, nil
}

func (s *AdminService) TriggerReplay(req ReplayRequest) (ReplayResponse, error) {
	jobID := fmt.Sprintf("replay_%d", time.Now().UnixNano())
	expected := req.ToBlock - req.FromBlock + 1
	if req.FromBlock <= 0 || req.ToBlock <= 0 || req.FromBlock > req.ToBlock {
		return ReplayResponse{JobID: jobID, Accepted: false, ExpectedRecords: 0}, errors.New("invalid replay range")
	}

	if s.db == nil {
		return ReplayResponse{JobID: jobID, Accepted: false, ExpectedRecords: expected}, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(s.cfg.DBQueryTimeoutSecs)*time.Second)
	defer cancel()

	_, err := s.db.ExecContext(
		ctx,
		`INSERT INTO replay_jobs(job_id, from_block, to_block, reason, status, created_at)
		 VALUES ($1, $2, $3, $4, 'queued', NOW())`,
		jobID,
		req.FromBlock,
		req.ToBlock,
		req.Reason,
	)
	if err != nil {
		if isRelationMissing(err) {
			return ReplayResponse{JobID: jobID, Accepted: false, ExpectedRecords: expected}, nil
		}
		return ReplayResponse{JobID: jobID, Accepted: false, ExpectedRecords: expected}, err
	}

	if s.kafka != nil {
		_ = s.kafka.Publish(context.Background(), s.cfg.KafkaTopics.DeadLetter, jobID, req)
	}
	return ReplayResponse{JobID: jobID, Accepted: true, ExpectedRecords: expected}, nil
}

func (s *AdminService) ReloadRules(req RuleReloadRequest) (RuleReloadResponse, error) {
	appliedVersion := s.cfg.RuleVersion
	if req.Force {
		appliedVersion = fmt.Sprintf("%s_%d", appliedVersion, time.Now().Unix())
	}
	return RuleReloadResponse{
		AppliedVersion: appliedVersion,
		RulesLoaded:    3,
		Changed:        req.Force,
		StartedAt:      time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (s *AdminService) ReceiveWebhook(req WebhookEnvelope, signature string, rawBody []byte) (WebhookResponse, error) {
	if strings.TrimSpace(signature) == "" {
		signature = strings.TrimSpace(req.Signature)
	}
	if err := s.validateWebhook(signature, rawBody); err != nil {
		return WebhookResponse{}, err
	}

	wallet := valueString(req.Payload["wallet"])
	txHash := valueString(req.Payload["tx_hash"])
	if txHash == "" {
		txHash = valueString(req.Payload["txHash"])
	}
	logIndex := valueUint64(req.Payload["log_index"])
	blockNumber := valueUint64(req.Payload["block_number"])
	if blockNumber == 0 {
		blockNumber = valueUint64(req.Payload["blockNumber"])
	}

	if req.EventID == "" {
		if wallet != "" && txHash != "" {
			req.EventID = fmt.Sprintf("402|%s|%d", txHash, logIndex)
		} else {
			h := sha256.Sum256(rawBody)
			req.EventID = hex.EncodeToString(h[:])
		}
	}
	if strings.TrimSpace(req.ReceivedAt) == "" {
		req.ReceivedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if wallet == "" {
		wallet = valueString(req.Payload["address"])
	}

	payloadJSON, _ := json.Marshal(req.Payload)
	if s.db != nil {
		ctx, cancel := context.WithTimeout(context.Background(), time.Duration(s.cfg.DBQueryTimeoutSecs)*time.Second)
		defer cancel()
		if err := s.writeRawEvent(ctx, req, blockNumber, logIndex, txHash, payloadJSON); err != nil {
			if !isRelationMissing(err) {
				return WebhookResponse{}, err
			}
		}
	}

	if s.kafka != nil && s.kafka.Enabled {
		_ = s.kafka.Publish(context.Background(), s.cfg.KafkaTopics.Raw, req.EventID, req)
	}

	if wallet != "" {
		go func(w string) {
			_ = s.evaluateWalletRisk(context.Background(), w)
		}(wallet)
	}

	return WebhookResponse{Accepted: true, Message: "webhook accepted"}, nil
}

func (s *AdminService) validateWebhook(signature string, raw []byte) error {
	if !s.cfg.WebhookVerificationEnabled {
		return nil
	}
	header := strings.TrimSpace(signature)
	if header == "" {
		return errors.New("missing webhook signature")
	}

	if strings.Contains(header, ",") {
		parts := strings.Split(header, ",")
		var ts int64
		var value string
		for _, p := range parts {
			kv := strings.SplitN(strings.TrimSpace(p), "=", 2)
			if len(kv) != 2 {
				continue
			}
			switch kv[0] {
			case "t", "timestamp":
				parsed, err := strconv.ParseInt(kv[1], 10, 64)
				if err != nil {
					return errors.New("invalid webhook timestamp")
				}
				ts = parsed
			case "v1", "sha256":
				value = strings.TrimSpace(kv[1])
			}
		}
		if value == "" || ts <= 0 {
			return errors.New("invalid webhook signature")
		}
		now := time.Now().Unix()
		if delta := now - ts; delta < 0 {
			if -delta > int64(s.cfg.WebhookReplaySkewSecs) {
				return errors.New("webhook signature expired")
			}
		} else if delta > int64(s.cfg.WebhookReplaySkewSecs) {
			return errors.New("webhook signature expired")
		}
		mac := hmac.New(sha256.New, []byte(s.cfg.WebhookSecret))
		_, _ = mac.Write([]byte(fmt.Sprintf("%d.%s", ts, string(raw)))
		actual := hex.EncodeToString(mac.Sum(nil))
		if !hmac.Equal([]byte(strings.ToLower(actual)), []byte(strings.ToLower(value))) {
			return errors.New("invalid webhook signature")
		}
		return nil
	}

	mac := hmac.New(sha256.New, []byte(s.cfg.WebhookSecret))
	_, _ = mac.Write(raw)
	actual := hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(strings.ToLower(actual)), []byte(strings.ToLower(header))) {
		return errors.New("invalid webhook signature")
	}
	return nil
}

func (s *AdminService) writeRawEvent(ctx context.Context, req WebhookEnvelope, blockNumber, logIndex uint64, txHash string, payloadJSON []byte) error {
	query := `INSERT INTO l1_events_raw (dedupe_key, chain_id, block_number, tx_hash, log_index, payload, source, status, created_at)
			VALUES ($1, 402, $2, $3, $4, $5, $6, 'RECEIVED', NOW())
			ON CONFLICT (dedupe_key) DO UPDATE SET created_at = NOW(), status='RECEIVED', payload=EXCLUDED.payload`
	if _, err := s.db.ExecContext(ctx, query, req.EventID, int64(blockNumber), txHash, int64(logIndex), payloadJSON, req.Source); err != nil {
		return err
	}
	if txHash == "" || req.EventType == "" {
		return nil
	}
	q := `INSERT INTO webhook_mismatch (tx_hash, webhook_seen_at, mismatch_type, created_at)
		VALUES ($1, NOW(), $2, NOW())
		ON CONFLICT (tx_hash, mismatch_type) DO UPDATE SET created_at = NOW()`
	_ = s.db.ExecContext(ctx, q, txHash, req.Source)
	return nil
}

func (s *AdminService) evaluateWalletRisk(ctx context.Context, wallet string) error {
	if s.db == nil {
		return nil
	}
	if s.cfg.DBQueryTimeoutSecs > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, time.Duration(s.cfg.DBQueryTimeoutSecs)*time.Second)
		defer cancel()
	}

	count1m, err := s.countWalletEvents(ctx, wallet, s.cfg.RiskWindowSmallSec)
	if err != nil {
		return nil
	}
	count5m, err := s.countWalletEvents(ctx, wallet, s.cfg.RiskWindowMediumSec)
	if err != nil {
		return nil
	}
	failed5m, _ := s.countWalletFailedEvents(ctx, wallet, s.cfg.RiskWindowMediumSec)
	apiCount, _ := s.countWalletDistinctAPI(ctx, wallet, s.cfg.RiskWindowMediumSec)
	amount, _ := s.sumWalletAmount(ctx, wallet, s.cfg.RiskWindowMediumSec)

	score := 0.0
	score += math.Min(35.0, float64(count1m)*2)
	if count5m > 0 {
		d := float64(failed5m) / float64(count5m)
		score += math.Min(25.0, d*100)
	}
	if apiCount > 5 {
		score += 10
	}
	if count5m > 200 {
		score += 10
	}
	if amount > 0 && count5m > 0 {
		avg := amount / float64(count5m)
		if avg > 10000 {
			score += 20
		}
	}
	if score > 100 {
		score = 100
	}

	grade := "NORMAL"
	switch {
	case score >= 90:
		grade = "CRITICAL"
	case score >= 70:
		grade = "SUSPECT"
	case score >= 40:
		grade = "WARN"
	}

	signals := map[string]interface{}{
		"window_small_sec":  s.cfg.RiskWindowSmallSec,
		"window_medium_sec": s.cfg.RiskWindowMediumSec,
		"request_count_5m":  count5m,
		"request_count_1m":  count1m,
		"failure_count_5m":  failed5m,
		"distinct_api_5m":   apiCount,
		"amount_sum_5m":     amount,
		"grade":             grade,
	}
	signalJSON, _ := json.Marshal(signals)

	_, _ = s.db.ExecContext(
		ctx,
		`INSERT INTO risk_scores (wallet, risk_score, risk_grade, signals, window, ttl_sec, created_at)
		 VALUES ($1,$2,$3,$4,'rolling_5m', 300, NOW())`,
		wallet,
		score,
		grade,
		signalJSON,
	)

	if grade == "NORMAL" {
		_, _ = s.db.ExecContext(
			ctx,
			`UPDATE risk_alerts
				SET status='RESOLVED', updated_at=NOW()
				WHERE wallet=$1 AND status='OPEN'`,
			wallet,
		)
		return nil
	}

	var openCount int64
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM risk_alerts WHERE wallet=$1 AND status='OPEN'`, wallet).Scan(&openCount)
	if openCount == 0 {
		alertID := fmt.Sprintf("alert_%d", time.Now().UnixNano())
		rules := pq.Array([]string{"request_spike", "failure_rate", "api_diversity"})
		reasons := pq.Array([]string{fmt.Sprintf("wallet=%s,score=%.2f", wallet, score)})
		_, _ = s.db.ExecContext(
			ctx,
			`INSERT INTO risk_alerts (alert_id, wallet, risk_score, risk_grade, status, rule_ids, reasons, created_at, updated_at, ttl_sec)
			 VALUES ($1,$2,$3,$4,'OPEN',$5,$6,NOW(),NOW(),300)`,
			alertID,
			wallet,
			score,
			grade,
			rules,
			reasons,
		)
		if s.kafka != nil {
			_ = s.kafka.Publish(ctx, s.cfg.KafkaTopics.RiskAlert, alertID, signals)
		}
	} else {
		_, _ = s.db.ExecContext(
			ctx,
			`UPDATE risk_alerts
				SET risk_score=$1, risk_grade=$2, updated_at=NOW()
				WHERE wallet=$3 AND status='OPEN'`,
			score,
			grade,
			wallet,
		)
	}

	if s.kafka != nil {
		_ = s.kafka.Publish(ctx, s.cfg.KafkaTopics.RiskScore, fmt.Sprintf("%s:%d", wallet, time.Now().Unix()), map[string]interface{}{
			"wallet":     wallet,
			"risk_score": score,
			"risk_grade": grade,
		})
	}
	return nil
}

func (s *AdminService) countWalletEvents(ctx context.Context, wallet string, windowSec int) (int64, error) {
	q := `SELECT COUNT(*) FROM l1_events_raw
		WHERE (payload->>'wallet') = $1
		  AND created_at >= NOW() - (($2 || ' seconds')::interval)`
	var count int64
	if err := s.db.QueryRowContext(ctx, q, wallet, windowSec).Scan(&count); err != nil {
		if isRelationMissing(err) {
			return 0, nil
		}
		return 0, err
	}
	return count, nil
}

func (s *AdminService) countWalletFailedEvents(ctx context.Context, wallet string, windowSec int) (int64, error) {
	q := `SELECT COUNT(*) FROM l1_events_raw
		WHERE (payload->>'wallet') = $1
		  AND created_at >= NOW() - (($2 || ' seconds')::interval)
		  AND LOWER(COALESCE((payload->>'status'),'CONFIRMED')) IN ('failed','reverted')`
	var count int64
	if err := s.db.QueryRowContext(ctx, q, wallet, windowSec).Scan(&count); err != nil {
		if isRelationMissing(err) {
			return 0, nil
		}
		return 0, err
	}
	return count, nil
}

func (s *AdminService) countWalletDistinctAPI(ctx context.Context, wallet string, windowSec int) (int64, error) {
	q := `SELECT COUNT(DISTINCT COALESCE(payload->>'api_id', 'unknown'))
		FROM l1_events_raw
		WHERE (payload->>'wallet') = $1
		  AND created_at >= NOW() - (($2 || ' seconds')::interval)`
	var count int64
	if err := s.db.QueryRowContext(ctx, q, wallet, windowSec).Scan(&count); err != nil {
		if isRelationMissing(err) {
			return 0, nil
		}
		return 0, err
	}
	return count, nil
}

func (s *AdminService) sumWalletAmount(ctx context.Context, wallet string, windowSec int) (float64, error) {
	q := `SELECT COALESCE(SUM(CASE WHEN (payload->>'amount') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (payload->>'amount')::numeric ELSE 0 END), 0)
		FROM l1_events_raw
		WHERE (payload->>'wallet') = $1
		  AND created_at >= NOW() - (($2 || ' seconds')::interval)`
	var amount float64
	if err := s.db.QueryRowContext(ctx, q, wallet, windowSec).Scan(&amount); err != nil {
		if isRelationMissing(err) {
			return 0, nil
		}
		return 0, err
	}
	return amount, nil
}

func buildWhereForEvents(query ListEventsQuery) (string, []interface{}) {
	where := " WHERE 1 = 1"
	args := []interface{}{}
	if query.Wallet != "" {
		args = append(args, query.Wallet)
		where += fmt.Sprintf(" AND wallet = $%d", len(args))
	}
	if query.EventType != "" {
		args = append(args, query.EventType)
		where += fmt.Sprintf(" AND event_type = $%d", len(args))
	}
	if query.APIID != "" {
		args = append(args, query.APIID)
		where += fmt.Sprintf(" AND api_id = $%d", len(args))
	}
	if query.Status != "" {
		args = append(args, strings.ToUpper(strings.TrimSpace(query.Status)))
		where += fmt.Sprintf(" AND status = $%d", len(args))
	}
	if query.From != nil {
		args = append(args, *query.From)
		where += fmt.Sprintf(" AND created_at >= $%d", len(args))
	}
	if query.To != nil {
		args = append(args, *query.To)
		where += fmt.Sprintf(" AND created_at <= $%d", len(args))
	}
	return where, args
}

func isRelationMissing(err error) bool {
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "relation") && (strings.Contains(msg, "does not exist") || strings.Contains(msg, "doesn't exist") || strings.Contains(msg, "undefined table"))
}

func maxInt64(v, fallback int64) int64 {
	if v <= 0 {
		return fallback
	}
	return v
}

func valueString(v interface{}) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return strings.TrimSpace(s)
	}
	return strings.TrimSpace(fmt.Sprintf("%v", v))
}

func valueUint64(v interface{}) uint64 {
	if v == nil {
		return 0
	}
	switch t := v.(type) {
	case float64:
		if t < 0 {
			return 0
		}
		return uint64(t)
	case int:
		if t < 0 {
			return 0
		}
		return uint64(t)
	case int32:
		if t < 0 {
			return 0
		}
		return uint64(t)
	case int64:
		if t < 0 {
			return 0
		}
		return uint64(t)
	case uint:
		return uint64(t)
	case uint32:
		return uint64(t)
	case uint64:
		return t
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return 0
		}
		parsed, err := strconv.ParseUint(s, 10, 64)
		if err != nil {
			return 0
		}
		return parsed
	default:
		return 0
	}
}
