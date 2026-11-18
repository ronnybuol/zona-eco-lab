CREATE TABLE IF NOT EXISTS quiz_questions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 category TEXT NOT NULL CHECK(category IN ('bolmong','umum')),
 topic TEXT NOT NULL,
 question TEXT NOT NULL UNIQUE,
 options_json TEXT NOT NULL,
 correct_index INTEGER NOT NULL CHECK(correct_index BETWEEN 0 AND 3),
 explanation TEXT NOT NULL,
 source_url TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_questions_category_active ON quiz_questions(category, active);
CREATE TABLE IF NOT EXISTS quiz_sessions (
 id TEXT PRIMARY KEY,
 started_at INTEGER NOT NULL,
 questions_json TEXT NOT NULL,
 answers_json TEXT NOT NULL DEFAULT '{}',
 score INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS ix_sessions_started ON quiz_sessions(started_at);
CREATE TABLE IF NOT EXISTS quiz_results (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 session_id TEXT NOT NULL UNIQUE,
 nickname TEXT NOT NULL,
 region TEXT NOT NULL,
 score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 5),
 duration_seconds INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_results_rank ON quiz_results(score DESC,duration_seconds ASC,created_at ASC);
CREATE TABLE IF NOT EXISTS voices (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 topic TEXT NOT NULL,
 region TEXT NOT NULL,
 story TEXT NOT NULL DEFAULT '',
 contact TEXT NOT NULL DEFAULT '',
 allow_contact INTEGER NOT NULL DEFAULT 0,
 reviewed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_voices_topic ON voices(topic);
