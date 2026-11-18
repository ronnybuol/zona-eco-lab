-- Edisi acara: kode peserta singkat dengan empat digit.
-- Kode lama di database diberi nomor unik; token dan sesi tidak berubah.
WITH existing AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at,id) n
  FROM quiz_participants
  WHERE code LIKE 'ECO-%'
)
UPDATE quiz_participants
SET code = 'ZU-' || printf('%04d', 1000 + (SELECT n FROM existing WHERE existing.id=quiz_participants.id))
WHERE id IN (SELECT id FROM existing);
-- Perhitungan papan peringkat berbasis SUM(score * 20), tanpa menambah kolom denormalisasi.
-- Data lama tetap tersimpan dan turut dihitung; data uji dapat dibersihkan terpisah sebelum acara.
