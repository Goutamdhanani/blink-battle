-- Brain Training Database Schema

-- Create game_scores table for storing individual game results
CREATE TABLE IF NOT EXISTS game_scores (
  score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  game_type VARCHAR(20) NOT NULL CHECK (game_type IN ('memory', 'attention', 'reflex')),
  score INTEGER NOT NULL,
  accuracy INTEGER NOT NULL CHECK (accuracy >= 0 AND accuracy <= 100),
  time_ms INTEGER NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_game_scores_user_id ON game_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_game_scores_game_type ON game_scores(game_type);
CREATE INDEX IF NOT EXISTS idx_game_scores_user_game ON game_scores(user_id, game_type);
CREATE INDEX IF NOT EXISTS idx_game_scores_created_at ON game_scores(created_at DESC);

-- Create view for quick stats retrieval
CREATE OR REPLACE VIEW user_game_stats AS
SELECT 
  user_id,
  game_type,
  COUNT(*) as games_played,
  MAX(score) as best_score,
  AVG(score)::integer as average_score,
  AVG(accuracy)::integer as average_accuracy,
  AVG(time_ms)::integer as average_time_ms,
  MAX(level) as highest_level,
  MAX(created_at) as last_played
FROM game_scores
GROUP BY user_id, game_type;

-- Create leaderboard view for global rankings
CREATE OR REPLACE VIEW brain_training_leaderboard AS
SELECT 
  u.user_id,
  u.wallet_address,
  COUNT(DISTINCT gs.game_type) as games_completed,
  SUM(gs.score) as total_score,
  COUNT(*) as total_games_played,
  AVG(gs.accuracy)::integer as overall_accuracy,
  MAX(gs.level) as highest_level_reached,
  MAX(gs.created_at) as last_played
FROM users u
LEFT JOIN game_scores gs ON u.user_id = gs.user_id
GROUP BY u.user_id, u.wallet_address
HAVING COUNT(*) > 0
ORDER BY total_score DESC, overall_accuracy DESC;

-- Create game-specific leaderboard view
CREATE OR REPLACE VIEW game_type_leaderboard AS
SELECT 
  u.user_id,
  u.wallet_address,
  gs.game_type,
  MAX(gs.score) as best_score,
  AVG(gs.score)::integer as average_score,
  AVG(gs.accuracy)::integer as average_accuracy,
  MAX(gs.level) as highest_level,
  COUNT(*) as games_played,
  ROW_NUMBER() OVER (PARTITION BY gs.game_type ORDER BY MAX(gs.score) DESC, AVG(gs.accuracy) DESC) as rank
FROM users u
JOIN game_scores gs ON u.user_id = gs.user_id
GROUP BY u.user_id, u.wallet_address, gs.game_type
ORDER BY gs.game_type, rank;

-- Note: The users table should already exist from the original schema
-- If it doesn't exist, create it:
CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(42) UNIQUE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);

COMMENT ON TABLE game_scores IS 'Stores individual game session results for brain training games';
COMMENT ON TABLE users IS 'Stores user account information';
