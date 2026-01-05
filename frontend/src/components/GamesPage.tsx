import React from 'react';
import { PlayerProfile, GameType as GameTypeEnum } from '../games/types';
import './GamesPage.css';

interface GamesPageProps {
  onBack: () => void;
  onGameSelect: (game: GameTypeEnum) => void;
  profile: PlayerProfile | null;
}

const GamesPage: React.FC<GamesPageProps> = ({ onBack, onGameSelect, profile }) => {
  return (
    <div className="games-page">
      <div className="games-page-container">
        {/* Header */}
        <header className="games-page-header">
          <button className="back-btn" onClick={onBack}>←</button>
          <div className="header-title">
            <h1>Brain Training Games</h1>
          </div>
          <div className="header-spacer"></div>
        </header>

        {/* Quick Stats */}
        {profile && profile.totalGamesPlayed > 0 && (
          <div className="games-quick-stats">
            <div className="quick-stat-item">
              <div className="quick-stat-icon">🎮</div>
              <div className="quick-stat-value">{profile.totalGamesPlayed}</div>
              <div className="quick-stat-label">Games Played</div>
            </div>
            <div className="quick-stat-item">
              <div className="quick-stat-icon">🏆</div>
              <div className="quick-stat-value">{profile.achievements?.filter(a => a.isUnlocked).length || 0}</div>
              <div className="quick-stat-label">Achievements</div>
            </div>
            <div className="quick-stat-item">
              <div className="quick-stat-icon">⚡</div>
              <div className="quick-stat-value">{profile.level || 1}</div>
              <div className="quick-stat-label">Level</div>
            </div>
          </div>
        )}

        {/* Game Selection Cards */}
        <div className="games-section">
          <h2 className="section-title">Choose Your Challenge</h2>
          
          <div className="game-cards">
            {/* Original 3 Games */}
            <div className="game-card game-card-memory" onClick={() => onGameSelect('memory')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">🧠</div>
                <h3 className="game-title">Memory Match</h3>
                <p className="game-description">Match pairs of symbols</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-attention" onClick={() => onGameSelect('attention')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">👁️</div>
                <h3 className="game-title">Focus Test</h3>
                <p className="game-description">Hit targets quickly</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-reflex" onClick={() => onGameSelect('reflex')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">⚡</div>
                <h3 className="game-title">Reflex Rush</h3>
                <p className="game-description">Test reaction time</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            {/* Phase 2 Games */}
            <div className="game-card game-card-word" onClick={() => onGameSelect('word_flash')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">⚡</div>
                <h3 className="game-title">Word Flash</h3>
                <p className="game-description">Rapid word recognition</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-shape" onClick={() => onGameSelect('shape_shadow')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">🔲</div>
                <h3 className="game-title">Shape Shadow</h3>
                <p className="game-description">Match shadows to shapes</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-sequence" onClick={() => onGameSelect('sequence_builder')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">🔢</div>
                <h3 className="game-title">Sequence Builder</h3>
                <p className="game-description">Remember and recreate</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-filter" onClick={() => onGameSelect('focus_filter')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">🎯</div>
                <h3 className="game-title">Focus Filter</h3>
                <p className="game-description">Selective attention</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-path" onClick={() => onGameSelect('path_memory')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">🗺️</div>
                <h3 className="game-title">Path Memory</h3>
                <p className="game-description">Trace the path</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-number" onClick={() => onGameSelect('missing_number')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">🔢</div>
                <h3 className="game-title">Missing Number</h3>
                <p className="game-description">Find the gap</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-color" onClick={() => onGameSelect('color_swap')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">🎨</div>
                <h3 className="game-title">Color Swap</h3>
                <p className="game-description">Pattern matching</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-reverse" onClick={() => onGameSelect('reverse_recall')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">⏮️</div>
                <h3 className="game-title">Reverse Recall</h3>
                <p className="game-description">Backward memory</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-blink" onClick={() => onGameSelect('blink_count')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">👁️</div>
                <h3 className="game-title">Blink Count</h3>
                <p className="game-description">Count the flashes</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>

            <div className="game-card game-card-pairs" onClick={() => onGameSelect('word_pair_match')}>
              <div className="game-card-glow"></div>
              <div className="game-card-content">
                <div className="game-icon">📝</div>
                <h3 className="game-title">Word Pair Match</h3>
                <p className="game-description">Associate words</p>
                <div className="play-btn">
                  <span>Play</span>
                  <span className="play-arrow">→</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GamesPage;
