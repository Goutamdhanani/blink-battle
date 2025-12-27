import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameContext } from '../context/GameContext';
import { minikit } from '../lib/minikit';
import './PracticeMode.css';

type PracticePhase = 'idle' | 'ready' | 'waiting' | 'go' | 'result';

interface AttemptResult {
  reactionTime: number | null;
  falseStart: boolean;
}

const PracticeMode: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useGameContext();
  const [phase, setPhase] = useState<PracticePhase>('idle');
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [falseStart, setFalseStart] = useState(false);
  const [attempts, setAttempts] = useState<AttemptResult[]>([]);
  const [bestTime, setBestTime] = useState<number | null>(null);
  const signalTimeRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!state.user) {
      navigate('/');
    }
  }, [state.user, navigate]);

  useEffect(() => {
    console.log('Practice mode: User started practice session');
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleStart = () => {
    setPhase('ready');
    setReactionTime(null);
    setFalseStart(false);
    signalTimeRef.current = null;

    // Show "Get Ready" for 1 second
    setTimeout(() => {
      setPhase('waiting');
      
      // Random delay between 1500ms and 4500ms
      const randomDelay = 1500 + Math.random() * 3000;
      
      timeoutRef.current = window.setTimeout(() => {
        signalTimeRef.current = Date.now();
        setPhase('go');
        minikit.sendHaptic('success');
        
        // Auto timeout after 3 seconds
        timeoutRef.current = window.setTimeout(() => {
          if (phase === 'go') {
            handleTimeout();
          }
        }, 3000);
      }, randomDelay);
    }, 1000);
  };

  const handleTap = () => {
    const tapTime = Date.now();

    if (phase === 'waiting') {
      // False start!
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setFalseStart(true);
      setPhase('result');
      minikit.sendHaptic('error');
      
      const newAttempt: AttemptResult = { reactionTime: null, falseStart: true };
      setAttempts(prev => [...prev, newAttempt].slice(-5)); // Keep last 5
      
      console.log('Practice mode: False start');
    } else if (phase === 'go' && signalTimeRef.current) {
      // Valid tap!
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      const reaction = tapTime - signalTimeRef.current;
      setReactionTime(reaction);
      setPhase('result');
      minikit.sendHaptic('success');
      
      // Fallback vibration for browsers
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      
      const newAttempt: AttemptResult = { reactionTime: reaction, falseStart: false };
      const updatedAttempts = [...attempts, newAttempt].slice(-5); // Keep last 5
      setAttempts(updatedAttempts);
      
      // Update best time from valid attempts
      const validTimes = updatedAttempts
        .filter(a => !a.falseStart && a.reactionTime !== null)
        .map(a => a.reactionTime!);
      
      if (validTimes.length > 0) {
        const newBest = Math.min(...validTimes);
        setBestTime(newBest);
      }
      
      console.log(`Practice mode: Reaction time ${reaction}ms`);
    }
  };

  const handleTimeout = () => {
    setPhase('result');
    setReactionTime(null);
    
    const newAttempt: AttemptResult = { reactionTime: null, falseStart: false };
    setAttempts(prev => [...prev, newAttempt].slice(-5));
    
    console.log('Practice mode: Timeout (no tap)');
  };

  const handleTryAgain = () => {
    handleStart();
  };

  const handleBack = () => {
    navigate('/dashboard');
  };

  const renderContent = () => {
    switch (phase) {
      case 'idle':
        return (
          <div className="practice-content fade-in">
            <div className="practice-info">
              <h2>⚡ Reaction Test</h2>
              <p>Test your reaction time without any stakes!</p>
              <div className="practice-instructions">
                <p>• Tap Start to begin</p>
                <p>• Wait for the green "GO!" signal</p>
                <p>• Tap as fast as you can</p>
                <p>• Don't tap early or you'll false start!</p>
              </div>
            </div>
            
            {attempts.length > 0 && (
              <div className="practice-stats">
                {bestTime !== null && (
                  <div className="stat-card">
                    <div className="stat-value glow-primary">{bestTime}ms</div>
                    <div className="stat-label">Best Time</div>
                  </div>
                )}
                {attempts.length > 0 && attempts[attempts.length - 1].reactionTime !== null && (
                  <div className="stat-card">
                    <div className="stat-value">
                      {attempts[attempts.length - 1].reactionTime}ms
                    </div>
                    <div className="stat-label">Last Time</div>
                  </div>
                )}
                <div className="stat-card">
                  <div className="stat-value">{attempts.length}</div>
                  <div className="stat-label">Attempts</div>
                </div>
              </div>
            )}
            
            <button className="btn btn-primary glow" onClick={handleStart}>
              Start Practice
            </button>
          </div>
        );

      case 'ready':
        return (
          <div className="practice-content fade-in">
            <h2 className="phase-title glow-secondary">Get Ready...</h2>
            <div className="focus-circle pulse"></div>
          </div>
        );

      case 'waiting':
        return (
          <div className="practice-content fade-in" onClick={handleTap}>
            <div className="waiting-area">
              <h2 className="phase-title">Wait for it...</h2>
              <div className="focus-circle pulse-slow"></div>
              <p className="warning-text">Don't tap early!</p>
            </div>
          </div>
        );

      case 'go':
        return (
          <div className="practice-content go-phase fade-in" onClick={handleTap}>
            <div className="tap-button glow">
              <div className="tap-button-inner">
                <span className="tap-text">GO!</span>
              </div>
            </div>
          </div>
        );

      case 'result':
        return (
          <div className="practice-content fade-in">
            {falseStart ? (
              <div className="result-content">
                <div className="result-icon error">❌</div>
                <h2 className="result-title">False Start!</h2>
                <p className="result-message">You tapped too early. Wait for the green signal!</p>
              </div>
            ) : reactionTime !== null ? (
              <div className="result-content">
                <div className="result-icon success">✓</div>
                <h2 className="result-title">Great!</h2>
                <div className="reaction-display glow-primary">
                  {reactionTime}ms
                </div>
                {bestTime === reactionTime && attempts.filter(a => !a.falseStart && a.reactionTime !== null).length > 1 && (
                  <p className="result-message success">🎉 New Personal Best!</p>
                )}
              </div>
            ) : (
              <div className="result-content">
                <div className="result-icon error">⏱️</div>
                <h2 className="result-title">Too Slow!</h2>
                <p className="result-message">You didn't tap in time. Try to be faster!</p>
              </div>
            )}
            
            <button className="btn btn-primary glow" onClick={handleTryAgain}>
              Try Again
            </button>
            
            {attempts.length > 0 && (
              <div className="recent-attempts">
                <h3>Recent Attempts</h3>
                <div className="attempts-list">
                  {[...attempts].reverse().map((attempt, idx) => (
                    <div key={attempts.length - idx} className="attempt-item">
                      <span className="attempt-number">#{attempts.length - idx}</span>
                      <span className="attempt-result">
                        {attempt.falseStart 
                          ? '❌ False Start' 
                          : attempt.reactionTime 
                            ? `${attempt.reactionTime}ms` 
                            : '⏱️ Timeout'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
    }
  };

  if (!state.user) return null;

  return (
    <div className="practice-mode">
      <div className="practice-container">
        <button className="back-btn" onClick={handleBack}>
          ← Back
        </button>

        <h1 className="title glow-primary">🎮 Practice Mode</h1>

        {renderContent()}
      </div>
    </div>
  );
};

export default PracticeMode;
