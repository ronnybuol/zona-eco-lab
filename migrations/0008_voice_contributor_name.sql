-- Kolom nama atau sapaan pengirim Suara Bumi. Tetap mendukung laporan anonim.
ALTER TABLE voices ADD COLUMN contributor_name TEXT NOT NULL DEFAULT '';
