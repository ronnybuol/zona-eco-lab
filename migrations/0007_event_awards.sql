-- Peringkat waktu acara dibatasi 20 Nov 2026, 08.00–20.00 WITA.
-- Hadiah ditetapkan dari snapshot pada akhir setiap periode, bukan dari daftar yang terus berubah.
CREATE TABLE IF NOT EXISTS quiz_award_snapshots (
  period_index INTEGER NOT NULL CHECK(period_index BETWEEN 0 AND 4),
  rank INTEGER NOT NULL CHECK(rank BETWEEN 1 AND 5),
  participant_id TEXT NOT NULL,
  player_code TEXT NOT NULL,
  nickname TEXT NOT NULL,
  region TEXT NOT NULL,
  points INTEGER NOT NULL,
  rounds INTEGER NOT NULL,
  perfect_rounds INTEGER NOT NULL,
  avg_seconds REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','disqualified')),
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at TEXT,
  PRIMARY KEY(period_index,rank)
);
CREATE INDEX IF NOT EXISTS idx_quiz_award_status ON quiz_award_snapshots(period_index,status);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_completed_period ON quiz_sessions(completed_at,participant_id);
