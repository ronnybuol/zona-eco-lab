# ZONA ECO LAB — Zonautara.com

Microsite **mobile-first** untuk Bolmong Eco Future, Jumat 20 November 2026, Lolak. Konten: **Tantangan Bumi**, **leaderboard**, **Jelajah Iklim**, **Suara Bumi**, dan dashboard admin untuk bank soal. Identitas Zonautara berasal dari aset logo resmi yang disediakan redaksi.

## Status versi 5.1 — Perbaikan visual dan Suara Bumi (18 November 2026)
- Aplikasi produksi terhubung ke Cloudflare Workers: https://zona-eco-lab.ronny-buol.workers.dev/. Gunakan `main` untuk versi produksi; branch fitur harus lolos pemeriksaan terlebih dahulu.
- Setelah migrasi 0005: **269 soal tersimpan**, **241 aktif** (76 Bolmong kontekstual dan 165 umum): tambahan 100 soal (40 Bolmong + 60 umum), sementara 28 trivia detail liputan tetap dinonaktifkan tanpa dihapus.
- Setiap putaran: 2 Bolmong + 3 umum. Server mengacak soal **dan urutan opsi**. HP mengingat soal yang sudah pernah muncul; pengulangan baru terjadi ketika soal baru dari kategori itu habis atau riwayat browser hilang.
- Seluruh pengalaman **satu tahap satu layar penuh**: perkenalan → Tantangan Bumi → leaderboard → Suara Bumi → Dukung Zonautara → Data Punya Cerita. Saat kuis dimulai, profil sekali → soal → pembahasan → hasil. Scroll hanya pada area isi jika HP pendek; navigasi dan CTA utama tetap di bawah.
- Profil nama panggilan dan wilayah didaftarkan sekali per browser/HP tanpa nomor telepon. Token acak hanya disimpan di perangkat, hash token di D1; kode peserta ditampilkan di hasil. Main ulang otomatis mempertahankan nama.
- Server menilai jawaban, masing-masing benar bernilai 20 poin sehingga **satu putaran maksimal 100 poin**. Leaderboard menampilkan **akumulasi seluruh poin dari seluruh putaran satu profil**, bukan hanya skor tertinggi. Urutan: total poin menurun, jumlah putaran sempurna (100/100) menurun, rata-rata waktu menjawab menaik, lalu tanggal permainan pertama.
- Admin menambah, mengubah, menonaktifkan dan **impor hingga 25 soal JSON per batch**; jangan mengimpor pertanyaan tanpa verifikasi.
- Leaderboard **rekreatif**: kode pemain baru berbentuk `ZU-1234`, empat digit, dipilih acak dan diuji unik; kode lama dimigrasikan ke format singkat. Perangkat/browser lain tetap dapat membuat profil tambahan. Untuk hadiah, petugas mencocokkan kode di HP melalui tab Peserta dan melakukan verifikasi langsung. WhatsApp tidak wajib.
- Suara Bumi memerlukan persetujuan untuk menyimpan kontak; cerita dan kontak tidak tampil publik.

## Struktur
```text
public/               HTML, CSS, JS, logo resmi, dan ilustrasi SVG yang tertanam langsung di index.html
src/worker.js          API Workers, validasi server dan leaderboard
migrations/0001_init.sql   Schema D1
migrations/0002_seed_questions.sql  75 soal gelombang awal
migrations/0003_expand_questions.sql  64 soal tambahan (total 139)
migrations/0004_participants.sql  profil peserta dan skor terhubung
migrations/0005_curate_bolmong.sql  28 trivia nonaktif dan 30 soal situasional
migrations/0006_short_codes.sql  kode peserta singkat untuk profil lama
migrations/0007_event_awards.sql  jendela hadiah, kandidat dan status verifikasi
migrations/0008_voice_contributor_name.sql  nama atau sapaan pengirim Suara Bumi
migrations/0009_player_question_history.sql  riwayat soal per peserta, tersimpan di D1
migrations/0010_bank_100_questions.sql  tambah 40 soal Bolmong dan 60 umum
wrangler.toml          Bindings produksi D1
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

**B. Database D1 (sudah disiapkan untuk produksi)**:
```bash
npx wrangler d1 create zona-eco-lab-db
```
Database produksi sudah ada dan ID-nya telah tercatat dalam konfigurasi. Jangan membuat database baru untuk deployment acara.

**C. Jalankan migrasi database PRODUKSI** (sekali untuk tiap migrasi baru):
```bash
npx wrangler d1 migrations apply DB --remote
```
Skrip 0002 dan 0003 mengisi 139 soal; 0004 menambah profil tanpa menghapus skor lama; 0005 mengkurasi trivia dan menambah soal kontekstual; 0006 menyingkat kode peserta lama tanpa menghapus token atau hasil; 0007 menambah snapshot kandidat hadiah; 0008 menambah kolom nama/sapaan pengirim Suara Bumi tanpa mengubah laporan lama; 0009 mencatat soal yang pernah ditampilkan per peserta; 0010 menambah 100 soal baru. Migrations aman dijalankan ulang karena versi terlacak, tetapi **jangan mengedit file migrasi yang sudah diterapkan** pada database produksi; buat migrasi baru. Setelah mengedit soal lewat admin, perubahan berada di D1, bukan otomatis berubah di file seed repo.

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
Cloudflare Dashboard → **Workers & Pages** → pilih Worker `zona-eco-lab` → **Settings → Builds → Connect** → hubungkan GitHub dan pilih **ronnybuol/zona-eco-lab**, branch produksi **main**. Pastikan nama Worker cocok dengan `wrangler.toml`. Build command: `npm test` (atau sesuaikan instalasi dependensi otomatis pada Workers Builds); deploy command: `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`.

Setelah terhubung, setiap commit yang di-push/merge ke `main` bisa memicu deployment otomatis. Deploy command produksi saat ini menerapkan migrasi D1 sebelum menerbitkan Worker. Periksa log dan siapkan backup untuk setiap perubahan skema. Cloudflare akan membangun versi repo terbaru, bukan membaca percakapan ChatGPT secara otomatis. Perubahan dari chat harus lebih dulu di-commit ke repo menggunakan konektor GitHub.

**F. Jalankan pemeriksaan otomatis kode sebelum dan setelah pembaruan:**
```bash
npm test
```
GitHub Actions (`.github/workflows/check.yml`) juga memeriksa tiap push ke `main`. Pemeriksaan ini memvalidasi struktur soal, sintaks JavaScript, dan aset utama, tetapi belum menggantikan uji Worker produksi dengan D1 maupun uji lintas-browser di HP.

**G. Cek melalui HP sebelum mencetak QR**:
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

## Pengujian dan hadiah
- Uji profil baru, lalu bermain dua kali dari browser sama: nama tetap, leaderboard tetap satu baris profil tetapi total poin bertambah sesuai hasil kedua putaran.
- Dashboard /admin.html memiliki tab Peserta. Petugas mencocokkan kode yang tampil di HP, lalu menandai akun terverifikasi.
- Kode peserta bukan bukti identitas yang kuat. Tanpa login/nomor telepon, satu orang masih dapat membuat beberapa akun melalui browser atau HP lain. Hadiah tetap memerlukan verifikasi manusia.
- Jangan mengumumkan hadiah otomatis dari papan peringkat. Kontak untuk hadiah dikumpulkan secara terpisah hanya bila diperlukan dan dengan persetujuan.
- Setelah acara, tinjau retensi profil pemain dan data kontak. Skor uji versi lama tetap ada sebagai entri legacy hingga dibersihkan secara terkontrol.

## Layar dukungan Zonautara
- Donasi sukarela: https://saweria.co/zonautara
- Dukungan/berlangganan liputan: https://s.id/dukungzu
- Kedua tautan dibuka di tab baru. Dukungan pembaca tidak memberi pengaruh editorial terhadap pemberitaan.

## Aturan hadiah: Jumat 20 November 2026 (WITA)
- Periode 1: 08.00–11.00; periode 2: 11.00–14.00; periode 3: 14.00–17.00; periode 4: 17.00–20.00. Juara umum ditutup tepat pukul 20.00.
- Skor 20 poin per jawaban benar, maksimal 100 per putaran. Poin periode baru dihitung mulai dari nol tanpa menghapus data putaran sebelumnya; total juara umum tetap mengakumulasi seluruh periode resmi.
- Jendela resmi memakai waktu penyelesaian jawaban kelima menurut server. Hasil uji coba sebelum 20 November 08.00 dan sesudah 20.00 tidak dihitung dalam hadiah.
- Urutan juara: total poin, jumlah putaran sempurna, rata-rata durasi tercepat, dan waktu pertama bermain.
- Setelah periode selesai, kunjungan leaderboard pertama membuat snapshot lima kandidat terbaik; data tetap dibekukan. Pemenang baru dinyatakan resmi setelah kode peserta diperiksa langsung dan admin mengonfirmasi di tab Juara & Hadiah. Admin juga dapat mendiskualifikasi kandidat.
- Fitur snapshot berbasis kunjungan pertama (lazy capture) dan tidak perlu cron. Periksa latensi pengiriman hasil sebelum pengumuman; hasil terlambat setelah snapshot tidak otomatis mengubah arsip.
- Karena tanpa login/nomor HP, satu orang masih dapat membuat beberapa profil pada beberapa browser/perangkat. Verifikasi manual di stan diperlukan untuk hadiah.

## Suara Bumi dan privasi
- Formulir masyarakat masuk ke D1 dan hanya tampak dalam Dashboard Admin → Suara Bumi. Nama atau sapaan opsional bagi laporan anonim; nama/sapaan diwajibkan jika pengirim menyertakan nomor telepon/email. Petugas dapat menandai telah ditinjau dan mengekspor CSV termasuk nama. Kiriman lama tetap dapat dibaca sebagai anonim.
- Kiriman warga merupakan petunjuk awal yang dapat dipertimbangkan sebagai ide liputan, bukan jaminan publikasi. Verifikasi jurnalistik tetap diperlukan.
- Halaman publik hanya menampilkan agregat jumlah kategori, bukan cerita dan kontak.

## Visual
- Enam ilustrasi orisinal tanpa teks/logo Zonautara palsu **ditanam sebagai inline SVG di public/index.html** untuk menghindari hambatan pemuatan gambar dari subpath, lazy-loading pada layar tersembunyi, dan menyusutnya elemen flex. Berkas sumber ilustrasi terpisah tetap tersimpan di public/art/: intro.svg, challenge.svg, leaderboard.svg, suara.svg, dukung.svg, jelajah.svg.
- Logo resmi Zonautara hanya terlihat di layar pertama, diambil dari public/logo-zonautara.png, tidak digenerate ulang. Layar berikutnya menggunakan tulisan teks biasa ZONA ECO LAB. Ilustrasi tetap lokal tanpa CDN.

## Ketahanan bank soal untuk peserta berulang (19 November 2026)
- Kuis memilih tetap **2 soal Bolmong + 3 soal umum** per putaran, dengan pilihan jawaban diacak server.
- Profil pemain memiliki riwayat soal di tabel `quiz_question_exposures`. **Soal dicatat sejak ditampilkan** (pada start sesi), bukan saat jawaban selesai; meninggalkan sesi tidak menghapus catatannya.
- Saat mengambil soal baru, server mengutamakan yang belum pernah tampil kepada profil yang sama, lalu mempertimbangkan daftar `seen` dari browser sebagai cadangan. Setelah kategori habis, sistem memakai ulang soal yang paling lama tidak muncul.
- Dengan 76 soal aktif Bolmong, tiap profil mendapat **38 putaran berisi 2 soal lokal tanpa pengulangan**; terdapat 165 soal umum untuk 55 putaran (3/putaran) tanpa pengulangan.
- Riwayat berlaku per **profil/token**. Peserta yang sengaja membuat profil baru dengan browser lain tetap bisa mendapatkan soal yang pernah mereka lihat dari profil terdahulu; kode tanpa login tidak cukup untuk mencegah itu.
- Migrasi bersifat additive, tidak menghapus sesi, skor, atau riwayat hadiah. Periksa endpoint `/api/stats`: `bolmong=76` dan `umum=165` setelah deployment.
- Wajib uji satu pemain dua putaran dan dashboard admin setelah migrasi sebelum awal perlombaan.
