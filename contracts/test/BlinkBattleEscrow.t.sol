// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BlinkBattleEscrow.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockWLD is ERC20 {
    constructor() ERC20("World Token", "WLD") {
        _mint(msg.sender, 1000000 * 10**18);
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract BlinkBattleEscrowTest is Test {
    BlinkBattleEscrow public escrow;
    MockWLD public wld;
    
    address public backend = address(0x1);
    address public platformWallet = address(0x2);
    address public player1 = address(0x3);
    address public player2 = address(0x4);
    
    bytes32 public constant MATCH_ID = keccak256("match1");
    uint256 public constant STAKE_AMOUNT = 1 * 10**18; // 1 WLD
    
    function setUp() public {
        // Deploy mock WLD token
        wld = new MockWLD();
        
        // Deploy escrow
        escrow = new BlinkBattleEscrow(
            address(wld),
            backend,
            platformWallet
        );
        
        // Mint tokens to players
        wld.mint(player1, 10 * 10**18);
        wld.mint(player2, 10 * 10**18);
        
        // Approve escrow to spend tokens
        vm.prank(player1);
        wld.approve(address(escrow), type(uint256).max);
        
        vm.prank(player2);
        wld.approve(address(escrow), type(uint256).max);
    }
    
    function testCreateMatch() public {
        vm.prank(backend);
        escrow.createMatch(MATCH_ID, player1, player2, STAKE_AMOUNT);
        
        BlinkBattleEscrow.Match memory matchData = escrow.getMatch(MATCH_ID);
        assertEq(matchData.player1, player1);
        assertEq(matchData.player2, player2);
        assertEq(matchData.stakeAmount, STAKE_AMOUNT);
        assertFalse(matchData.player1Staked);
        assertFalse(matchData.player2Staked);
    }
    
    function testDepositStake() public {
        // Create match
        vm.prank(backend);
        escrow.createMatch(MATCH_ID, player1, player2, STAKE_AMOUNT);
        
        // Player 1 deposits
        uint256 balanceBefore = wld.balanceOf(player1);
        vm.prank(player1);
        escrow.depositStake(MATCH_ID);
        
        assertEq(wld.balanceOf(player1), balanceBefore - STAKE_AMOUNT);
        assertTrue(escrow.getMatch(MATCH_ID).player1Staked);
        
        // Player 2 deposits
        vm.prank(player2);
        escrow.depositStake(MATCH_ID);
        
        assertTrue(escrow.getMatch(MATCH_ID).player2Staked);
        assertTrue(escrow.isMatchReady(MATCH_ID));
    }
    
    function testCompleteMatch() public {
        // Setup match with both stakes
        vm.prank(backend);
        escrow.createMatch(MATCH_ID, player1, player2, STAKE_AMOUNT);
        
        vm.prank(player1);
        escrow.depositStake(MATCH_ID);
        
        vm.prank(player2);
        escrow.depositStake(MATCH_ID);
        
        // Complete match with player1 as winner
        uint256 balanceBefore = wld.balanceOf(player1);
        vm.prank(backend);
        escrow.completeMatch(MATCH_ID, player1);
        
        // Check winner got 97% of pot (2 WLD * 97% = 1.94 WLD)
        uint256 expectedPayout = (STAKE_AMOUNT * 2 * 97) / 100;
        assertEq(wld.balanceOf(player1), balanceBefore + expectedPayout);
        
        // Check fees accumulated
        uint256 expectedFees = (STAKE_AMOUNT * 2 * 3) / 100;
        assertEq(escrow.accumulatedFees(), expectedFees);
    }
    
    function testSplitPot() public {
        // Setup match
        vm.prank(backend);
        escrow.createMatch(MATCH_ID, player1, player2, STAKE_AMOUNT);
        
        vm.prank(player1);
        escrow.depositStake(MATCH_ID);
        
        vm.prank(player2);
        escrow.depositStake(MATCH_ID);
        
        // Split pot
        uint256 balance1Before = wld.balanceOf(player1);
        uint256 balance2Before = wld.balanceOf(player2);
        
        vm.prank(backend);
        escrow.splitPot(MATCH_ID);
        
        // Each player gets 48.5% (97% / 2)
        uint256 expectedPayout = ((STAKE_AMOUNT * 2 * 97) / 100) / 2;
        assertEq(wld.balanceOf(player1), balance1Before + expectedPayout);
        assertEq(wld.balanceOf(player2), balance2Before + expectedPayout);
    }
    
    function testCancelMatch() public {
        // Setup match
        vm.prank(backend);
        escrow.createMatch(MATCH_ID, player1, player2, STAKE_AMOUNT);
        
        vm.prank(player1);
        escrow.depositStake(MATCH_ID);
        
        vm.prank(player2);
        escrow.depositStake(MATCH_ID);
        
        // Cancel and refund
        uint256 balance1Before = wld.balanceOf(player1);
        uint256 balance2Before = wld.balanceOf(player2);
        
        vm.prank(backend);
        escrow.cancelMatch(MATCH_ID);
        
        // Both players get full refund
        assertEq(wld.balanceOf(player1), balance1Before + STAKE_AMOUNT);
        assertEq(wld.balanceOf(player2), balance2Before + STAKE_AMOUNT);
    }
    
    function testWithdrawFees() public {
        // Complete a match to accumulate fees
        vm.prank(backend);
        escrow.createMatch(MATCH_ID, player1, player2, STAKE_AMOUNT);
        
        vm.prank(player1);
        escrow.depositStake(MATCH_ID);
        
        vm.prank(player2);
        escrow.depositStake(MATCH_ID);
        
        vm.prank(backend);
        escrow.completeMatch(MATCH_ID, player1);
        
        // Withdraw fees
        uint256 fees = escrow.accumulatedFees();
        assertTrue(fees > 0);
        
        uint256 balanceBefore = wld.balanceOf(platformWallet);
        vm.prank(platformWallet);
        escrow.withdrawFees();
        
        assertEq(wld.balanceOf(platformWallet), balanceBefore + fees);
        assertEq(escrow.accumulatedFees(), 0);
    }
    
    function testCannotCreateMatchAsNonBackend() public {
        vm.expectRevert(BlinkBattleEscrow.UnauthorizedCaller.selector);
        escrow.createMatch(MATCH_ID, player1, player2, STAKE_AMOUNT);
    }
    
    function testCannotWithdrawFeesAsNonPlatform() public {
        vm.expectRevert(BlinkBattleEscrow.UnauthorizedCaller.selector);
        vm.prank(player1);
        escrow.withdrawFees();
    }
}
