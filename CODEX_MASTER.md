# Perintah induk untuk Codex: kerjakan semua paket dan periksa sendiri

Claude tidak aktif lagi untuk sementara (jatah habis). Kamu (Codex) bekerja sendiri sebagai pengembang **dan** pemeriksa. Baca `AGENTS.md` lebih dulu, lalu file ini. Pemilik proyek yang meng-merge PR (atau kamu, bila akunmu diizinkan).

## Keputusan pemilik — 18 November 2026

- Pengujian browser otomatis/Playwright ditunda sampai seluruh game selesai; pengujian bermain saat pengembangan dilakukan pemilik sendiri. Jangan menjalankan browser suite sekarang. Tetap jalankan build/typecheck, check:reach, check:quiz dan probe logika kecil yang relevan. Catat bahwa hasil browser, FPS, dan angka performa aktual belum diverifikasi; jangan menyatakan suite hijau tanpa menjalankannya.
- Serangan injak-pantul hanya untuk Curut dan musuh non-bos (termasuk Curut pendamping Rakus). Bos tetap menggunakan mekanik pertarungan yang ada.
- Masukan pemilik saat bermain: Curut di arena harus muncul dan menyerang satu per satu. Curut berikutnya muncul setelah giliran sebelumnya jinak dan jeda singkat; Curut pendamping Rakus juga maksimal satu pada satu waktu.
- Untuk menghemat limit, gunakan paling banyak dua agen pekerja dengan tugas terpisah dan review silang, lalu pemeriksaan akhir oleh agen utama.

## Aturan kerja

1. Kerjakan tugas **berurutan** (T0, T1, …). Satu tugas = satu cabang `codex/<tugas>` dan satu PR ke `main`. Jangan menumpuk tugas dalam satu PR. Setelah tiap PR di-merge (atau bila tugas berikutnya tidak bergantung padanya), lanjut ke tugas berikutnya dari `main` terbaru.
2. Model: pakai **6.1 Sol** penalaran tinggi untuk T0–T2, T5; **6.1 Sol** sedang untuk sisanya; pemeriksaan akhir tiap PR dengan **6 Astra** atau agen peninjau terpisah (lihat "Pemeriksaan sendiri"). Konten teks/soal boleh **6 Luna**.
3. Jangan melonggarkan tes supaya lulus. Kalau sebuah batas memang harus berubah, jelaskan alasan terukur di deskripsi PR.
4. Jangan menyentuh gameplay, cerita, collider, atau audio di luar cakupan tugas. Jangan memanggil layanan berbayar (ElevenLabs, Higgsfield) dan jangan menulis kunci API. Kalimat dialog baru: **teks saja** dengan id stabil `bab<N>_<tokoh>_<arti>` di file data chapter; daftar semua id baru dicatat di `CODEX_TASKS.md` bagian "Kalimat baru untuk disuarakan" (suaranya dibuat Claude/pemilik proyek nanti).
5. Jangan menambah dependensi npm tanpa alasan; jangan menambah `playwright` ke package.json.
6. Jika jatahmu habis di tengah tugas: commit pekerjaan yang bisa di-build ke cabangmu, buka PR **draft**, tulis di deskripsi dan di `CODEX_TASKS.md` apa yang selesai, setengah jadi, dan langkah berikutnya, lalu berhenti. Jangan meninggalkan pekerjaan hanya di sesi cloud: **selalu push**.
7. Bahasa teks game: Indonesia ("Chapter", "Lab"). Konten anak 5 tahun: tanpa kekerasan, musuh dijinakkan, tanpa unsur seram.

## Pemeriksaan sendiri (wajib sebelum menandai PR siap)

Untuk setiap PR lakukan dua putaran:

**Putaran 1, pembuat:** jalankan `npm ci`, `npm run build`, `npm run check:reach`, `npm run check:quiz`, dan smoke test grup yang relevan **satu grup per kali** (`ONLY='<grup>' node scripts/smoke-test.cjs`; butuh Playwright dan Chromium; jangan jalankan beberapa grup bersamaan karena halaman tes bisa crash kehabisan memori). Ambil tangkapan layar tampilan yang berubah (desktop 1280×720 dan sentuh 844×390).

**Putaran 2, peninjau terpisah:** buka sesi/agen baru (model **6 Astra** atau agen peninjau) dengan instruksi: "Tinjau diff PR ini seperti penguji yang skeptis." Daftar periksanya:
- Apakah ada perubahan di luar cakupan tugas? Apakah ada tes yang dilonggarkan atau dihapus?
- Apakah ada alokasi per frame baru di loop, kebocoran memori (geometri, tekstur, skeleton tidak di-dispose)?
- Apakah collider dan `check:reach` tetap sama kecuali tugas memang mengubahnya?
- Apakah kontrol PC, sentuh, dan controller masih jalan untuk fitur yang disentuh?
- Apakah teks baru Bahasa Indonesia, pendek, cocok untuk anak, tanpa kekerasan?
- Apakah tangkapan layar menunjukkan bug visual (potongan melayang, kotak gelap, teks terpotong, tombol bertumpuk)?
- Apakah build produksi (`npm run build`) dan halaman benar-benar jalan tanpa error di konsol?
Peninjau menulis temuan; pembuat memperbaikinya; ulangi sampai tidak ada temuan. Tempel ringkasan kedua putaran di deskripsi PR di bagian **"Pemeriksaan sendiri"**: perintah yang dijalankan, hasil (lulus/gagal dengan angka), tangkapan layar, temuan peninjau dan perbaikannya, serta hal yang masih terbuka.

Hanya tandai PR "ready" bila build, `check:reach`, `check:quiz`, dan semua grup smoke yang relevan lulus, atau kegagalan yang tersisa sudah ada di `main` sebelum PR (buktikan dengan menjalankannya di `main` dan tulis hasilnya).

## Keadaan awal yang perlu diketahui (16 November 2026)

- Chapter 1–6, kota 300 × 300 m, kuis 60 soal per kategori, mode pertarungan, zoom kamera, model tokoh/musuh/gedung dari pemilik, kota Kenney sudah di `main`.
- Pekerjaan C2 (perbaikan tampilan kota) sempat dikerjakan Codex di sesi cloud tetapi **belum ada cabang atau PR di GitHub**. Kalau sesi itu masih punya perubahan, **commit dan push dulu** ke `codex/c2-city-look` dan buka PR (tandai bagian yang belum selesai). Kalau tidak ada, kerjakan T1 dari awal.
- Pemilik bermain di iPhone dan mendapat 60 fps; targetnya akhirnya aplikasi. Kualitas visual didahulukan, tapi game harus tetap lancar.
- Masalah yang sudah diketahui ada di `CODEX_TASKS.md` bagian "Serah terima".

## Tugas

### T0 Stabilkan tes (cabang `codex/t0-tests`)
- `gamepad-desktop` gagal 8 pemeriksaan dan `gamepad-nopad` gagal "keyboard walking works as before" **di main**: cari penyebab nyata (kemungkinan pintu mulai/StartGate atau logika "sentuh vs PC" berubah) dan perbaiki di game atau di tes mana pun yang salah, tanpa melonggarkan asersi.
- Halaman tes sering `Target crashed` (kehabisan memori), terutama `bab1` saat jalan kota: cari kebocoran/beban memori di kota (dispose chunk, tekstur HDRI 4k, model dimuat ganda) dan kurangi supaya tiap grup selesai.
- Pemeriksaan "tames it, in order" di `bab5-fight` dan `bab6-fight` gagal setelah teks dialog berubah: sesuaikan tes dengan teks/urutan baru bila kodenya benar.
- Verifikasi grup yang belum pernah selesai: `zoom`, `zoom-touch`, `battle`, `battle-touch`, `hud-layout`, `hud-layout-touch` (target: stars bos tampil saat bertarung, tombol setelan ≥ 44 px di sentuh, tombol zoom tidak menumpuk dengan tombol bintang).
Selesai bila semua grup smoke yang ada lulus satu per satu di `main` baru.

### T1 Tampilan kota (cabang `codex/c2-city-look`; lanjutkan C2 bila ada)
Perbaiki semua: (1) potongan melayang/menggantung (papan, kanopi, pijakan panjat) dan menara yang tertarik; (2) warna butek/gelap: periksa tone mapping, exposure, ruang warna, intensitas environment map, hemisphere/ambient, sinar matahari, kabut, kekuatan AO dan bloom di `Sky.ts`, `CityMaterial.ts`, `KotaLevel.ts`, `Renderer.ts`; target siang cerah, warna jenuh tapi lembut, bayangan tidak hitam; (3) gaya campur aduk: 7 gedung pemilik (`public/env/buildings/*.glb`) di samping kotak polos; perkaya rumah/ruko/menara Kenney (warna pastel per distrik, jendela, pintu, kanopi, papan, balkon), pasang 7 gedung pemilik rapi (tanpa pelat dasar melebar ke trotoar, pijakan panjat rata dinding, atap sesuai collider, pintu gedung Barongsai lurus dengan pintu game, tanpa lubang di wajah singa); (4) tanah dan jauh: variasi rumput, detail jalan/trotoar (ubin jalan Kenney, zebra cross), alas menara, bukit dan pohon jauh yang lebih baik; (5) warga di `CityLife.ts` yang masih kotak → bentuk bulat bergaya tokoh utama, pakaian dan warna kulit bervariasi (tetap instanced); (6) peta mini menumpuk di atas joystick di sentuh → pindahkan, lulus `hud-layout*` dan tambahkan tombol zoom ke pemeriksaan itu.
Tangkapan layar sebelum/sesudah: alun-alun, Perumahan, Pasar, Sekolah, blok bank-rumah sakit, bukit gedung Barongsai (desktop dan sentuh). Tes: `kota`, `kota-touch`, `kota-life`, `hud-layout`, `hud-layout-touch`, `bab1`.

### T2 Performa (cabang `codex/t2-perf`)
Ukur dulu: segitiga, draw call, tekstur, geometri, heap untuk: awal jalan Chapter 1, alun-alun, Pasar, Sekolah, bukit, Lab, hangar, tiga pertarungan. Kurangi beban tanpa menurunkan kualitas dekat: LOD tokoh (model penuh untuk pemain dan kamera dekat, LOD menengah dan jauh ±25k dan ±8k segitiga dengan tekstur sama untuk yang jauh), LOD/instancing/culling musuh, gedung, potongan Kenney; gabung geometri statis per chunk dan material; satu pass bayangan dengan penyebab bayangan terdekat; AO/bloom jangan menggandakan biaya; dispose saat chunk/level dilepas. Tetapkan anggaran nyata di `scripts/smoke-test.cjs` dari pengukuran (target kira-kira ≤ 250k segitiga dan ≤ 90 draw call di tampilan kota terberat preset desktop, lebih rendah di preset sentuh; heap ≤ 16 KB per frame; tanpa kompilasi shader setelah pemanasan). Jangan sekadar menaikkan batas. Jaga ketajaman Glen (jangan kembali menurunkan batas resolusi preset sentuh di `Quality.ts`; penurun otomatis hanya di bawah 40 fps).

### T3 Penyempurnaan kamera dan Glen (cabang `codex/t3-camera`)
- Jarak kamera standar sedikit lebih dekat supaya Glen tidak terlalu kecil di HP (sekitar 15–20 persen), tanpa merusak mode pertarungan dan zoom.
- Periksa animasi lompat prosedural (Glen dan Superglen) di `CharacterModels.ts` (`JumpLayer`): tidak ada kaki meluncur atau anggota badan melompat, termasuk saat naik sepeda dan terbang. Perbaiki bila ada.

### T4 Chapter 7: Elang Belang (cabang `codex/t4-ch7`)
Ikuti pola `Chapter5.ts`/`Chapter6.ts` (+ `Bab7Data.ts`, hook dari akhir Chapter 6, state tersimpan di save, bisa dilanjutkan setelah muat ulang, misi warga dijeda, BattleMode dipakai). Musuh 4: Elang Belang, model `public/models/enemies/elang_belang.glb` (statis; animasikan lewat kode: mengepak, meluncur, menukik). Sayap kiri biru menembakkan **bulu es** (anak yang kena diperlambat 2 detik, bukan dibekukan, tanpa efek seram), sayap kanan merah menembakkan **bulu api** (anak melompat kepanasan 1 hati). Perisai menangkis keduanya. Pertarungan udara: elang terbang melingkar di atas arena, menukik dan menembak bergantian dengan tanda peringatan jelas (garis/bayangan di tanah); saat menukik lalu kelelahan di tanah/dahan, laser mengenainya. 5 bintang, tiap bintang 2 tembakan saat lelah; setelah 2 bintang menembak berurutan kiri-kanan, setelah 4 bintang menukik bersilang. Mode mudah (`settings.easyFight`) lebih lambat. Dijinakkan (bukan dikalahkan): minta maaf dan terbang pergi. Semua angka di `src/config/combat.ts`. Tempat arena: pilih area terbuka di Sekolah atau Alun-alun yang tidak dipakai chapter lain. Tes: alur chapter, lanjut dari save, pertarungan (bulu es/api kena, perisai menangkis, hanya kena saat lelah, mode mudah, kalah → rumah sakit), perf pada arena; desktop dan sentuh. Dialog: teks saja, id `bab7_*`.

### T5 Chapter 8: Gorilla Gembira (cabang `codex/t5-ch8`)
Bukan pertarungan: Gorilla Gembira kehilangan hutannya yang terbakar. Mini-misi menolong: Superglen mengangkut/memadamkan api kecil dengan perisai air (gunakan mekanik laser/perisai yang ada, mis. menembak awan hujan mini atau mengantar bibit), menanam kembali pohon di bukit lewat 3 tantangan kecil (satu berhitung, satu membaca papan petunjuk, satu terbang melewati cincin), gorila bahagia dan menepuk dada irama Barongsai. Model `gorilla_gembira.glb` (animasikan lewat kode). Akhir chapter: gorila bercerita singkat bahwa "bayangan" yang membakar hutan menghilang ke arah kota (tanpa menampilkan Sosok Misterius jelas; hanya siluet jauh sekilas). Pola chapter sama seperti T4. Tes: alur, tiga tantangan, lanjut dari save, perf. Dialog id `bab8_*`.

### T6 Penutup dan pancingan Superglen 2 (cabang `codex/t6-finale`)
Pesta kota di alun-alun: warga, Nino, Aara, semua musuh yang sudah jinak hadir dan bertepuk tangan; pertunjukan Barongsai (Superglen menari, drum irama); perayaan, lalu siluet **Sosok Misterius** (tenang, tidak menakutkan; siluet biru dari kode lama bila masih ada di riwayat git, atau buat baru) muncul sebentar di atas menara jam dan berkata satu kalimat pancingan lalu menghilang; layar "Bersambung… Superglen 2". Setelah itu kota bebas lagi. Tes: alur, lanjut dari save, perf. Dialog id `penutup_*`.

### T7 Pemutar sinematik (cabang `codex/t7-cinematics`)
Pemilik proyek akan membuat video dengan Higgsfield (prompt di `art/cinematics/PROMPT_SINEMATIK.md`) dan mengirimnya. Bangun sistemnya sekarang: pemutar layar penuh bilah hitam atas-bawah dengan tombol "Lewati" besar (PC, sentuh, controller), memutar `public/cinematics/<id>.mp4` (webm/mp4, `playsinline`, tanpa tombol bawaan browser, suara video mengikuti volume setelan), jalan di iOS Safari (diputar setelah ketukan pengguna), pengganti bila file tidak ada (lewati otomatis tanpa error), pembaruan musik (turunkan musik saat video), dan tiap id sinematik hanya diputar sekali per save (bisa diputar ulang dari menu setelan "Lihat sinematik"). Hubungkan titik panggil: sebelum layar mulai game pertama kali (`cin_open`), sebelum dialog pertama tiap chapter (`cin_ch1`…`cin_ch8`), penutup (`cin_finale`, `cin_teaser`). Tabel id dan file yang diharapkan ada di `art/cinematics/README.md` (buat). Tes: pemutar dengan video uji kecil buatan (generate dengan ffmpeg, jangan komit lebih dari 200 KB), lewati, file hilang.

### T8 Konten (cabang `codex/t8-content`; boleh 6 Luna)
- Tambah soal kuis (target 80 per kategori) sesuai skema, `npm run check:quiz` lulus; catat id soal baru untuk disuarakan.
- Rapikan teks UI Indonesia yang tidak konsisten ("Chapter", "Lab"). Jangan mengubah id.

### T9 Penutupan (cabang `codex/t9-docs`)
Perbarui `PROGRESS.md` (apa yang selesai, apa yang belum, cara mencoba di PC dan iPhone, link https://arsenick04.github.io/superglen/), `CODEX_TASKS.md` (status semua tugas, daftar kalimat baru untuk disuarakan, daftar klip yang perlu didengar penutur asli), dan `README.md` singkat (cara menjalankan, menguji, struktur). Jalankan semua grup smoke satu per satu di `main` dan tempel hasilnya.

## Setelah selesai
Beri laporan akhir singkat di `PROGRESS.md` bagian "Laporan Codex": PR yang di-merge, hasil tes tiap tugas, masalah yang tersisa, dan keputusan yang butuh pemilik proyek.
