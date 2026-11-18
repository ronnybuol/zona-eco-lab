# ZONA ECO LAB — Zonautara.com

Microsite **mobile-first** untuk Bolmong Eco Future, Jumat 20 November 2026, Lolak. Konten: **Tantangan Bumi**, **leaderboard**, **Jelajah Iklim**, **Suara Bumi**, dan dashboard admin untuk bank soal. Identitas Zonautara berasal dari aset logo resmi yang disediakan redaksi.

## Status versi 2
- Kode berada di GitHub; **belum otomatis live** sampai D1 dan Cloudflare Workers Builds dihubungkan.
- Basis data awal: **139 soal**, terdiri dari **34 soal lokal Bolmong** dan **105 soal umum**, dengan rujukan URL per soal.
- Setiap putaran: 2 Bolmong + 3 umum. Server mengacak soal **dan urutan opsi**. HP mengingat soal yang sudah pernah muncul; pengulangan baru terjadi ketika soal baru dari kategori itu habis atau riwayat browser hilang.
- Skor dihitung **di server**, dengan sesi sekali pakai, lima jawaban berurutan, dan waktu penyelesaian dihitung sebelum pengetikan nama.
- Admin menambah, mengubah, menonaktifkan dan **impor hingga 25 soal JSON per batch**; jangan mengimpor pertanyaan tanpa verifikasi.
- Leaderboard **rekreatif**. Nama panggilan bisa dibuat bebas, sehingga **tidak cukup untuk menetapkan pemenang hadiah** tanpa verifikasi peserta.
- Suara Bumi memerlukan persetujuan untuk menyimpan kontak; cerita dan kontak tidak tampil publik.

## Struktur
```text
public/               HTML, CSS, JS, dan logo untuk layar pengunjung/admin
src/worker.js          API Workers, validasi server dan leaderboard
migrations/0001_init.sql   Schema D1
migrations/0002_seed_questions.sql  75 soal gelombang awal
migrations/0003_expand_questions.sql  64 soal tambahan (total 139)
wrangler.toml          Bindings (ID D1 WAJIB diganti)
```
**R2 belum dipakai pada versi ringan ini**. Logo/CSS/JS disajikan dari Workers Static Assets (langsung dari repo). Tambah binding R2 hanya ketika ada penyimpanan foto atau berkas yang memang memerlukan R2. Jangan menaruh kontak warga dalam bucket publik.

## Langkah deploy — Windows / macOS / Linux

**A. Siapkan mesin kerja**: install Node.js LTS dan Git. Di terminal:
```bash
git clone https://github.com/ronnybuol/zona-eco-lab.git
cd zona-eco-lab
npm install
npx wrangler login
```
Login melalui browser yang terbuka, gunakan akun Cloudflare pengelola Worker yang benar.

**B. Buat database D1**:
```bash
npx wrangler d1 create zona-eco-lab-db
```
Salin UUID `database_id` dari output. **Jangan memakai UUID semua nol yang masih ada di `wrangler.toml`**. Perbarui `database_id` di GitHub atau file lokal; commit perubahan jika dari lokal. Nama database dan binding tetap: `zona-eco-lab-db` dan `DB`.

**C. Jalankan migrasi database PRODUKSI** (sekali untuk tiap migrasi baru):
```bash
npx wrangler d1 migrations apply zona-eco-lab-db --remote
```
Skrip kedua dan ketiga mengisi 139 pertanyaan. Migrations aman dijalankan ulang karena versi terlacak, tetapi **jangan mengedit file migrasi yang sudah diterapkan** pada database produksi; buat migrasi baru. Setelah mengedit soal lewat admin, perubahan berada di D1, bukan otomatis berubah di file seed repo.

**D. Deploy pertama**:
```bash
npx wrangler deploy
```
Setel token admin yang kuat melalui input rahasia, **jangan masukkan token ke GitHub/chat**:
```bash
npx wrangler secret put ADMIN_TOKEN
```
Gunakan token acak minimal 32 karakter (bukan kata sandi biasa). Untuk pengembangan lokal, dapat menggunakan `.dev.vars` yang sudah diabaikan oleh git.

**E. Hubungkan GitHub → Cloudflare untuk deploy otomatis**:
Cloudflare Dashboard → **Workers & Pages** → pilih Worker `zona-eco-lab` → **Settings → Builds → Connect** → hubungkan GitHub dan pilih **ronnybuol/zona-eco-lab**, branch produksi **main**. Pastikan nama Worker cocok dengan `wrangler.toml`. Build command: `npm install` (atau kosong jika Workers Builds menginstal dependency otomatis); deploy command: `npx wrangler deploy`.

Setelah terhubung, setiap commit yang di-push/merge ke `main` bisa memicu deployment otomatis. **Migrasi database tetap tugas terpisah** bila nantinya schema berubah. Cloudflare akan membangun versi repo terbaru, bukan membaca percakapan ChatGPT secara otomatis. Perubahan dari chat harus lebih dulu di-commit ke repo menggunakan konektor GitHub.

**F. Cek melalui HP sebelum mencetak QR**:
1. Buka `https://zona-eco-lab.<subdomain-anda>.workers.dev/` atau domain kustom setelah disetel.
2. Buka `/api/health` dan cek `"db":true`.
3. Mainkan lima soal, lihat pembahasan, isi nama panggilan, cek leaderboard. Main ulang dan lihat pertanyaan berbeda.
4. Buka `/admin.html` dan coba tambah serta nonaktifkan satu soal percobaan. Setel token di secret, bukan di file.
5. Coba Suara Bumi dan lihat di panel admin. **Hapus data uji dari produksi jika diperlukan** menggunakan query D1 setelah mengecek tabel sasaran.
6. Buka di ponsel dengan sinyal seluler dan cek panjang teks, posisi tombol, serta scroll.
7. Uji tautan Pantau Iklim dan Jejak Iklim. Setelah URL stabil, baru pasang QR pada materi cetak.

## Contoh impor soal
Gunakan dashboard **Impor JSON**, maksimal 25 soal tiap kirim. Jawaban benar diindeks 0=A, 1=B, 2=C, 3=D.
```json
[
  {
    "category":"umum",
    "topic":"Sampah",
    "question":"Tindakan mana yang membantu mengurangi sampah sekali pakai?",
    "options":["Membawa botol pakai ulang","Meminta kantong baru","Membuang bungkus ke sungai","Membakar plastik terbuka"],
    "correct_index":0,
    "explanation":"Pemakaian ulang dapat mengurangi permintaan produk sekali pakai.",
    "source_url":"https://www.unep.org/en/publications/report/turning-tap-how-world-can-end-plastic-pollution-and-create-circular-economy"
  }
]
```
> Contoh di atas sebaiknya **tidak diimpor** karena konsep sama sudah ada di seed.

## Rujukan editorial
- Liputan Bendungan Lolak — [Zonautara, 19 Oktober 2026](https://zonautara.com/2026/10/19/mengapa-kami-kembali-meliput-tentang-bendungan-lolak/) dan [ringkasan, 14 November 2026](https://zonautara.com/teras/menakar-manfaat-bendungan-lolak-di-sulawesi-utara/).
- [Limbung sawah di lumbung beras — Zonautara, 5 September 2026](https://zonautara.com/2026/09/05/limbung-sawah-di-lumbung-beras/).
- [Analisis curah hujan — BMKG](https://www.bmkg.go.id/iklim/analisis-laju-perubahan-curah-hujan).
- [IPCC AR6 — ringkasan sintesis](https://www.ipcc.ch/report/ar6/syr/resources/spm-headline-statements/).
- [UNEP — pengurangan polusi plastik](https://www.unep.org/en/publications/report/turning-tap-how-world-can-end-plastic-pollution-and-create-circular-economy).
- [BNPB — kesiapsiagaan bencana](https://bnpb.go.id/index.php/berita/bnpb-imbau-warga-siaga-hadapi-bahaya-banjir-angin-kencang-tanah-longsor).
- [WHO — standar keamanan air minum](https://www.who.int/publications/i/item/9789240121225).

## Pertimbangan untuk hadiah
Leaderboard mengutamakan skor benar, lalu durasi. Sistem mencatat sesi server dan mencegah menjawab ganda dalam satu sesi, **namun tidak membuktikan bahwa nama panggilan merujuk peserta berbeda atau mencegah pemain membaca jawaban dari sumber eksternal**. Jika panitia memberi hadiah, perlu validasi peserta di stan dan aturan permainan tersendiri.

## Privasi & operasional
Jangan unggah token API, password, atau identitas warga ke repo publik. Cerita warga tidak tampil publik; yang muncul hanya agregat pilihan kategori. Pertimbangkan aturan retensi/hapus data setelah acara, backup CSV dengan pengamanan, rate limiting WAF, dan Turnstile bila trafik tidak terkendali. Untuk perawatan kode, ikuti `AGENTS.md`.
