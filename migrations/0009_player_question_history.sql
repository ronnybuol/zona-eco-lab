-- Catat soal yang sudah DITAMPILKAN kepada profil peserta, bukan hanya yang dijawab.
-- Riwayat tersimpan di D1 sehingga reload browser tidak menghapusnya.
CREATE TABLE IF NOT EXISTS quiz_question_exposures (
  participant_id TEXT NOT NULL,
  question_id INTEGER NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 1,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY(participant_id, question_id)
);
CREATE INDEX IF NOT EXISTS ix_quiz_exposures_participant_age ON quiz_question_exposures(participant_id,last_seen_at,seen_count);
