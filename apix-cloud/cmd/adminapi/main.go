package main

import (
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"apix-cloud/internal/adminapi"
)

func main() {
	port := getEnvInt("APIX_ADMIN_PORT", 8090)
	cfg := readAdminServiceConfig()

	kafka := adminapi.NewKafkaPublisher(cfg.KafkaBrokers, cfg.KafkaTimeoutMs, cfg.KafkaEnabled)
	defer func() {
		_ = kafka.Close()
	}()

	service, _ := adminapi.NewAdminService(cfg, kafka)
	handler := adminapi.NewAdminHandler(service)

	adminapi.RegisterAuthMiddleware(buildAuthMiddleware())
	adminapi.RegisterWebhookSignatureHeader(cfg.WebhookSignatureHeader)
	r := gin.New()
	r.Use(gin.Recovery())

	handler.RegisterRoutes(r)

	addr := ":" + strconv.Itoa(port)
	log.Printf("APIX admin API bootstrap on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("failed to run admin api: %v", err)
	}
}

func readAdminServiceConfig() adminapi.ServiceConfig {
	return adminapi.ServiceConfig{
		DatabaseURL:              strings.TrimSpace(os.Getenv("APIX_ADMIN_DATABASE_URL")),
		KafkaBrokers:            splitCSV(os.Getenv("APIX_ADMIN_KAFKA_BROKERS")),
		KafkaTopics:             readKafkaTopics(),
		KafkaTimeoutMs:          getEnvInt("APIX_ADMIN_KAFKA_TIMEOUT_MS", 3000),
		KafkaEnabled:            parseBool(os.Getenv("APIX_ADMIN_KAFKA_ENABLED"), true),
		WebhookSecret:           strings.TrimSpace(os.Getenv("APIX_ADMIN_WEBHOOK_SECRET")),
		WebhookSignatureHeader:   firstNonEmpty(strings.TrimSpace(os.Getenv("APIX_ADMIN_WEBHOOK_SIGNATURE_HEADER")), "X-Webhook-Signature"),
		WebhookReplaySkewSecs:    getEnvInt("APIX_ADMIN_WEBHOOK_REPLAY_SKEW_SEC", 300),
		WebhookVerificationEnabled: parseBool(os.Getenv("APIX_ADMIN_WEBHOOK_VERIFY"), false),
		RuleVersion:             strings.TrimSpace(os.Getenv("APIX_ADMIN_RULE_VERSION")),
		RiskWindowSmallSec:       getEnvInt("APIX_ADMIN_RISK_WINDOW_SMALL_SEC", 60),
		RiskWindowMediumSec:      getEnvInt("APIX_ADMIN_RISK_WINDOW_MEDIUM_SEC", 300),
		DBQueryTimeoutSecs:      getEnvInt("APIX_ADMIN_DB_TIMEOUT_SEC", 4),
	}
}

func readKafkaTopics() adminapi.KafkaTopics {
	return adminapi.KafkaTopics{
		Raw:        firstNonEmpty(strings.TrimSpace(os.Getenv("APIX_ADMIN_TOPIC_RAW")), "apix.l1.events.raw.v1"),
		Normalized: firstNonEmpty(strings.TrimSpace(os.Getenv("APIX_ADMIN_TOPIC_NORMALIZED")), "apix.l1.events.normalized.v1"),
		RiskScore:  firstNonEmpty(strings.TrimSpace(os.Getenv("APIX_ADMIN_TOPIC_RISK_SCORE")), "apix.risk.score.v1"),
		RiskAlert:  firstNonEmpty(strings.TrimSpace(os.Getenv("APIX_ADMIN_TOPIC_RISK_ALERT")), "apix.risk.alert.v1"),
		Mismatch:   firstNonEmpty(strings.TrimSpace(os.Getenv("APIX_ADMIN_TOPIC_MISMATCH")), "apix.l1.events.mismatch.v1"),
		DeadLetter: firstNonEmpty(strings.TrimSpace(os.Getenv("APIX_ADMIN_TOPIC_DEAD_LETTER")), "apix.l1.events.deadletter.v1"),
	}
}

func buildAuthMiddleware() func(c *gin.Context) {
	apiKeys := splitCSV(os.Getenv("APIX_ADMIN_API_KEYS"))
	headerName := strings.TrimSpace(os.Getenv("APIX_ADMIN_API_KEY_HEADER"))
	return adminapi.APIAuthGuard(apiKeys, headerName)
}

func splitCSV(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	items := strings.Split(raw, ",")
	result := make([]string, 0, len(items))
	for _, item := range items {
		v := strings.TrimSpace(item)
		if v != "" {
			result = append(result, v)
		}
	}
	return result
}

func getEnvInt(name string, def int) int {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return def
	}
	return n
}

func parseBool(raw string, def bool) bool {
	v := strings.ToLower(strings.TrimSpace(raw))
	if v == "" {
		return def
	}
	switch v {
	case "1", "true", "t", "yes", "on":
		return true
	case "0", "false", "f", "no", "off":
		return false
	default:
		return def
	}
}

func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return strings.TrimSpace(a)
	}
	return b
}
