package handlers

import (
    "apix-backend/models"
    "apix-backend/store"
    "context"
    "log"
    "net/http"
    "strings"
    "time"

    "github.com/ethereum/go-ethereum/common"
    "github.com/ethereum/go-ethereum/ethclient"
    "github.com/gin-gonic/gin"
    "github.com/google/uuid"
)

// --- Connect Wallet (Mock) ---
func ConnectWallet(c *gin.Context) {
    // In real app, verify signature here.
    c.JSON(http.StatusOK, gin.H{
        "success": true,
        "data": gin.H{
            "accessToken": "valid_session_token",
            "expiresIn":   3600,
        },
    })
}

// --- Get Proxy Resource (402 Logic) ---
func GetProxyResource(c *gin.Context) {
    listingID := c.Param("listing_id")
    token := c.GetHeader("Authorization")

    // 1. Check if token allows access (Simplistic check for PoC)
    if strings.HasPrefix(token, "Bearer access_token_") {
        // Access Granted
        c.JSON(http.StatusOK, gin.H{
            "success": true,
            "data": gin.H{
                "message":   "Here is the premium content!",
                "value":     "SECRET_DATA_FROM_BACKEND",
                "timestamp": time.Now(),
            },
        })
        return
    }

    // 2. Access Denied -> 402 Payment Required
    listing, ok := store.Listings[listingID]
    if !ok {
        c.JSON(http.StatusNotFound, gin.H{"error": "Listing not found"})
        return
    }

    requestID := "req_" + uuid.New().String()
    
    // Store Pending Transaction
    store.SaveTransaction(models.Transaction{
        RequestID: requestID,
        ListingID: listingID,
        Status:    models.StatusPending,
        CreatedAt: time.Now(),
        ExpiresAt: time.Now().Add(15 * time.Minute),
    })

    c.JSON(http.StatusPaymentRequired, gin.H{
        "success": false,
        "error": gin.H{
            "code":    "PAYMENT_REQUIRED",
            "message": "Micropayment required.",
            "details": gin.H{
                "request_id": requestID,
                "chain_id":   43113, // Avalanche Fuji Testnet
                "payment_info": gin.H{
                    "currency":  "AVAX",
                    "amount":    listing.PriceWei,
                    "recipient": listing.PaymentRecipient,
                    "memo":      requestID,
                },
            },
        },
    })
}

// --- Verify Payment ---
type VerifyRequest struct {
    RequestID string `json:"request_id"`
    TxHash    string `json:"tx_hash"`
}

func VerifyPayment(c *gin.Context) {
    var req VerifyRequest
    if err := c.BindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON"})
        return
    }

    // 1. Check Request ID
    _, ok := store.GetTransaction(req.RequestID)
    if !ok {
        c.JSON(http.StatusNotFound, gin.H{"error": "Invalid Request ID"})
        return
    }

    // 2. Verify on Blockchain
    // Connect to Avalanche Fuji Testnet
    client, err := ethclient.Dial("https://api.avax-test.network/ext/bc/C/rpc")
    if err != nil {
        log.Println("RPC Connection Error:", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Blockchain Node Error"})
        return
    }

    receipt, err := client.TransactionReceipt(context.Background(), common.HexToHash(req.TxHash))
    if err != nil {
        // Receipt not found yet -> Retry needed on client, or handle not found
        log.Println("Receipt Error:", err)
        c.JSON(http.StatusBadRequest, gin.H{"error": "Transaction not found or pending"})
        return
    }

    if receipt.Status != 1 {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Transaction failed on-chain"})
        return
    }

    // Additional checks (Recipient, Amount) should be here.
    // For PoC, we trust the successful receipt + RequestID match implies valid payment if simple.
    // In production, MUST check `tx.To` and `tx.Value`.

    // 3. Mark Paid
    store.UpdateTransactionStatus(req.RequestID, models.StatusPaid, req.TxHash)

    // 4. Issue Token
    accessToken := "access_token_" + req.RequestID 

    c.JSON(http.StatusOK, gin.H{
        "success": true,
        "data": gin.H{
            "status":       "verified",
            "access_token": accessToken,
            "expires_in":   3600,
        },
    })
}
