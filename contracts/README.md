# Blink Battle Escrow Smart Contract

This directory contains the Solidity smart contract for the Blink Battle game escrow system on World Chain.

## Overview

The `BlinkBattleEscrow` contract is an immutable, non-upgradeable escrow contract that:
- Holds WLD stakes for 1v1 reaction time battles
- Distributes 97% of the pot to the winner
- Collects 3% platform fee (stored separately from user funds)
- Allows full refunds for cancelled matches
- Supports pot splitting for tie scenarios

## Smart Contract Guidelines Compliance

This contract follows [Worldcoin Mini App Smart Contract Development Guidelines](https://docs.world.org/mini-apps/guidelines/smart-contract-development-guidelines):

✅ **Non-upgradeable**: Contract is immutable after deployment  
✅ **No owner fund theft**: Owner cannot withdraw user stakes (only protocol fees)  
✅ **Clear separation**: User stakes and protocol fees are tracked separately  
✅ **Security**: Uses OpenZeppelin contracts, ReentrancyGuard, Checks-Effects-Interactions pattern  
✅ **Tested**: Comprehensive test suite with Foundry

## Prerequisites

1. Install [Foundry](https://book.getfoundry.sh/getting-started/installation):
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

2. Install OpenZeppelin contracts:
   ```bash
   cd contracts
   forge install OpenZeppelin/openzeppelin-contracts
   ```

## Build & Test

```bash
cd contracts

# Build the contract
forge build

# Run tests
forge test

# Run tests with verbosity
forge test -vvv

# Generate gas report
forge test --gas-report
```

## Deployment

### 1. Set Environment Variables

```bash
# Your deployer private key
export PRIVATE_KEY=0x...

# Backend server address (authorized to create matches and declare winners)
export BACKEND_ADDRESS=0x...

# Platform wallet address (receives protocol fees)
export PLATFORM_WALLET=0x...
```

### 2. Deploy to World Chain Sepolia (Testnet)

```bash
forge script script/Deploy.s.sol:DeployEscrow \
  --rpc-url worldchain_sepolia \
  --broadcast \
  --verify
```

### 3. Deploy to World Chain Mainnet

```bash
forge script script/Deploy.s.sol:DeployEscrow \
  --rpc-url worldchain \
  --broadcast \
  --verify
```

## Post-Deployment Configuration

### 1. Update Developer Portal

After deployment, you **must** allowlist the contract and token in the [World Developer Portal](https://developer.worldcoin.org/):

1. Go to **Your App → Configuration → Advanced**
2. Add your deployed **contract address**
3. Add **WLD token address**:
   - Mainnet: `0x2cFc85d8E48F8EAb294be644d9E25C3030863003`
   - Sepolia: `0x163f182C32d24A09D91a9f3A0Baf48daf3b28C0D`

Without this allowlisting, `sendTransaction` calls will fail.

### 2. Update Environment Variables

Update your backend `.env`:
```bash
ESCROW_CONTRACT_ADDRESS=0x...  # Your deployed contract address
```

Update your frontend `.env`:
```bash
VITE_ESCROW_CONTRACT_ADDRESS=0x...  # Your deployed contract address
```

## Contract Interface

### Key Functions

#### For Backend (onlyBackend)
- `createMatch(matchId, player1, player2, stakeAmount)` - Create a new match
- `completeMatch(matchId, winner)` - Award winner and collect fee
- `splitPot(matchId)` - Split pot 50/50 for ties
- `cancelMatch(matchId)` - Cancel and refund both players

#### For Players
- `depositStake(matchId)` - Deposit WLD stake for a match

#### For Platform Wallet
- `withdrawFees()` - Withdraw accumulated protocol fees

### View Functions
- `getMatch(matchId)` - Get match details
- `isMatchReady(matchId)` - Check if both players have staked
- `accumulatedFees()` - View total accumulated fees

## World Chain Network Information

### Mainnet
- Chain ID: `480`
- RPC: `https://worldchain-mainnet.g.alchemy.com/public`
- WLD Token: `0x2cFc85d8E48F8EAb294be644d9E25C3030863003`
- Explorer: https://worldchain-mainnet.explorer.alchemy.com

### Sepolia (Testnet)
- Chain ID: `4801`
- RPC: `https://worldchain-sepolia.g.alchemy.com/public`
- WLD Token: `0x163f182C32d24A09D91a9f3A0Baf48daf3b28C0D`
- Explorer: https://worldchain-sepolia.explorer.alchemy.com

## Security Considerations

1. **Immutability**: Contract cannot be upgraded. Test thoroughly before mainnet deployment.
2. **Backend Key Security**: The backend private key has significant power. Protect it carefully.
3. **Gas Costs**: Consider gas costs for players when depositing stakes.
4. **Frontend Integration**: Ensure frontend uses `sendTransaction` with proper ABI and parameters.

## Integration with Mini App

See the main README for details on integrating with the MiniKit frontend and backend services.

## References

- [World Chain Deployment Guide](https://docs.world.org/world-chain/developers/deploy)
- [Mini App Smart Contract Guidelines](https://docs.world.org/mini-apps/guidelines/smart-contract-development-guidelines)
- [Send Transaction Command](https://docs.world.org/mini-apps/commands/send-transaction)
- [World Chain Network Info](https://docs.world.org/world-chain/reference/useful-contracts)
