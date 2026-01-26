package models

import "time"

type UserRole string

const (
    RoleBuyer  UserRole = "BUYER"
    RoleSeller UserRole = "SELLER"
)

type User struct {
    ID            string    `json:"id"`
    WalletAddress string    `json:"wallet_address"`
    Role          UserRole  `json:"role"`
    CreatedAt     time.Time `json:"created_at"`
}

type Listing struct {
    ID               string   `json:"id"`
    SellerID         string   `json:"seller_id"`
    Name             string   `json:"name"`
    BaseURL          string   `json:"base_url"`
    OriginAuthHeader string   `json:"origin_auth_header"`
    OriginAuthValue  string   `json:"origin_auth_value"`
    IsActive         bool     `json:"is_active"`
    PriceWei         string   `json:"price_wei"` // Simplified from PricingTier for PoC
    PaymentRecipient string   `json:"payment_recipient"`
}

type TransactionStatus string

const (
    StatusPending TransactionStatus = "PENDING"
    StatusPaid    TransactionStatus = "PAID"
    StatusFailed  TransactionStatus = "FAILED"
)

type Transaction struct {
    RequestID     string            `json:"request_id"`
    ListingID     string            `json:"listing_id"`
    BuyerID       string            `json:"buyer_id,omitempty"`
    TxHash        string            `json:"tx_hash,omitempty"`
    Status        TransactionStatus `json:"status"`
    AmountPaidWei string            `json:"amount_paid_wei,omitempty"`
    CreatedAt     time.Time         `json:"created_at"`
    ExpiresAt     time.Time         `json:"expires_at"`
    VerifiedAt    time.Time         `json:"verified_at,omitempty"`
}
