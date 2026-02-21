package adminapi

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// APIAuthGuard builds API key authentication middleware for admin endpoints.
// If apiKeys is empty, middleware allows all requests.
func APIAuthGuard(apiKeys []string, headerName string) gin.HandlerFunc {
	if len(apiKeys) == 0 {
		return func(c *gin.Context) { c.Next() }
	}
	allow := map[string]struct{}{}
	for _, item := range apiKeys {
		key := strings.TrimSpace(item)
		if key != "" {
			allow[key] = struct{}{}
		}
	}
	header := strings.TrimSpace(headerName)
	if header == "" {
		header = "X-API-KEY"
	}

	return func(c *gin.Context) {
		provided := strings.TrimSpace(c.GetHeader(header))
		if _, ok := allow[provided]; !ok {
			c.JSON(http.StatusUnauthorized, APIError{
				Code:    "unauthorized",
				Message: "missing or invalid admin api key",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}
