-- Account/profile and saved-game index tables.
-- Authentication remains with Supabase Auth; never store user passwords here.
CREATE TABLE IF NOT EXISTS player_profiles (
    user_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saved_games (
    room_code TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    room_name TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_played_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saved_game_players (
    room_code TEXT NOT NULL,
    user_id TEXT NOT NULL,
    player_role TEXT NOT NULL DEFAULT 'PLAYER',
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (room_code, user_id),
    FOREIGN KEY (room_code) REFERENCES saved_games(room_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_saved_games_owner_updated
    ON saved_games(owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_game_players_user
    ON saved_game_players(user_id, joined_at DESC);
