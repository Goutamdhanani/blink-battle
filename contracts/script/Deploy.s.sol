// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BlinkBattleEscrow.sol";

/**
 * @title Deploy script for BlinkBattleEscrow
 * @notice Deploy the escrow contract to World Chain
 * 
 * Usage:
 * 
 * 1. Set environment variables:
 *    export PRIVATE_KEY=your_private_key
 *    export BACKEND_ADDRESS=your_backend_address
 *    export PLATFORM_WALLET=your_platform_wallet
 * 
 * 2. Deploy to World Chain Sepolia (testnet):
 *    forge script script/Deploy.s.sol:DeployEscrow --rpc-url worldchain_sepolia --broadcast --verify
 * 
 * 3. Deploy to World Chain Mainnet:
 *    forge script script/Deploy.s.sol:DeployEscrow --rpc-url worldchain --broadcast --verify
 */
contract DeployEscrow is Script {
    // World Chain Mainnet WLD token address
    address constant WLD_MAINNET = 0x2cFc85d8E48F8EAb294be644d9E25C3030863003;
    
    // World Chain Sepolia WLD token address (testnet)
    address constant WLD_SEPOLIA = 0x163f182C32d24A09D91a9f3A0Baf48daf3b28C0D;
    
    function run() external {
        // Read deployment parameters from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address backendAddress = vm.envAddress("BACKEND_ADDRESS");
        address platformWallet = vm.envAddress("PLATFORM_WALLET");
        
        // Determine which network we're on based on chain ID
        uint256 chainId = block.chainid;
        address wldToken;
        
        if (chainId == 480) {
            // World Chain Mainnet
            wldToken = WLD_MAINNET;
            console.log("Deploying to World Chain Mainnet");
        } else if (chainId == 4801) {
            // World Chain Sepolia
            wldToken = WLD_SEPOLIA;
            console.log("Deploying to World Chain Sepolia");
        } else {
            revert("Unsupported chain ID");
        }
        
        console.log("WLD Token:", wldToken);
        console.log("Backend:", backendAddress);
        console.log("Platform Wallet:", platformWallet);
        
        vm.startBroadcast(deployerPrivateKey);
        
        BlinkBattleEscrow escrow = new BlinkBattleEscrow(
            wldToken,
            backendAddress,
            platformWallet
        );
        
        vm.stopBroadcast();
        
        console.log("BlinkBattleEscrow deployed at:", address(escrow));
        console.log("");
        console.log("IMPORTANT: Add this contract address to your World Developer Portal:");
        console.log("1. Go to Developer Portal > Your App > Configuration > Advanced");
        console.log("2. Add contract address:", address(escrow));
        console.log("3. Add WLD token address:", wldToken);
    }
}
