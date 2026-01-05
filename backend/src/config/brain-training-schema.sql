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
