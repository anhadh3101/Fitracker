-- USERS: basic email + password authentication
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                    -- UUID
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,            -- store hashed password only
  display_name TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- NOTES: user’s personal journal entries
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,                    -- UUID
  user_id TEXT NOT NULL,                  -- foreign key reference
  content TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for quick access to a user's notes
CREATE INDEX IF NOT EXISTS idx_notes_user_time
  ON notes (user_id, created_at DESC);