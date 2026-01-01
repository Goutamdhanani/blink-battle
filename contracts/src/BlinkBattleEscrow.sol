// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title BlinkBattleEscrow
 * @notice Immutable escrow contract for Blink Battle game on World Chain
 * @dev This contract holds stakes for 1v1 reaction time battles and distributes winnings
 * 
 * Security Features:
 * - Non-upgradeable (immutable after deployment)
 * - Owner cannot withdraw user funds (only protocol fees)
 * - Uses Checks-Effects-Interactions pattern
 * - Protected against reentrancy
 * - Clear separation between user stakes and protocol fees
 */
contract BlinkBattleEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Errors ============
    
    error InvalidMatchId();
    error MatchAlreadyExists();
    error MatchNotFound();
    error MatchAlreadyCompleted();
    error UnauthorizedCaller();
    error InvalidStakeAmount();
    error InvalidPlayer();
    error BothPlayersNotStaked();
    error InvalidWinner();
    error ZeroAddress();

    // ============ Events ============
    
    event MatchCreated(
        bytes32 indexed matchId,
        address indexed player1,
        address indexed player2,
        uint256 stakeAmount
    );
    
    event StakeDeposited(
        bytes32 indexed matchId,
        address indexed player,
        uint256 amount
    );
    
    event MatchCompleted(
        bytes32 indexed matchId,
        address indexed winner,
        uint256 winnerPayout,
        uint256 platformFee
    );
    
    event MatchCancelled(
        bytes32 indexed matchId,
        address indexed player1,
        address indexed player2,
        uint256 refundAmount
    );
    
    event PotSplit(
        bytes32 indexed matchId,
        address indexed player1,
        address indexed player2,
        uint256 payoutEach
    );
    
    event FeesWithdrawn(address indexed to, uint256 amount);

    // ============ State Variables ============
    
    /// @notice The WLD token contract on World Chain
    IERC20 public immutable wldToken;
    
    /// @notice Backend server authorized to create matches and declare winners
    address public immutable backend;
    
    /// @notice Platform wallet that receives fees
    address public immutable platformWallet;
    
    /// @notice Platform fee percentage (3 = 3%)
    uint256 public constant PLATFORM_FEE_PERCENT = 3;
    
    /// @notice Basis points for percentage calculations
    uint256 private constant BASIS_POINTS = 100;

    /// @notice Match data structure
    struct Match {
        address player1;
        address player2;
        uint256 stakeAmount;
        bool player1Staked;
        bool player2Staked;
        bool completed;
        bool cancelled;
    }
    
    /// @notice Mapping of matchId to Match data
    mapping(bytes32 => Match) public matches;
    
    /// @notice Accumulated protocol fees (separate from user stakes)
    uint256 public accumulatedFees;

    // ============ Constructor ============
    
    /**
     * @notice Initialize the escrow contract
     * @param _wldToken Address of WLD token on World Chain
     * @param _backend Address of backend server authorized to manage matches
     * @param _platformWallet Address that receives protocol fees
     */
    constructor(
        address _wldToken,
        address _backend,
        address _platformWallet
    ) {
        if (_wldToken == address(0)) revert ZeroAddress();
        if (_backend == address(0)) revert ZeroAddress();
        if (_platformWallet == address(0)) revert ZeroAddress();
        
        wldToken = IERC20(_wldToken);
        backend = _backend;
        platformWallet = _platformWallet;
    }

    // ============ Modifiers ============
    
    modifier onlyBackend() {
        if (msg.sender != backend) revert UnauthorizedCaller();
        _;
    }

    // ============ External Functions ============
    
    /**
     * @notice Create a new match (called by backend)
     * @param matchId Unique identifier for the match
     * @param player1 First player address
     * @param player2 Second player address
     * @param stakeAmount Amount each player must stake
     */
    function createMatch(
        bytes32 matchId,
        address player1,
        address player2,
        uint256 stakeAmount
    ) external onlyBackend {
        if (matchId == bytes32(0)) revert InvalidMatchId();
        if (matches[matchId].stakeAmount != 0) revert MatchAlreadyExists();
        if (player1 == address(0) || player2 == address(0)) revert InvalidPlayer();
        if (stakeAmount == 0) revert InvalidStakeAmount();
        
        matches[matchId] = Match({
            player1: player1,
            player2: player2,
            stakeAmount: stakeAmount,
            player1Staked: false,
            player2Staked: false,
            completed: false,
            cancelled: false
        });
        
        emit MatchCreated(matchId, player1, player2, stakeAmount);
    }
    
    /**
     * @notice Player deposits stake for a match
     * @param matchId Match identifier
     */
    function depositStake(bytes32 matchId) external nonReentrant {
        Match storage matchData = matches[matchId];
        
        if (matchData.stakeAmount == 0) revert MatchNotFound();
        if (matchData.completed) revert MatchAlreadyCompleted();
        if (matchData.cancelled) revert MatchAlreadyCompleted();
        
        bool isPlayer1 = msg.sender == matchData.player1;
        bool isPlayer2 = msg.sender == matchData.player2;
        
        if (!isPlayer1 && !isPlayer2) revert InvalidPlayer();
        
        if (isPlayer1 && matchData.player1Staked) revert InvalidPlayer();
        if (isPlayer2 && matchData.player2Staked) revert InvalidPlayer();
        
        // Transfer stake from player to contract
        wldToken.safeTransferFrom(msg.sender, address(this), matchData.stakeAmount);
        
        if (isPlayer1) {
            matchData.player1Staked = true;
        } else {
            matchData.player2Staked = true;
        }
        
        emit StakeDeposited(matchId, msg.sender, matchData.stakeAmount);
    }
    
    /**
     * @notice Complete match and distribute winnings (called by backend)
     * @param matchId Match identifier
     * @param winner Address of the winner
     */
    function completeMatch(
        bytes32 matchId,
        address winner
    ) external onlyBackend nonReentrant {
        Match storage matchData = matches[matchId];
        
        if (matchData.stakeAmount == 0) revert MatchNotFound();
        if (matchData.completed) revert MatchAlreadyCompleted();
        if (matchData.cancelled) revert MatchAlreadyCompleted();
        if (!matchData.player1Staked || !matchData.player2Staked) revert BothPlayersNotStaked();
        
        if (winner != matchData.player1 && winner != matchData.player2) revert InvalidWinner();
        
        matchData.completed = true;
        
        uint256 totalPot = matchData.stakeAmount * 2;
        uint256 platformFee = (totalPot * PLATFORM_FEE_PERCENT) / BASIS_POINTS;
        uint256 winnerPayout = totalPot - platformFee;
        
        // Update state before external calls (Checks-Effects-Interactions)
        accumulatedFees += platformFee;
        
        // Transfer winnings to winner
        wldToken.safeTransfer(winner, winnerPayout);
        
        emit MatchCompleted(matchId, winner, winnerPayout, platformFee);
    }
    
    /**
     * @notice Split pot 50/50 for tie scenarios (called by backend)
     * @param matchId Match identifier
     */
    function splitPot(bytes32 matchId) external onlyBackend nonReentrant {
        Match storage matchData = matches[matchId];
        
        if (matchData.stakeAmount == 0) revert MatchNotFound();
        if (matchData.completed) revert MatchAlreadyCompleted();
        if (matchData.cancelled) revert MatchAlreadyCompleted();
        if (!matchData.player1Staked || !matchData.player2Staked) revert BothPlayersNotStaked();
        
        matchData.completed = true;
        
        uint256 totalPot = matchData.stakeAmount * 2;
        uint256 platformFee = (totalPot * PLATFORM_FEE_PERCENT) / BASIS_POINTS;
        uint256 remainingPot = totalPot - platformFee;
        uint256 payoutEach = remainingPot / 2;
        
        // Update state before external calls
        accumulatedFees += platformFee;
        
        // Transfer half to each player
        wldToken.safeTransfer(matchData.player1, payoutEach);
        wldToken.safeTransfer(matchData.player2, payoutEach);
        
        emit PotSplit(matchId, matchData.player1, matchData.player2, payoutEach);
    }
    
    /**
     * @notice Cancel match and refund both players (called by backend)
     * @param matchId Match identifier
     */
    function cancelMatch(bytes32 matchId) external onlyBackend nonReentrant {
        Match storage matchData = matches[matchId];
        
        if (matchData.stakeAmount == 0) revert MatchNotFound();
        if (matchData.completed) revert MatchAlreadyCompleted();
        if (matchData.cancelled) revert MatchAlreadyCompleted();
        
        matchData.cancelled = true;
        
        // Refund players who have staked
        if (matchData.player1Staked) {
            wldToken.safeTransfer(matchData.player1, matchData.stakeAmount);
        }
        
        if (matchData.player2Staked) {
            wldToken.safeTransfer(matchData.player2, matchData.stakeAmount);
        }
        
        emit MatchCancelled(
            matchId,
            matchData.player1,
            matchData.player2,
            matchData.stakeAmount
        );
    }
    
    /**
     * @notice Withdraw accumulated protocol fees to platform wallet
     * @dev Only platform wallet can call this
     */
    function withdrawFees() external nonReentrant {
        if (msg.sender != platformWallet) revert UnauthorizedCaller();
        
        uint256 amount = accumulatedFees;
        if (amount == 0) return;
        
        // Update state before external call
        accumulatedFees = 0;
        
        wldToken.safeTransfer(platformWallet, amount);
        
        emit FeesWithdrawn(platformWallet, amount);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get match details
     * @param matchId Match identifier
     * @return Match data
     */
    function getMatch(bytes32 matchId) external view returns (Match memory) {
        return matches[matchId];
    }
    
    /**
     * @notice Check if match is ready (both players staked)
     * @param matchId Match identifier
     * @return True if both players have staked
     */
    function isMatchReady(bytes32 matchId) external view returns (bool) {
        Match storage matchData = matches[matchId];
        return matchData.player1Staked && matchData.player2Staked;
    }
}
