import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useGameContext } from '../context/GameContext';
import { useWebSocket } from '../hooks/useWebSocket';
import './Matchmaking.css';

const STAKE_OPTIONS = [0.1, 0.25, 0.5, 1.0];

const Matchmaking: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useGameContext();
  const { joinMatchmaking, cancelMatchmaking, playerReady, connected } = useWebSocket();
  const [selectedStake, setSelectedStake] = useState<number>(0.1);
  const [searching, setSearching] = useState(false);
  const isFree = location.state?.isFree || false;

  useEffect(() => {
    if (!state.user || !state.token) {
      navigate('/');
      return;
    }

    // If match found, navigate to game
    if (state.gamePhase === 'countdown' && state.matchId) {
      navigate('/game');
    }
  }, [state.user, state.token, state.gamePhase, state.matchId, navigate]);

  const handleJoinQueue = () => {
    if (!state.user) return;

    setSearching(true);
    joinMatchmaking(state.user.userId, isFree ? 0 : selectedStake, state.user.walletAddress);
  };

  const handleCancel = () => {
    if (!state.user) return;

    setSearching(false);
    cancelMatchmaking(state.user.userId, isFree ? 0 : selectedStake);
  };

  const handleBack = () => {
    if (searching) {
      handleCancel();
    }
    navigate('/dashboard');
  };

  if (!state.user) return null;

  return (
    <div className="matchmaking">
      <div className="matchmaking-container fade-in">
        <button className="back-btn" onClick={handleBack}>
          ← Back
        </button>

        <h1 className="title glow-primary">
          {isFree ? '🎮 Practice Mode' : '💎 PvP Staking'}
        </h1>

        {!searching ? (
          <div className="stake-selection">
            <h2>Select Your Stake</h2>
            {isFree ? (
              <div className="free-mode-info">
                <p>Practice mode is completely free!</p>
                <p className="text-dim">No stakes, no risk, just pure skill testing</p>
              </div>
            ) : (
              <>
                <p className="info-text">
                  Winner takes 97% of the pot. Platform fee: 3%
                </p>
                <div className="stake-grid">
                  {STAKE_OPTIONS.map((stake) => (
                    <div
                      key={stake}
                      className={`stake-option ${selectedStake === stake ? 'selected' : ''}`}
                      onClick={() => setSelectedStake(stake)}
                    >
                      <div className="stake-amount">{stake} WLD</div>
                      <div className="stake-payout">
                        Win: {(stake * 2 * 0.97).toFixed(2)} WLD
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <button
              className="btn btn-primary glow"
              onClick={handleJoinQueue}
              disabled={!connected}
            >
              {connected ? 'Find Opponent' : 'Connecting...'}
            </button>
          </div>
        ) : (
          <div className="searching">
            <div className="spinner pulse"></div>
            <h2>Finding Opponent...</h2>
            <p className="text-dim">
              {isFree ? 'Searching for practice partner' : `Searching for ${selectedStake} WLD stake`}
            </p>
            <div className="searching-animation">
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
            </div>
            <button className="btn btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        )}

        <div className="matchmaking-info">
          <div className="info-card">
            <h3>⚡ Fast Matching</h3>
            <p>Average wait time: 30 seconds</p>
          </div>
          <div className="info-card">
            <h3>🎯 Fair Play</h3>
            <p>Anti-cheat system active</p>
          </div>
          <div className="info-card">
            <h3>🔒 Secure</h3>
            <p>Funds locked in escrow</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Matchmaking;
