# Blink Battle - Smart Contract Deployment & Integration Guide

This guide covers deploying the BlinkBattleEscrow smart contract to World Chain and integrating it with the Blink Battle Mini App.

## Overview

The Blink Battle escrow system uses a smart contract on World Chain to:
- Hold player stakes securely in an immutable escrow
- Automatically distribute 97% of the pot to winners
- Collect 3% platform fee (separate from user funds)
- Enable full refunds for cancelled matches
- Support 50/50 pot splitting for ties

## Prerequisites

1. **Foundry** (for contract deployment)
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

2. **World App Account** with WLD tokens (for testing)

3. **World Developer Portal Account**
   - Sign up at [developer.worldcoin.org](https://developer.worldcoin.org/)
   - Create a Mini App project

## Step 1: Deploy the Smart Contract

### 1.1 Install Dependencies

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts
```

### 1.2 Set Environment Variables

Create a `.env` file in the `contracts` directory:

```bash
# Deployer private key (DO NOT commit this!)
PRIVATE_KEY=0x...

# Backend server address (will be authorized to manage matches)
BACKEND_ADDRESS=0x...

# Platform wallet address (receives protocol fees)
PLATFORM_WALLET=0x...
```

### 1.3 Deploy to World Chain Sepolia (Testnet)

```bash
forge script script/Deploy.s.sol:DeployEscrow \
  --rpc-url worldchain_sepolia \
  --broadcast \
  --verify
```

Save the deployed contract address from the output!

### 1.4 Deploy to World Chain Mainnet (Production)

```bash
forge script script/Deploy.s.sol:DeployEscrow \
  --rpc-url worldchain \
  --broadcast \
  --verify
```

## Step 2: Configure World Developer Portal

**CRITICAL**: You must allowlist your contract and token in the Developer Portal, or `sendTransaction` will fail.

1. Go to [developer.worldcoin.org](https://developer.worldcoin.org/)
2. Select your Mini App project
3. Navigate to **Configuration → Advanced**
4. Add the following addresses:

   **For Testnet (Sepolia):**
   - Contract Address: `<your deployed escrow address>`
   - WLD Token: `0x163f182C32d24A09D91a9f3A0Baf48daf3b28C0D`

   **For Mainnet:**
   - Contract Address: `<your deployed escrow address>`
   - WLD Token: `0x2cFc85d8E48F8EAb294be644d9E25C3030863003`

5. Save changes

## Step 3: Configure Backend

Update `backend/.env`:

```bash
# Smart Contract Configuration
ESCROW_CONTRACT_ADDRESS=<your deployed contract address>
BACKEND_PRIVATE_KEY=<same as PRIVATE_KEY used for deployment>
WORLD_CHAIN_RPC_URL=https://worldchain-mainnet.g.alchemy.com/public
# For testnet: https://worldchain-sepolia.g.alchemy.com/public
```

Install dependencies:
```bash
cd backend
npm install  # or yarn/pnpm
```

## Step 4: Configure Frontend

Update `frontend/.env`:

```bash
# Smart Contract Configuration
VITE_ESCROW_CONTRACT_ADDRESS=<your deployed contract address>
VITE_WLD_TOKEN_ADDRESS=0x2cFc85d8E48F8EAb294be644d9E25C3030863003
# For testnet: 0x163f182C32d24A09D91a9f3A0Baf48daf3b28C0D
```

Install dependencies:
```bash
cd frontend
npm install  # or yarn/pnpm
```

## Step 5: Test the Integration

### Local Testing (Backend)

1. Start the backend:
   ```bash
   cd backend
   npm run dev
   ```

2. Check logs for:
   ```
   [ContractService] Initialized with contract: 0x...
   ```

### Integration Testing (Frontend + Backend)

1. Start both services:
   ```bash
   # Terminal 1
   cd backend && npm run dev

   # Terminal 2
   cd frontend && npm run dev
   ```

2. Open in World App (or simulator)

3. Test the payment flow:
   - Select a stake amount (e.g., 0.1 WLD)
   - Click "Find Opponent"
   - Approve WLD spending (first transaction)
   - Deposit stake (second transaction)
   - Both transactions should complete successfully

### Verify On-Chain

Check your transactions on World Chain Explorer:
- **Mainnet**: https://worldchain-mainnet.explorer.alchemy.com
- **Sepolia**: https://worldchain-sepolia.explorer.alchemy.com

Search for your escrow contract address to see:
- `StakeDeposited` events when players deposit
- `MatchCompleted` events when matches finish
- `MatchCancelled` events for refunds

## Troubleshooting

### "Not allowed by contract allowlist"

**Solution**: Make sure you've added both the escrow contract AND WLD token addresses to the Developer Portal allowlist.

### "Insufficient allowance"

**Solution**: The approval transaction failed or wasn't confirmed. Users need to approve WLD spending before depositing.

### "Match not found"

**Solution**: The backend needs to call `createMatch` on the contract before players can deposit stakes. Check backend logs for contract service errors.

### "Transaction reverted"

**Possible causes**:
- Match already completed/cancelled
- Player already staked
- Invalid player address
- Insufficient WLD balance

Check the specific revert reason in the transaction details on the explorer.

## Architecture Flow

```
┌─────────────────┐
│   Player 1/2    │
│   (Frontend)    │
└────────┬────────┘
         │
         │ 1. Find Opponent (WebSocket)
         │
         ▼
┌─────────────────┐        2. createMatch()        ┌──────────────────┐
│     Backend     │───────────────────────────────▶│  Smart Contract  │
│   (WebSocket +  │                                 │   (World Chain)  │
│ ContractService)│                                 └──────────────────┘
└────────┬────────┘                                          ▲
         │                                                   │
         │ 3. Match found event                             │
         │    + matchId                                      │
         ▼                                                   │
┌─────────────────┐                                          │
│   Player 1/2    │                                          │
│   (Frontend)    │                                          │
└────────┬────────┘                                          │
         │                                                   │
         │ 4a. Approve WLD (sendTransaction)               │
         │────────────────────────────────────────────────▶│
         │                                                   │
         │ 4b. Deposit stake (sendTransaction)             │
         │────────────────────────────────────────────────▶│
         │                                                   │
         │ 5. Both staked → Game starts                    │
         │                                                   │
         │ 6. Game completes                                │
         ▼                                                   │
┌─────────────────┐                                          │
│     Backend     │                                          │
│  (GameHandler)  │       7. completeMatch(winner)          │
└────────┬────────┘───────────────────────────────────────▶│
         │                                                   │
         │                                                   │
         │ 8. Winner receives payout automatically         │
         │    Platform fee accumulated in contract          │
         └───────────────────────────────────────────────────┘
```

## Security Considerations

1. **Backend Private Key**: This key controls match outcomes. Protect it carefully.
2. **Contract is Immutable**: No upgrades possible. Test thoroughly on testnet first.
3. **Gas Costs**: Players pay gas for approval + deposit transactions (~2 transactions).
4. **Transaction Timing**: Handle pending transactions gracefully in the UI.

## Next Steps

- Monitor accumulated fees with `contract.accumulatedFees()`
- Platform wallet can withdraw fees anytime with `contract.withdrawFees()`
- Review contract events for analytics and debugging
- Set up monitoring/alerting for failed transactions

## Reference Links

- [World Chain Docs](https://docs.world.org/world-chain)
- [Mini App Guidelines](https://docs.world.org/mini-apps/guidelines/smart-contract-development-guidelines)
- [Send Transaction API](https://docs.world.org/mini-apps/commands/send-transaction)
- [Contract Source Code](./contracts/src/BlinkBattleEscrow.sol)
