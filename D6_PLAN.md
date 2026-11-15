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

## Masukan tambahan pemilik proyek (15 November 2026, saat batas pemakaian habis)

**Arah cerita baru (berlaku di atas SUPERGLEN_GAME_DESIGN.md bagian 5 dan 8):**
- Seri ini fokus melawan monster hewan. Urutan musuh: 1) Tikus Kecil, 2) Ular Besar, 3) Tikus Raksasa (Si Tikus Rakus), 4) Elang Jahat, 5) Gorila Pemarah.
- **Sosok Misterius tidak muncul** sampai akhir sekali game (pancingan ke Superglen 2). Hapus dari akhir Chapter 3 dan dari Chapter 4.
- **Aara dan Nino belum saling kenal di awal.** Mereka baru berkenalan saat Glen mengajak Aara ke Lab sebelum melawan musuh ke-2 (Ular Besar). Sebelum itu Nino tidak boleh menyebut Aara, dan Aara tidak tahu soal Lab/Superglen.
- **Sinematik:** sebelum game mulai ada video sinematik kisah awal Glen yang bisa dilewati. Setiap dialog cerita didahului adegan sinematik pendek (seperti cutscene di game Spider-Man): kamera sinematik, bilah hitam atas-bawah, tokoh beraksi, bisa dilewati.

**Perbaikan isi:**
- Stok kuis diperbanyak supaya soal tidak itu-itu saja.
- Misi dan tantangan kecil dibuat berjarak lebih jauh supaya anak menjelajah kota (sekarang beberapa selesai dalam beberapa langkah).
- Di latihan, pujian Nino bervariasi (jangan "Hebat, Glen!" terus).

**Nama dan sifat musuh (keputusan pemilik proyek):**
- **Curut Cemberut** (tikus kecil; wajahnya cemberut).
- **Ular Melar** (badannya memanjang saat menyerang).
- **Tikus Rakus** (makin besar setiap kali makan).
- **Elang Belang**: sayap kiri dan kanan berbeda warna dan menjadi senjatanya. Sayap biru menembakkan bulu es, sayap merah menembakkan bulu api.
- **Gorilla Gembira**: sebenarnya bukan musuh. Ia gorila yang kehilangan hutan tempat tinggalnya, yang terbakar oleh ulah Sosok Misterius. Chapter-nya diselesaikan dengan menolong, bukan mengalahkan, dan menjadi jembatan ke kemunculan Sosok Misterius di akhir.

**Sinematik (disetujui pemilik proyek):** semua adegan dibuat di dalam game (kamera sinematik, bilah hitam, tombol Lewati). Untuk pembuka, boleh ditambah gambar/video dari Higgsfield memakai model yang paling hemat kredit tetapi tetap bagus: buat 1 contoh dulu dan minta persetujuan. Remotion/Blender tidak dipakai (lihat catatan di PROGRESS).

## Langkah tambahan

- [ ] **L7 Bug pasar kosong di alamat biasa** (masih terbuka; agen sedang mengerjakan, perubahan belum di-commit di KotaLevel.ts dan smoke-test.cjs).
- [ ] **L8 Stok kuis.** Tambah soal di src/data/quiz/*.json (target sekitar 3 kali lipat per kategori, tingkat anak 5-6 tahun, tanpa gambar baru bila bisa; pakai item/emoji yang ada atau tambah item). `npm run check:quiz` lulus. Suara soal baru: daftar dulu, generate setelah pemilik proyek setuju anggarannya.
- [ ] **L9 Pujian Nino bervariasi.** 6-8 variasi pujian dan 3-4 variasi "coba lagi" untuk latihan dan kuis, dipilih acak tanpa mengulang berturut-turut. Teks dulu, suara di langkah suara.
- [ ] **L10 Jarak misi.** Tujuan misi warga dan tantangan dipindah supaya tiap misi menempuh sedikitnya sekitar 80-150 m dan melewati distrik lain; hadiah koin disesuaikan. check:reach lulus.
- [ ] **L11 Susun ulang cerita.** Chapter 3 = Tikus Kecil (tanpa Sosok Misterius di akhir; Tikus Rakus boleh tampil sekilas lalu kabur sebagai pancingan musuh ke-3). Chapter 4 ditulis ulang: Glen dan Aara mencari petunjuk (alat penerjemah, papan baca tetap dipakai) yang mengarah ke Ular Besar, Glen mengajak Aara ke Lab, Aara dan Nino berkenalan, lalu pertarungan Ular Besar (musuh ke-2). Hapus semua kemunculan Sosok Misterius dan kalimat Nino yang menyebut Aara sebelum perkenalan. Catat rencana Chapter 5 (Tikus Raksasa), 6 (Elang Jahat), 7 (Gorila Pemarah), penutup (Sosok Misterius, pancingan Superglen 2) di CLAUDE.md.
- [ ] **L12 Sistem sinematik.** Sutradara cutscene di dalam game (kamera berpindah, bilah hitam, tokoh bergerak sesuai naskah, teks/suara, tombol Lewati yang besar; jalan di PC, sentuh, gamepad). Sinematik pembuka kisah awal Glen sebelum "Ketuk untuk mulai" selesai. Adegan pendek sebelum dialog cerita utama tiap Chapter. (Video sungguhan lewat Higgsfield: menunggu keputusan pemilik proyek.)
- [ ] **L13 Suara** untuk semua kalimat baru/berubah dari L3, L9, L11, L12.

- [ ] **L14 Kota ramai.** Banyak warga latar yang lalu lalang: berjalan di trotoar, naik sepeda, motor, dan mobil di jalan, anak-anak bermain di taman/lapangan. Tidak perlu bisa diajak bicara. Hemat: instanced, mengikuti jalur jalan dari CityData, dimuat per potongan, tanpa collider yang menjebak pemain (kendaraan melambat/berhenti bila Glen di depannya, tidak menabrak). Jaga anggaran grafis kota (bila perlu naikkan anggaran dengan bukti fps, atau kurangi isi lain).
- **Suara (keputusan pemilik proyek 15 November):** langsung buat semua suara tanpa contoh persetujuan dulu.

Urutan kerja yang disarankan: L7 → (L1, L8, L9 paralel) → L11 → L4/L5 (pertarungan, termasuk Ular Besar) → L12 → L2 → L10 → L3/L13 → L6.

## Catatan antar sesi
