# Paket D6: masukan pemilik proyek setelah Chapter 3-4 — rencana dan status

File ini membuat D6 bisa dilanjutkan di sesi mana pun. Setiap langkah selesai = commit + push + centang di sini.
Sesi baru: baca file ini, `git log --oneline -15`, lalu lanjutkan dari langkah pertama yang belum dicentang.

Masukan pemilik proyek (15 November 2026):
- Glen, Superglen, Nino masih kapsul, padahal Aara sudah berbentuk orang.
- Beberapa dialog awal tidak cocok lagi karena kota makin besar.
- Gedung tua tidak terlihat seperti gedung Barongsai.
- Laser terlalu gampang (pasti kena). Tikus harus punya darah (health) dan melawan, tidak kalah sekali tembak. Glen juga punya darah; pulih dengan membeli makanan di pasar atau ke rumah sakit, bayar koin. Pertarungan lebih menantang. Tikus lebih besar; Tikus Rakus lebih besar dari Glen.

Aturan tetap: anak 5 tahun, tanpa kekerasan (tanpa darah merah, tanpa mati; "darah" ditampilkan sebagai hati/energi), musuh dijinakkan bukan mati, teks Indonesia, angka lompat hanya di src/config/parkour.ts, `npm run check:reach` lulus, anggaran grafis kota (preset HP ≤60 draw call, ≤65k segitiga).

Keputusan aman yang diambil orkestrator (ubah bila pemilik proyek minta lain):
- Energi Glen = 5 hati. Habis = Glen "kelelahan": layar memudar, Glen muncul di rumah sakit dengan hati penuh, tanpa kehilangan koin atau progres (tidak menghukum anak 5 tahun). Koin hanya dipakai untuk memulihkan hati secara sukarela.
- Pemulihan: kios makanan di pasar (mis. 1 hati = 5 koin) dan rumah sakit (penuh = 15 koin). Ada juga pemulihan pelan saat tidak bertarung? Tidak, supaya kios dan rumah sakit berarti; tetapi selalu ada koin cukup di sekitar pasar.
- Tikus "melawan" dengan cara lucu: menyeruduk/melempar remah kue yang mengurangi 1 hati, dengan efek lucu (bintang, "boing"), bukan luka.

## Langkah

- [ ] **L1 Tokoh berbentuk orang (sementara, sebelum model 3D Fase C).** Glen, Superglen, Nino diganti figur low-poly berbentuk orang seperti Aara dan warga, mengikuti acuan art/reference/ (warna, rambut, kostum Superglen merah-emas, Nino robot/asisten sesuai acuan). Animasi sederhana jalan/lompat/terbang dari kode. Ukuran fisik (kapsul collider) tidak berubah. Tes perf dan semua tes lama tetap lulus.
- [ ] **L2 Gedung tua Barongsai.** Gedung di bukit diberi tampilan khas Barongsai: fasad kepala singa Barongsai merah-emas (mata besar, tanduk, janggut), atap bertingkat gaya klenteng, lampion pudar, tetapi tetap terbengkalai (pudar, sulur, papan). Rute naik dan check:reach tetap lulus.
- [ ] **L3 Dialog awal.** Tinjau semua kalimat Chapter 1-2 (audio/dialog.json, src/world/bab1, bab2, kota/Chapter1Walk) terhadap alur dan kota sekarang; tulis ulang yang tidak cocok (pendek, Bahasa Indonesia, untuk anak). Kalimat yang berubah dibuat ulang suaranya lewat pipeline (Glen Finn +2, Nino Pratama +2), ekspresif. Anggaran sekitar 800 karakter.
- [ ] **L4 Sistem energi dan pertarungan.** Hati Glen (HUD), tikus punya energi (Tikus Kecil 3 kena), tikus melawan (seruduk/lempar remah, ada jeda peringatan yang terlihat jelas supaya anak bisa menghindar atau pakai perisai), laser tanpa bidik otomatis penuh (bantuan bidik kecil saja, peluru bisa meleset; tetap ramah anak di HP dan gamepad), tikus lebih besar (Tikus Kecil kira-kira setinggi lutut-pinggang Glen, Tikus Rakus lebih tinggi dari Glen). Kalah = kelelahan, muncul di rumah sakit. Semua angka di satu file konfigurasi `src/config/combat.ts`.
- [ ] **L5 Pemulihan dengan koin.** Kios makanan di pasar dan rumah sakit: dekati, tekan tombol, bayar koin, hati pulih; ikon di peta; teks/suara pendek (pakai klip yang ada atau teks dulu).
- [ ] **L6 QA dan laporan.** build, check:reach, check:quiz, smoke penuh sekali; PROGRESS.md bagian D6 + "Untuk dicoba besok pagi".

## Catatan antar sesi
