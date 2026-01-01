# Environment Variables Documentation

This document describes all environment variables used by the Blink Battle backend server.

## Server Configuration

### PORT
- **Type**: Number
- **Default**: `3001`
- **Description**: The port on which the server listens for HTTP requests.
- **Example**: `PORT=3001`

### NODE_ENV
- **Type**: String (`development` | `production`)
- **Default**: `development`
- **Description**: The environment in which the application is running. Affects logging, SSL, and other behaviors.
- **Example**: `NODE_ENV=production`

### FRONTEND_URL
- **Type**: String (URL)
- **Required**: Yes
- **Description**: The primary frontend URL for CORS configuration.
- **Example**: `FRONTEND_URL=http://localhost:3000`

### FRONTEND_URL_PRODUCTION
- **Type**: String (URL)
- **Optional**: Yes
- **Description**: Production frontend URL for CORS (in addition to FRONTEND_URL).
- **Example**: `FRONTEND_URL_PRODUCTION=https://app.blumea.me`

### ALLOWED_ORIGINS
- **Type**: String (comma-separated URLs)
- **Optional**: Yes
- **Description**: Additional allowed origins for CORS. Automatically combined with FRONTEND_URL and FRONTEND_URL_PRODUCTION.
- **Example**: `ALLOWED_ORIGINS=https://www.blumea.me,https://blumea.me`

### DEBUG_AUTH
- **Type**: Boolean (`true` | `false`)
- **Default**: `false`
- **Description**: Enable detailed authentication logging for debugging.
- **Example**: `DEBUG_AUTH=true`

## Database Configuration

### DATABASE_URL
- **Type**: String (PostgreSQL connection string)
- **Required**: Yes
- **Description**: Full PostgreSQL connection string including credentials and database name.
- **Example**: `DATABASE_URL=postgresql://user:password@localhost:5432/blink_battle`

### DATABASE_SSL
- **Type**: Boolean (`true` | `false`)
- **Default**: Auto-detected (enabled in production, disabled in development)
- **Description**: Enable SSL for PostgreSQL connections. Required for most managed databases.
- **Example**: `DATABASE_SSL=true`

### DATABASE_SSL_CA
- **Type**: String (file path)
- **Optional**: Yes
- **Description**: Path to custom CA certificate for SSL verification.
- **Example**: `DATABASE_SSL_CA=/path/to/ca-certificate.pem`

## Redis Configuration

### REDIS_URL
- **Type**: String (Redis connection string)
- **Required**: Yes
- **Description**: Full Redis connection string for matchmaking queues and caching.
- **Example**: `REDIS_URL=redis://localhost:6379`

## Worldcoin MiniKit Configuration

### APP_ID
- **Type**: String
- **Required**: Yes
- **Description**: Your Worldcoin app ID from the Developer Portal.
- **Example**: `APP_ID=app_staging_your_app_id`

### DEV_PORTAL_API_KEY
- **Type**: String
- **Required**: Yes
- **Description**: API key for Worldcoin Developer Portal API (for payment verification).
- **Example**: `DEV_PORTAL_API_KEY=your_dev_portal_api_key`

### PLATFORM_WALLET_ADDRESS
- **Type**: String (Ethereum address)
- **Required**: Yes
- **Description**: Platform wallet address for receiving WLD payments via MiniKit Pay.
- **Example**: `PLATFORM_WALLET_ADDRESS=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`

## Smart Contract Configuration

### ESCROW_CONTRACT_ADDRESS
- **Type**: String (Ethereum address)
- **Required**: Yes
- **Description**: Address of the deployed BlinkBattleEscrow smart contract on World Chain.
- **Example**: `ESCROW_CONTRACT_ADDRESS=0x1234567890abcdef1234567890abcdef12345678`

### BACKEND_PRIVATE_KEY
- **Type**: String (hex-encoded private key)
- **Required**: Yes
- **Description**: Private key for backend wallet to interact with smart contracts. **KEEP SECRET!**
- **Example**: `BACKEND_PRIVATE_KEY=0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890`
- **Security**: Never commit this to version control. Use environment variables or secret management.

### WORLD_CHAIN_RPC_URL
- **Type**: String (URL)
- **Required**: Yes
- **Description**: RPC endpoint for World Chain (Mainnet or Testnet).
- **Mainnet**: `https://worldchain-mainnet.g.alchemy.com/public`
- **Testnet**: `https://worldchain-sepolia.g.alchemy.com/public`
- **Example**: `WORLD_CHAIN_RPC_URL=https://worldchain-mainnet.g.alchemy.com/public`

## Authentication

### JWT_SECRET
- **Type**: String
- **Required**: Yes
- **Description**: Secret key for signing JWT authentication tokens. **KEEP SECRET!**
- **Example**: `JWT_SECRET=your_very_secure_random_string_here`
- **Security**: Generate a strong random string (64+ characters). Never commit to version control.

## Game Configuration

### PLATFORM_FEE_PERCENT
- **Type**: Number
- **Default**: `3`
- **Description**: Platform fee percentage taken from pot (winner receives 100% - fee%).
- **Example**: `PLATFORM_FEE_PERCENT=3` (3% fee, winner gets 97% of pot)

### MIN_REACTION_MS
- **Type**: Number (milliseconds)
- **Default**: `80`
- **Description**: Minimum valid reaction time. Reactions faster than this are flagged as potential bots/false starts.
- **Example**: `MIN_REACTION_MS=80`

### MAX_REACTION_MS
- **Type**: Number (milliseconds)
- **Default**: `3000`
- **Description**: Maximum reaction time before timeout.
- **Example**: `MAX_REACTION_MS=3000`

### SIGNAL_DELAY_MIN_MS
- **Type**: Number (milliseconds)
- **Default**: `2000`
- **Description**: Minimum random delay before signal appears (for fairness).
- **Example**: `SIGNAL_DELAY_MIN_MS=2000`

### SIGNAL_DELAY_MAX_MS
- **Type**: Number (milliseconds)
- **Default**: `5000`
- **Description**: Maximum random delay before signal appears.
- **Example**: `SIGNAL_DELAY_MAX_MS=5000`

## Matchmaking Configuration

### MATCHMAKING_TIMEOUT_MS
- **Type**: Number (milliseconds)
- **Default**: `30000` (30 seconds)
- **Description**: How long to wait in matchmaking queue before timeout.
- **Example**: `MATCHMAKING_TIMEOUT_MS=30000`

### MATCH_START_TIMEOUT_MS
- **Type**: Number (milliseconds)
- **Default**: `60000` (60 seconds)
- **Description**: Grace period for players to ready up after match found.
- **Example**: `MATCH_START_TIMEOUT_MS=60000`

### STAKE_DEPOSIT_TIMEOUT_MS
- **Type**: Number (milliseconds)
- **Default**: `120000` (2 minutes)
- **Description**: Time allowed for both players to complete stake deposits before match cancellation.
- **Example**: `STAKE_DEPOSIT_TIMEOUT_MS=120000`

## Security Best Practices

1. **Never commit sensitive values** (JWT_SECRET, BACKEND_PRIVATE_KEY, API keys) to version control
2. **Use environment-specific files**:
   - `.env.development` for local development
   - `.env.production` for production (managed via hosting platform)
3. **Use strong secrets**:
   - JWT_SECRET: Generate 64+ character random string
   - BACKEND_PRIVATE_KEY: Use secure key management or hardware wallet
4. **Rotate secrets regularly** in production
5. **Use secret management services** (AWS Secrets Manager, HashiCorp Vault, etc.) for production

## Required Variables Checklist

Before deploying, ensure these are set:

- [ ] PORT
- [ ] NODE_ENV
- [ ] FRONTEND_URL (or ALLOWED_ORIGINS)
- [ ] DATABASE_URL
- [ ] REDIS_URL
- [ ] APP_ID
- [ ] DEV_PORTAL_API_KEY
- [ ] PLATFORM_WALLET_ADDRESS
- [ ] ESCROW_CONTRACT_ADDRESS
- [ ] BACKEND_PRIVATE_KEY
- [ ] WORLD_CHAIN_RPC_URL
- [ ] JWT_SECRET

## Example Production Configuration

```bash
# Server
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://app.blumea.me
ALLOWED_ORIGINS=https://www.blumea.me,https://blumea.me

# Database
DATABASE_URL=postgresql://user:pass@db.example.com:5432/blink_battle
DATABASE_SSL=true

# Redis
REDIS_URL=redis://redis.example.com:6379

# Worldcoin MiniKit
APP_ID=app_production_xxxxx
DEV_PORTAL_API_KEY=xxxxx
PLATFORM_WALLET_ADDRESS=0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

# Smart Contracts (World Chain Mainnet)
ESCROW_CONTRACT_ADDRESS=0x1234567890abcdef1234567890abcdef12345678
BACKEND_PRIVATE_KEY=xxxxx
WORLD_CHAIN_RPC_URL=https://worldchain-mainnet.g.alchemy.com/public

# Authentication
JWT_SECRET=xxxxx

# Game Settings (defaults are fine, but can customize)
PLATFORM_FEE_PERCENT=3
MATCHMAKING_TIMEOUT_MS=30000
STAKE_DEPOSIT_TIMEOUT_MS=120000
```
