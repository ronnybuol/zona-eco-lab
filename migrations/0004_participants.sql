-- Identitas pengunjung berbasis token acak, tanpa nomor telepon.
CREATE TABLE IF NOT EXISTS quiz_participants (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  region TEXT NOT NULL,
  display_consent INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_quiz_participant_code ON quiz_participants(code);
ALTER TABLE quiz_sessions ADD COLUMN participant_id TEXT;
ALTER TABLE quiz_results ADD COLUMN participant_id TEXT;
CREATE INDEX IF NOT EXISTS ix_quiz_results_participant ON quiz_results(participant_id,score DESC,duration_seconds ASC);
