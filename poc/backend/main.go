package main

import (
    "apix-backend/handlers"
    "apix-backend/store"
    "log"
    "time"

    "github.com/gin-contrib/cors"
    "github.com/gin-gonic/gin"
)

func main() {
    // Initialize In-Memory Store
    store.Init()

    r := gin.Default()

    // CORS Configuration
    r.Use(cors.New(cors.Config{
        AllowOrigins:     []string{"http://localhost:5173"},
        AllowMethods:     []string{"GET", "POST", "OPTIONS"},
        AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
        ExposeHeaders:    []string{"Content-Length"},
        AllowCredentials: true,
        MaxAge:           12 * time.Hour,
    }))

    // Routes
    r.POST("/auth/connect", handlers.ConnectWallet)
    r.GET("/proxy/:listing_id", handlers.GetProxyResource)
    r.POST("/verify", handlers.VerifyPayment)

    log.Println("Server starting on :8080")
    r.Run(":8080")
}
