package store

import (
    "apix-backend/models"
    "sync"
    "time"
)

var (
    Listings     = make(map[string]models.Listing)
    Transactions = make(map[string]models.Transaction)
    Users        = make(map[string]models.User)
    mu           sync.RWMutex
)

func Init() {
    // Seed Data
    Listings["listing_001"] = models.Listing{
        ID:               "listing_001",
        SellerID:         "seller_1",
        Name:             "Premium Market Data",
        BaseURL:          "https://jsonplaceholder.typicode.com/posts/1", // Mock Origin
        PriceWei:         "10000000000000000",                            // 0.01 AVAX
        PaymentRecipient: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",   // Demo Wallet
        IsActive:         true,
    }
}

func GetListing(id string) (models.Listing, bool) {
    mu.RLock()
    defer mu.RUnlock()
    l, ok := Listings[id]
    return l, ok
}

func SaveTransaction(tx models.Transaction) {
    mu.Lock()
    defer mu.Unlock()
    Transactions[tx.RequestID] = tx
}

func GetTransaction(id string) (models.Transaction, bool) {
    mu.RLock()
    defer mu.RUnlock()
    tx, ok := Transactions[id]
    return tx, ok
}

func UpdateTransactionStatus(id string, status models.TransactionStatus, txHash string) {
    mu.Lock()
    defer mu.Unlock()
    if tx, ok := Transactions[id]; ok {
        tx.Status = status
        tx.TxHash = txHash
        tx.VerifiedAt = time.Now() // Add VerifiedAt to struct if needed, for now just update status
        Transactions[id] = tx
    }
}
