-- Phase 2: Brain Training Expansion - Database Schema
-- Adds XP system, achievements, trends, themes, and enhanced profile data

-- ===========================================
-- 1. USER PROFILE ENHANCEMENTS
-- ===========================================

-- Add new columns to users table for Phase 2 features
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rank_badge VARCHAR(50) DEFAULT 'Rookie';
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_play_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_play_time_ms BIGINT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cognitive_index INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_theme VARCHAR(50) DEFAULT 'Rookie';

-- Create index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);
CREATE INDEX IF NOT EXISTS idx_users_level ON users(level DESC);

-- ===========================================
-- 2. XP AND LEVELING SYSTEM
-- ===========================================

-- XP thresholds table for level progression
CREATE TABLE IF NOT EXISTS xp_levels (
  level INTEGER PRIMARY KEY,
  xp_required INTEGER NOT NULL,
  rank_badge VARCHAR(50) NOT NULL,
  theme_unlocked VARCHAR(50)
);

-- Insert level thresholds
INSERT INTO xp_levels (level, xp_required, rank_badge, theme_unlocked) VALUES
  (1, 0, 'Rookie', 'Rookie'),
  (2, 100, 'Rookie', NULL),
  (3, 250, 'Rookie', NULL),
  (4, 500, 'Experienced', 'Experienced'),
  (5, 1000, 'Experienced', NULL),
  (6, 2000, 'Experienced', NULL),
  (7, 3500, 'Elite', 'Elite'),
  (8, 5500, 'Elite', NULL),
  (9, 8000, 'Elite', NULL),
  (10, 12000, 'Master', 'Hacker Mode'),
  (11, 17000, 'Master', NULL),
  (12, 23000, 'Master', NULL),
  (13, 30000, 'Legend', 'Premium Dark'),
  (14, 40000, 'Legend', NULL),
  (15, 50000, 'Legend', NULL)
ON CONFLICT (level) DO NOTHING;

-- ===========================================
-- 3. ACHIEVEMENT SYSTEM
-- ===========================================

-- Achievement definitions table
CREATE TABLE IF NOT EXISTS achievements (
  achievement_id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  icon VARCHAR(10) NOT NULL,
  category VARCHAR(50) NOT NULL,
  xp_reward INTEGER DEFAULT 50,
  unlock_criteria JSONB NOT NULL
);

-- Insert achievement definitions
INSERT INTO achievements (achievement_id, name, description, icon, category, xp_reward, unlock_criteria) VALUES
  ('sharp_mind', 'Sharp Mind', 'Score 90% or higher in any game', '🧠', 'skill', 100, '{"type": "accuracy", "value": 90}'),
  ('consistency_freak', 'Consistency Freak', 'Play for 7 days in a row', '📅', 'streak', 200, '{"type": "streak", "value": 7}'),
  ('speed_demon', 'Speed Demon', 'Achieve average reaction time under 300ms', '⚡', 'skill', 150, '{"type": "reaction", "value": 300}'),
  ('memory_master', 'Memory Master', 'Reach level 10 in Memory Match', '🎮', 'game', 150, '{"type": "level", "game": "memory", "value": 10}'),
  ('focus_guru', 'Focus Guru', 'Reach level 10 in Focus Test', '👁️', 'game', 150, '{"type": "level", "game": "attention", "value": 10}'),
  ('reflex_champion', 'Reflex Champion', 'Reach level 10 in Reflex Rush', '⚡', 'game', 150, '{"type": "level", "game": "reflex", "value": 10}'),
  ('completionist', 'Completionist', 'Play all 13 brain training games', '🏆', 'variety', 300, '{"type": "unique_games", "value": 13}'),
  ('dedicated_trainer', 'Dedicated Trainer', 'Play 50 total games', '💪', 'volume', 100, '{"type": "total_games", "value": 50}'),
  ('brain_athlete', 'Brain Athlete', 'Play 100 total games', '🎯', 'volume', 200, '{"type": "total_games", "value": 100}'),
  ('cognitive_champion', 'Cognitive Champion', 'Reach Cognitive Index of 80', '👑', 'skill', 250, '{"type": "cognitive_index", "value": 80}'),
  ('night_owl', 'Night Owl', 'Play 10 games between midnight and 5am', '🦉', 'special', 100, '{"type": "time_of_day", "start": 0, "end": 5, "count": 10}'),
  ('early_bird', 'Early Bird', 'Play 10 games between 5am and 8am', '🐦', 'special', 100, '{"type": "time_of_day", "start": 5, "end": 8, "count": 10}'),
  ('century_club', 'Century Club', 'Score 100+ in a single game', '💯', 'skill', 150, '{"type": "score", "value": 100}'),
  ('perfectionist', 'Perfectionist', 'Complete a game with 100% accuracy', '✨', 'skill', 200, '{"type": "accuracy", "value": 100}'),
  ('marathon_runner', 'Marathon Runner', 'Play for 30 days total', '🏃', 'streak', 300, '{"type": "total_days", "value": 30}')
ON CONFLICT (achievement_id) DO NOTHING;

-- User achievements (earned badges)
CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  achievement_id VARCHAR(50) NOT NULL REFERENCES achievements(achievement_id),
  earned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_earned ON user_achievements(earned_at DESC);

-- ===========================================
-- 4. GAME TYPE EXPANSION
-- ===========================================

-- Update game_type constraint to include new games
ALTER TABLE game_scores DROP CONSTRAINT IF EXISTS game_scores_game_type_check;
ALTER TABLE game_scores ADD CONSTRAINT game_scores_game_type_check 
  CHECK (game_type IN (
    'memory', 'attention', 'reflex',
    'word_flash', 'shape_shadow', 'sequence_builder',
    'focus_filter', 'path_memory', 'missing_number',
    'color_swap', 'reverse_recall', 'blink_count', 'word_pair_match'
  ));

-- ===========================================
-- 5. DAILY TRENDS & ANALYTICS
-- ===========================================

-- Daily stats for trend tracking
CREATE TABLE IF NOT EXISTS daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,
  games_played INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0,
  average_accuracy INTEGER DEFAULT 0,
  average_reaction_ms INTEGER DEFAULT 0,
  total_play_time_ms BIGINT DEFAULT 0,
  xp_earned INTEGER DEFAULT 0,
  cognitive_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON daily_stats(user_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(stat_date DESC);

-- ===========================================
-- 6. STREAK TRACKING
-- ===========================================

-- Streak history for detailed tracking
CREATE TABLE IF NOT EXISTS streak_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  streak_start DATE NOT NULL,
  streak_end DATE,
  streak_length INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_streak_history_user ON streak_history(user_id);
CREATE INDEX IF NOT EXISTS idx_streak_history_active ON streak_history(user_id, is_active);

-- ===========================================
-- 7. COMPUTED STATS CACHE
-- ===========================================

-- Cached stats for performance
CREATE TABLE IF NOT EXISTS cached_stats (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  total_games INTEGER DEFAULT 0,
  total_sessions INTEGER DEFAULT 0,
  average_accuracy DECIMAL(5,2) DEFAULT 0,
  average_reaction_ms INTEGER DEFAULT 0,
  games_by_type JSONB DEFAULT '{}',
  best_scores JSONB DEFAULT '{}',
  average_scores JSONB DEFAULT '{}',
  global_percentiles JSONB DEFAULT '{}',
  improvement_rate DECIMAL(5,2) DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================
-- 8. GAME PERFORMANCE TRENDS
-- ===========================================

-- Reaction time history for trend analysis
CREATE TABLE IF NOT EXISTS reaction_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  game_type VARCHAR(50) NOT NULL,
  week_start DATE NOT NULL,
  average_reaction_ms INTEGER NOT NULL,
  best_reaction_ms INTEGER NOT NULL,
  games_played INTEGER NOT NULL,
  improvement_vs_previous DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, game_type, week_start)
);

CREATE INDEX IF NOT EXISTS idx_reaction_trends_user_game ON reaction_trends(user_id, game_type, week_start DESC);

-- ===========================================
-- 9. VIEWS FOR QUICK ACCESS
-- ===========================================

-- Enhanced user profile view
CREATE OR REPLACE VIEW enhanced_user_profile AS
SELECT 
  u.user_id,
  u.wallet_address,
  u.username,
  u.avatar_url,
  u.xp,
  u.level,
  u.rank_badge,
  u.current_streak,
  u.longest_streak,
  u.last_play_date,
  u.total_play_time_ms,
  u.cognitive_index,
  u.current_theme,
  u.created_at as join_date,
  COUNT(DISTINCT gs.score_id) as total_games,
  COUNT(DISTINCT DATE(gs.created_at)) as total_days_played,
  COUNT(DISTINCT ua.achievement_id) as achievements_earned,
  COALESCE(cs.average_accuracy, 0) as overall_accuracy,
  COALESCE(cs.total_sessions, 0) as total_sessions
FROM users u
LEFT JOIN game_scores gs ON u.user_id = gs.user_id
LEFT JOIN user_achievements ua ON u.user_id = ua.user_id
LEFT JOIN cached_stats cs ON u.user_id = cs.user_id
GROUP BY u.user_id, u.wallet_address, u.username, u.avatar_url, 
         u.xp, u.level, u.rank_badge, u.current_streak, u.longest_streak,
         u.last_play_date, u.total_play_time_ms, u.cognitive_index,
         u.current_theme, u.created_at, cs.average_accuracy, cs.total_sessions;

-- Global leaderboard by XP
CREATE OR REPLACE VIEW xp_leaderboard AS
SELECT 
  u.user_id,
  u.wallet_address,
  u.username,
  u.xp,
  u.level,
  u.rank_badge,
  u.cognitive_index,
  COUNT(DISTINCT gs.score_id) as total_games,
  COUNT(DISTINCT ua.achievement_id) as achievements_count,
  ROW_NUMBER() OVER (ORDER BY u.xp DESC, u.cognitive_index DESC) as global_rank
FROM users u
LEFT JOIN game_scores gs ON u.user_id = gs.user_id
LEFT JOIN user_achievements ua ON u.user_id = ua.user_id
GROUP BY u.user_id, u.wallet_address, u.username, u.xp, u.level, u.rank_badge, u.cognitive_index
ORDER BY global_rank;

-- Update existing game stats view with percentiles
CREATE OR REPLACE VIEW user_game_stats_enhanced AS
SELECT 
  gs.user_id,
  gs.game_type,
  COUNT(*) as games_played,
  MAX(gs.score) as best_score,
  AVG(gs.score)::integer as average_score,
  AVG(gs.accuracy)::integer as average_accuracy,
  AVG(gs.time_ms)::integer as average_time_ms,
  MAX(gs.level) as highest_level,
  MAX(gs.created_at) as last_played,
  PERCENT_RANK() OVER (PARTITION BY gs.game_type ORDER BY MAX(gs.score)) * 100 as score_percentile,
  PERCENT_RANK() OVER (PARTITION BY gs.game_type ORDER BY AVG(gs.accuracy)) * 100 as accuracy_percentile
FROM game_scores gs
GROUP BY gs.user_id, gs.game_type;

-- Comments for documentation
COMMENT ON TABLE xp_levels IS 'Level progression thresholds and rank badges';
COMMENT ON TABLE achievements IS 'Achievement definitions and unlock criteria';
COMMENT ON TABLE user_achievements IS 'Earned achievements per user';
COMMENT ON TABLE daily_stats IS 'Daily aggregated stats for trend tracking';
COMMENT ON TABLE streak_history IS 'Play streak tracking history';
COMMENT ON TABLE cached_stats IS 'Pre-computed stats cache for performance';
COMMENT ON TABLE reaction_trends IS 'Weekly reaction time trends for analysis';
