package adminapi

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	defaultPage = 1
	defaultSize = 50
	maxSize     = 200
)

var webhookSignatureHeader = "X-Webhook-Signature"
var authMiddleware gin.HandlerFunc = gin.HandlerFunc(func(c *gin.Context) {
	c.Next()
})

func RegisterAuthMiddleware(fn gin.HandlerFunc) {
	if fn == nil {
		authMiddleware = gin.HandlerFunc(func(c *gin.Context) {
			c.Next()
		})
		return
	}
	authMiddleware = fn
}

func RegisterWebhookSignatureHeader(header string) {
	header = strings.TrimSpace(header)
	if header == "" {
		return
	}
	webhookSignatureHeader = header
}

func NewAdminHandler(svc APIContract) *AdminHandler {
	return &AdminHandler{svc: svc}
}

type AdminHandler struct {
	svc APIContract
}

func (h *AdminHandler) RegisterRoutes(r *gin.Engine) {
	r.GET("/v1/health", h.health)
	v1 := r.Group("/v1", authMiddleware)
	{
		v1.GET("/events", h.listEvents)
		v1.GET("/risk/alerts", h.listRiskAlerts)
		v1.GET("/risk/score/:wallet", h.getRiskScore)
		v1.POST("/risk/alerts/:alert_id/ack", h.ackRiskAlert)
		v1.GET("/ops/lag", h.getLag)
		v1.POST("/ops/replay", h.triggerReplay)
		v1.POST("/ops/rules/reload", h.reloadRules)
	}
	r.POST("/webhooks/apix-l1", h.receiveWebhook)
}

func (h *AdminHandler) health(c *gin.Context) {
	resp, err := h.svc.GetHealth()
	if err != nil {
		writeError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AdminHandler) listEvents(c *gin.Context) {
	query, err := parseListEventsQuery(c)
	if err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}
	resp, err := h.svc.ListEvents(query)
	if err != nil {
		writeError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AdminHandler) listRiskAlerts(c *gin.Context) {
	page, size := parsePagination(c)
	grade := c.Query("grade")
	wallet := c.Query("wallet")
	status := c.Query("status")

	resp, err := h.svc.ListRiskAlerts(wallet, grade, status, page, size)
	if err != nil {
		writeError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AdminHandler) getRiskScore(c *gin.Context) {
	wallet := c.Param("wallet")
	if wallet == "" {
		writeError(c, http.StatusBadRequest, fmt.Errorf("wallet is required"))
		return
	}
	resp, err := h.svc.GetWalletRiskScore(wallet)
	if err != nil {
		writeError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AdminHandler) ackRiskAlert(c *gin.Context) {
	alertID := c.Param("alert_id")
	if alertID == "" {
		writeError(c, http.StatusBadRequest, fmt.Errorf("alert_id is required"))
		return
	}
	var req RiskAlertAckRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}
	if req.Status == "" {
		writeError(c, http.StatusBadRequest, fmt.Errorf("status is required"))
		return
	}
	resp, err := h.svc.AcknowledgeRiskAlert(alertID, req)
	if err != nil {
		writeError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AdminHandler) getLag(c *gin.Context) {
	resp, err := h.svc.GetLagSnapshot()
	if err != nil {
		writeError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AdminHandler) triggerReplay(c *gin.Context) {
	var req ReplayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}
	if req.FromBlock <= 0 || req.ToBlock <= 0 || req.FromBlock > req.ToBlock {
		writeError(c, http.StatusBadRequest, fmt.Errorf("invalid replay range"))
		return
	}
	resp, err := h.svc.TriggerReplay(req)
	if err != nil {
		writeError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusAccepted, resp)
}

func (h *AdminHandler) reloadRules(c *gin.Context) {
	var req RuleReloadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}
	resp, err := h.svc.ReloadRules(req)
	if err != nil {
		writeError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AdminHandler) receiveWebhook(c *gin.Context) {
	var req WebhookEnvelope
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}
	signature := c.GetHeader(webhookSignatureHeader)
	if signature == "" {
		signature = req.Signature
	}
	resp, err := h.svc.ReceiveWebhook(req, signature, body)
	if err != nil {
		writeError(c, http.StatusUnauthorized, err)
		return
	}
	c.JSON(http.StatusAccepted, resp)
}

func parsePagination(c *gin.Context) (page, size int) {
	page = defaultPage
	size = defaultSize
	if raw := c.Query("page"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			page = parsed
		}
	}
	if raw := c.Query("size"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			if parsed > 0 {
				if parsed > maxSize {
					size = maxSize
				} else {
					size = parsed
				}
			}
		}
	}
	return page, size
}

func parseListEventsQuery(c *gin.Context) (ListEventsQuery, error) {
	page, size := parsePagination(c)
	q := ListEventsQuery{
		Wallet:    c.Query("wallet"),
		EventType: c.Query("event_type"),
		APIID:     c.Query("api_id"),
		Status:    c.Query("status"),
		Page:      page,
		Size:      size,
	}

	if raw := c.Query("from"); raw != "" {
		v, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			return ListEventsQuery{}, fmt.Errorf("invalid from, must be RFC3339")
		}
		q.From = &v
	}

	if raw := c.Query("to"); raw != "" {
		v, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			return ListEventsQuery{}, fmt.Errorf("invalid to, must be RFC3339")
		}
		q.To = &v
	}

	if q.From != nil && q.To != nil && q.From.After(*q.To) {
		return ListEventsQuery{}, fmt.Errorf("from must be before to")
	}

	return q, nil
}

func writeError(c *gin.Context, status int, err error) {
	c.JSON(status, APIError{
		Code:      "request_error",
		Message:   err.Error(),
		RequestID: c.GetHeader("X-Request-ID"),
	})
}
