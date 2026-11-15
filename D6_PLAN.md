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

- [x] **L1 Tokoh berbentuk orang (sementara, sebelum model 3D Fase C).** Glen, Superglen, Nino diganti figur low-poly berbentuk orang seperti Aara dan warga, mengikuti acuan art/reference/ (warna, rambut, kostum Superglen merah-emas, Nino robot/asisten sesuai acuan). Animasi sederhana jalan/lompat/terbang dari kode. Ukuran fisik (kapsul collider) tidak berubah. Tes perf dan semua tes lama tetap lulus.
  - Selesai: src/player/Figure.ts (5 mesh gabungan per tokoh, animasi kode: diam, jalan, lompat, terbang, sepeda); dipakai Player (Glen/Superglen bergantian), NinoActor dan Lab. Kapsul fisik tidak berubah.
  - Tes: perf, kota-perf, kota-d3 lulus; bab1/bab2 di lingkungan ini kadang kena timeout screenshot (fonts) yang tidak terkait.
- [x] **L2 Gedung tua Barongsai.** Gedung di bukit diberi tampilan khas Barongsai: fasad kepala singa Barongsai merah-emas (mata besar, tanduk, janggut), atap bertingkat gaya klenteng, lampion pudar, tetapi tetap terbengkalai (pudar, sulur, papan). Rute naik dan check:reach tetap lulus.
  - Selesai: CityBuilder.ts barongsaiFacade() (sudah masuk commit 9e979b7): kepala singa merah-emas (mata besar berpupil kuning redup, tanduk, alis, janggut krem, pintu = mulut bergigi, karpet lidah), 2 tiang bulat, 2 lampion pudar, atap rok melengkung 2 tingkat dengan ujung terangkat, papan, sulur, genteng retak/hilang. Semua di layer chunk (tidak menambah far layer), sekitar 1.4k segitiga. Rute naik dan collider tidak berubah. Tinggi puncak sekitar +1 m; tetap tersembunyi dari alun-alun. Catatan: kota-perf gagal 61 panggilan di perumahan@-90 (>60) dengan atau tanpa fasad; sudah ada sebelumnya, bukan dari L2.
- [ ] **L3 Dialog awal.** Tinjau semua kalimat Chapter 1-2 (audio/dialog.json, src/world/bab1, bab2, kota/Chapter1Walk) terhadap alur dan kota sekarang; tulis ulang yang tidak cocok (pendek, Bahasa Indonesia, untuk anak). Kalimat yang berubah dibuat ulang suaranya lewat pipeline (Glen Finn +2, Nino Pratama +2), ekspresif. Anggaran sekitar 800 karakter.
- [ ] **L4 Sistem energi dan pertarungan.** Hati Glen (HUD), tikus punya energi (Tikus Kecil 3 kena), tikus melawan (seruduk/lempar remah, ada jeda peringatan yang terlihat jelas supaya anak bisa menghindar atau pakai perisai), laser tanpa bidik otomatis penuh (bantuan bidik kecil saja, peluru bisa meleset; tetap ramah anak di HP dan gamepad), tikus lebih besar (Tikus Kecil kira-kira setinggi lutut-pinggang Glen, Tikus Rakus lebih tinggi dari Glen). Kalah = kelelahan, muncul di rumah sakit. Semua angka di satu file konfigurasi `src/config/combat.ts`.
- [x] **L5 Pemulihan dengan koin.** Kios makanan di pasar dan rumah sakit: dekati, tekan tombol, bayar koin, hati pulih; ikon di peta; teks/suara pendek (pakai klip yang ada atau teks dulu).
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

- [x] **L7 Bug pasar kosong di alamat biasa**: tidak bisa direproduksi di jalur biasa (lihat laporan); jaring pengaman + tes bab3-plain dan bab3-broken ditambahkan.
- [ ] **L8 Stok kuis.** Tambah soal di src/data/quiz/*.json (target sekitar 3 kali lipat per kategori, tingkat anak 5-6 tahun, tanpa gambar baru bila bisa; pakai item/emoji yang ada atau tambah item). `npm run check:quiz` lulus. Suara soal baru: daftar dulu, generate setelah pemilik proyek setuju anggarannya.
- [ ] **L9 Pujian Nino bervariasi.** 6-8 variasi pujian dan 3-4 variasi "coba lagi" untuk latihan dan kuis, dipilih acak tanpa mengulang berturut-turut. Teks dulu, suara di langkah suara.
- [ ] **L10 Jarak misi.** Tujuan misi warga dan tantangan dipindah supaya tiap misi menempuh sedikitnya sekitar 80-150 m dan melewati distrik lain; hadiah koin disesuaikan. check:reach lulus.
- [ ] **L11 Susun ulang cerita.** Chapter 3 = Tikus Kecil (tanpa Sosok Misterius di akhir; Tikus Rakus boleh tampil sekilas lalu kabur sebagai pancingan musuh ke-3). Chapter 4 ditulis ulang: Glen dan Aara mencari petunjuk (alat penerjemah, papan baca tetap dipakai) yang mengarah ke Ular Besar, Glen mengajak Aara ke Lab, Aara dan Nino berkenalan, lalu pertarungan Ular Besar (musuh ke-2). Hapus semua kemunculan Sosok Misterius dan kalimat Nino yang menyebut Aara sebelum perkenalan. Catat rencana Chapter 5 (Tikus Raksasa), 6 (Elang Jahat), 7 (Gorila Pemarah), penutup (Sosok Misterius, pancingan Superglen 2) di CLAUDE.md.
- [ ] **L12 Sistem sinematik — DITUNDA ke Fase C** (keputusan pemilik proyek: dibuat bersama model 3D tokoh dan peta). **Semula:** Sutradara cutscene di dalam game (kamera berpindah, bilah hitam, tokoh bergerak sesuai naskah, teks/suara, tombol Lewati yang besar; jalan di PC, sentuh, gamepad). Sinematik pembuka kisah awal Glen sebelum "Ketuk untuk mulai" selesai. Adegan pendek sebelum dialog cerita utama tiap Chapter. (Video sungguhan lewat Higgsfield: menunggu keputusan pemilik proyek.)
- [ ] **L13 Suara** untuk semua kalimat baru/berubah dari L3, L9, L11, L12.

- [ ] **L14 Kota ramai.** Banyak warga latar yang lalu lalang: berjalan di trotoar, naik sepeda, motor, dan mobil di jalan, anak-anak bermain di taman/lapangan. Tidak perlu bisa diajak bicara. Hemat: instanced, mengikuti jalur jalan dari CityData, dimuat per potongan, tanpa collider yang menjebak pemain (kendaraan melambat/berhenti bila Glen di depannya, tidak menabrak). Jaga anggaran grafis kota (bila perlu naikkan anggaran dengan bukti fps, atau kurangi isi lain).
- **Suara (keputusan pemilik proyek 15 November):** langsung buat semua suara tanpa contoh persetujuan dulu.

Urutan kerja yang disarankan (lama; lihat PR bertahap): L7 → (L1, L8, L9 paralel) → L11 → L4/L5 (pertarungan, termasuk Ular Besar) → L12 → L2 → L10 → L3/L13 → L6.

## Catatan antar sesi

- [x] **L7b Penjaga versi basi** (selesai; owner bilang bug pasar kosong = cache, tapi kodenya sudah jadi dan lulus). `__BUILD_ID__` (vite define) + `dist/version.json` (vite.version.mjs); src/core/VersionGuard.ts: cek di layar mulai (reload langsung) dan setelah >10 mnt tersembunyi; di game reload hanya saat ganti level / menu dibuka. ID tampil di Pengaturan. Tes grup smoke `version`.
- [x] **L11a Bersih-bersih cerita** (selesai). Sosok Misterius dihapus (Chapter 3 berakhir dengan Tikus Rakus kabur + Nino memuji; Chapter 4 tanpa sosok itu). Chapter 4 = "Aara dan Alat Penerjemah": sekolah -> 3 soal Inggris -> papan baca di taman -> berakhir di kulit ular panjang dekat kolam (step 'track', `TRACK` di Bab4Data.ts) -> Glen: "Aku kenal seseorang yang bisa membantu!" -> perayaan, bab4 selesai. Save lama 'figure'/'lab' dipetakan ke 'track'. Lab finale di Story.ts dihapus. Kait untuk langkah berikutnya: `Chapter4Hooks.onDone` (KotaLevel.startCh4) dan catatan ini: bab berikut = Glen mengajak Aara ke Lab, Aara dan Nino berkenalan, lalu Ular Melar.
  - Tikus kecil bernama "Curut Cemberut" di teks; wajah cemberut (alis miring, mulut turun) di ratGeo (MarketRats.ts).
  - Baris teks BARU (tanpa suara, id stabil; perlu dibuat suaranya nanti): bab3_nino_hebat, bab3_glen_lucu2, bab3_glen_semua2, bab4_glen_mulai, bab4_aara_kulit, bab4_glen_kulit, bab4_aara_bantuan, bab4_glen_kenal. Baris lama dihapus: bab3_glen_siapa, bab3_nino_siapa, bab3_glen_lucu, bab3_glen_semua, bab4_nino_mulai, bab4_aara_lihat, bab4_misterius_awas, bab4_glen_tahu, bab4_aara_lapor, bab4_nino_temu/alat/siap, bab4_glen_curi (klip suara lama di audio/ dibiarkan).
- [x] **L4 Energi dan pertarungan** (selesai). Angka semua di `src/config/combat.ts`. 5 hati (`src/gameplay/Health.ts`, HUD tengah atas, disimpan di `save.data.hearts`); hit = -1 hati + bintang + boing + dorongan kecil + 1,5 s aman (berkedip); perisai memblok depan; hati 0 = kelelahan: fade, bangun di depan Rumah Sakit (`Health.hospital`, diisi KotaLevel), hati penuh, koin/progres/tikus jinak tetap, Nino menyemangati (`HealLines.semangat`).
  - Curut Cemberut: skala 1,5, 3 pukulan (stomp = 1 pukulan), titik-titik hati di atas kepala, serangan: seruduk (wind-up 0,8 s, getar + kepulan + panah merah di tanah, lompat menghindar) atau lempar remah (proyektil lambat; perisai memantulkannya balik = pukulan ke tikus). Laser: kerucut bantuan kecil per target (`Target.assist`, dekat 50 derajat, jauh 8 derajat, jangkauan 16 m), tikus jauh bisa loncat menghindar (40%). Tikus Rakus digambar skala 3,2. "Mode mudah (musuh lebih lemah)" = toggle baru di halaman orang tua (`settings.easyFight`; 2 pukulan, serangan lebih lambat); tombol "Lompat mudah" lama tidak diubah.
  - Teks: combat_nino_semangat (+ baris L5 di src/gameplay/healLines.ts). Tes: grup smoke `combat`, `combat-touch`, `combat-easy`; bab3-rats diperbarui.
- [x] **L5 selesai.** `src/world/kota/CityCare.ts` (kios makanan di Pasar: 1 hati = 5 koin; dokter di depan Rumah Sakit: hati penuh = 15 koin). Dekati, tombol tangan -> panel kecil bawah-tengah (hati +N, koin, tombol Ya/Tidak 84 px; tombol tangan lagi = Ya; menjauh = batal). Koin kurang atau hati penuh = kalimat ramah, tanpa potongan. Posisi di `CITY_LAYOUT.places.care` (CityPlaces.ts; CityData.ts hanya 1 baris default). Ikon peta: hati putih (kios) di peta kecil dan besar. Baris teks baru (tanpa suara): heal_kios_penuh, heal_kios_kurang, heal_kios_terima, heal_rs_penuh, heal_rs_kurang, heal_rs_sehat (+ combat_nino_semangat dari L4). Tes: grup `care`, `care-touch`.
  - Catatan: baris hati di tengah atas tertutup sebentar oleh banner "Kota Botanica" saat awal.

- [x] **Langkah P (perf + tes)**: kota-perf lulus. Figure.ts sekarang 1 mesh per tokoh (bagian ditandai pivot+id per titik, dianimasikan di vertex shader; depth material khusus untuk bayangan): panggilan gambar terburuk 62 -> 54 (perumahan@-90). Segitiga 65566 -> 64502: bola Figure lebih sedikit segmen, dan `tierFor` (CityMesher) naik ambang (0.35/1.3). Margin segitiga tipis, jaga isi baru kecil.
  - Harness smoke: `page.screenshot` dengan `path` dibungkus (timeout 20 dtk, error ditelan, tidak pernah gagalkan skenario); di mesin sibuk tangkapan layar bisa terlewat.
