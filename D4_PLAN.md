# Paket D4: Chapter 3 "Pasar Kacau!" — rencana dan status

File ini membuat D4 bisa dilanjutkan di sesi mana pun. Setiap langkah selesai = commit + push + centang di sini.
Sesi baru: baca file ini, `git log --oneline -15`, lalu lanjutkan dari langkah pertama yang belum dicentang.

Acuan: SUPERGLEN_GAME_DESIGN.md baris 156-162 (Bab 3), 296-301 (Tantangan Pintar #3), 319-336 (Musuh: Tikus Kecil, Sosok Misterius).
Aturan: CLAUDE.md (anak 5 tahun, tanpa kekerasan, musuh dijinakkan bukan mati, teks Indonesia "Chapter"), PAKET_P1_PARKOUR.md, angka lompat hanya di src/config/parkour.ts, `npm run check:reach` lulus.
Anggaran grafis kota hampir penuh (57/60 draw call, 63,5k/65k segitiga di preset HP): isi baru harus hemat (instanced, atau ganti/kurangi isi lain di area pasar).

## Langkah

- [x] **L1 Pemicu dan alur Chapter 3.** Setelah Chapter 2 selesai: alarm pasar dari Nino (dialog teks), tujuan + bintang peta ke distrik Pasar. State machine Chapter 3 (mulai, kejar, hitung, Tikus Rakus, penutup, selesai) tersimpan di save, bisa dilanjutkan setelah reload. Misi warga di-jeda selama Chapter 3. Tes `bab3-flow` dasar.
- [x] **L2 Tikus Kecil.** 6-8 tikus lucu low-poly membawa makanan di pasar. Perilaku: lari menjauh, berputar di sekitar kios, tidak menyerang. Dijinakkan dengan 1 laser atau hentakan mendarat: efek bintang + "boing", tikus menjatuhkan makanan lalu kabur ke gorong-gorong (tidak mati). Mudah untuk anak 5 tahun (lambat, bisa dikejar dengan terbang). Tes `bab3-rats`.
- [x] **L3 Tantangan berhitung pasar.** Pedagang: "Bakpaoku hilang 3, kue hilang 2." Anak mengumpulkan jumlah yang tepat dari makanan yang jatuh, lalu menjawab "Totalnya berapa?" (pilih dari 3 kartu besar, pakai quiz engine yang ada). Jawaban benar = makanan kembali ke kios + perayaan. Salah = coba lagi dengan bantuan visual. Tes `bab3-count`.
- [x] **L4 Si Tikus Rakus + penutup.** Muncul, tertawa "Hihihi, semua makanan ini milikku!", kabur ke gorong-gorong: "Suatu hari aku akan jadi RAJA kota ini!" (adegan, tanpa pertarungan). Penutup: sosok misterius terlihat sebentar di bayangan. Chapter 3 selesai, stiker/perayaan, kota bebas lagi. Tes `bab3-end`.
- [x] **L5 Suara.** Semua kalimat baru Chapter 3 ke audio/dialog.json dengan ekspresi per kalimat; suara Tikus Rakus dan pedagang dipilih berbeda dan lucu (bukan menakutkan); generate lewat pipeline. Glen = Finn +2, Nino = Pratama +2 (audio/voices.json). Anggaran sekitar 1.000 karakter.
- [x] **L6 QA dan laporan.** build, check:reach, check:quiz, smoke penuh sekali; PROGRESS.md bagian D4 + "Untuk dicoba besok pagi"; perbarui CLAUDE.md jika perlu.

## Catatan antar sesi
(tulis di sini keputusan, masalah, dan apa yang setengah jadi)

**L1 selesai.** `src/world/kota/Chapter3.ts` (state machine: '' -> 'chase' -> 'count' -> 'rakus' -> 'closing' -> `chaptersDone` 'bab3'), data/teks di `Bab3Data.ts` (MARKET: hub (93,0), vendor Bu Lina (113.5,-6.6), 4 drain, 7 tikus, baris dialog `BAB3_LINES`). Save: `save.data.bab3 = { step, tamed[] }` (+ `setBab3`). KotaLevel membuat `ch3` hanya bila bab2 selesai, bab3 belum, bukan sandbox (`?level=kota`); `canOffer` residen = `!doorBeam && !ch3.active`. Alarm Nino = dialog teks (tanpa suara), langkah 'chase' disimpan di awal alarm. Tes: `bab3-flow`. Dua tes lama disesuaikan (pakai chaptersDone + 'bab3' untuk "kota bebas setelah Chapter 2": `flow-saves` continue Chapter 2 done, `kota-d3-story`). Handle tes `window.__ch3` (step/arrived/advance).
Tikus tidak punya collider (hanya berlari di jalan pasar, dijepit `clampToStreets`), jadi `check:reach` tidak berubah. `QuizEngine.runQuestion(q)` ditambah untuk satu soal cerita di luar bank (dipakai L3). `MarketRats.ts` ditulis di L2.

**L2 selesai.** `src/world/kota/MarketRats.ts`: 7 tikus (3 bakpao, 2 kue, 2 sayur) = 3 draw call (rats InstancedMesh, food InstancedMesh dengan instanceColor, props = Bu Lina + 4 gorong-gorong dalam satu Mesh), semua Lambert vertex-color, tanpa bayangan. Di pasar 46 draw call / ~53-59k segitiga (batas 60 / 65k): tidak perlu mengurangi apa pun. Tikus: loop di jalan, lari menjauh (melambat saat anak sangat dekat supaya hentakan masih kena), kena laser (Targets) atau `player.onStomp` -> bintang pusing + boing, makanan jatuh, lari ke gorong-gorong, hilang. Sayur kembali sendiri ke Bu Lina. `Chapter3` menyimpan `tamed[]`; semua jinak -> langkah 'count' (L3 melanjutkan dari sini: `Chapter3.onCollect` masih kosong, `MarketRats.collected` menghitung bakpao/kue yang diambil, `returnAll()` menerbangkan makanan ke Bu Lina, `setVisible()` untuk menyembunyikan seluruh set pasar di L4). Glen (bukan Superglen) di dekat tikus: Nino "Ubah jadi Superglen dulu" + tombol bintang berdenyut. Tes: `bab3-rats`, `-touch`, `-glen`, `-resume`. Handle tes `__ch3.rats()/tame(i)/counts()`. Wajah dialog 'lina' dan 'rakus' belum ada di DialogBubble (pakai wajah default; ditambah di L4 bila sempat).

**Keputusan koordinator (L1, berlaku):** Chapter 2 sudah berakhir dengan alarm pasar (`bab2_nino_alarm`, `bab2_glen_siap`). Chapter 3 TIDAK punya alarm kedua: begitu bab2 selesai dan bab3 belum (juga save lama sebelum D4), kota langsung memulai Chapter 3: beam + bintang peta ke Pasar, pemain dijadikan Superglen, misi warga dijeda, satu kalimat pendek teks-saja `bab3_nino_cepat` "Cepat, ke pasar, Superglen!" (menggantikan `bab3_nino_alarm`/`bab3_glen_siap` yang sempat ditulis).

**L3 selesai.** Di `Chapter3.ts`: `runCount()` (dipicu saat langkah jadi 'count', juga saat resume): Bu Lina `bab3_lina_hilang`/`bab3_lina_tolong`, beam ke makanan terdekat (`MarketRats.nearestFood`), penghitung DOM `.ch3-count` (atas tengah, css di styles.css), setelah 5 terkumpul `bab3_lina_total` + `QuizEngine.runQuestion(TOTAL_QUESTION)` (soal sum 3 bakpao + 2 kue, kartu 4/5/6; panel yang ada mengurus salah/coba lagi/bantuan), lalu `rats.returnAll()`, perayaan, `bab3_lina_hore`, langkah 'rakus' (L4 mengambil dari sini; `Chapter3.setStep('rakus')` sudah dipanggil, belum ada adegannya, jadi bab 3 berhenti di 'rakus' sampai L4). Soal dihitung di statistik berhitung. Tes: `bab3-count`, `bab3-count-touch`. Keyboard di tes kuis: tombol angka slot + Enter.

**L4 selesai.** `Chapter3.runRakus()` / `closing()`: Rakus (mesh besar tambahan dari `MarketRats.makeRakus`, hanya terlihat selama adegan) muncul di persimpangan, tertawa, lari ke gorong-gorong utara sambil berteriak RAJA (tanpa pertarungan), lalu sosok misterius (siluet biru-tua transparan, melambai, memudar dengan kilau) di bayangan menara pagoda (84.5,-20); lalu `complete()`: `chaptersDone` + 'bab3', `bab3` save dikosongkan, 5 koin (`finishCityMission('bab3',5)`), `Celebration` "Chapter 3 selesai!", kota bebas lagi (misi warga kembali). Resume di 'rakus'/'closing' memutar adegan lagi (makanan dibersihkan). Wajah bubble 'lina' dan 'rakus' ditambah di DialogBubble. Tes: `bab3-end`, `bab3-end-touch`. Visual Rakus dan siluet belum dilihat lewat screenshot (hanya dites lewat logika). Tes lulus: `ONLY='bab3|kota-d3|kota-perf|flow|perf|bab2-flow'`.

**Daftar kalimat baru Chapter 3 (teks saja, id stabil untuk L5; sumber: `src/world/kota/Bab3Data.ts` `BAB3_LINES`)**:
- `bab3_nino_cepat` (nino): Cepat, ke pasar, Superglen!
- `bab3_nino_ubah` (nino): Ubah jadi Superglen dulu, Glen!
- `bab3_nino_tiba` (nino): Itu mereka! Tembak atau hentakkan, ya!
- `bab3_glen_lucu` (glen): Hihi, tikusnya lucu sekali!
- `bab3_glen_semua` (glen): Semua tikus kecil sudah kabur!
- `bab3_lina_hilang` (lina): Bakpaoku hilang 3, kue hilang 2.
- `bab3_lina_tolong` (lina): Tolong kumpulkan, ya, Superglen!
- `bab3_lina_total` (lina): Terima kasih! Totalnya berapa?
- `bab3_lina_hore` (lina): Hore! Semua kembali ke kios. Kamu pintar!
- `bab3_rakus_tawa` (rakus): Hihihi, semua makanan ini milikku!
- `bab3_glen_hei` (glen): Hei, jangan lari!
- `bab3_rakus_raja` (rakus): Suatu hari aku akan jadi RAJA kota ini!
- `bab3_nino_rakus` (nino): Itu Si Tikus Rakus! Kita pasti bertemu lagi.
- `bab3_glen_siapa` (glen): Eh, siapa itu di bayangan?
- `bab3_nino_siapa` (nino): Hmm, kita cari tahu nanti. Kerja bagus, Glen!
- `bab3_lina_terima` (lina): Terima kasih, Superglen!
(`bab3_nino_ubah` dan `bab3_nino_tiba` tampil di jalan; `bab3_lina_terima` belum dipakai; `bab3_glen_semua` dipakai setelah tikus terakhir.)

**L5 selesai.** 16 klip `bab3_*` di `audio/dialog.json` (dengan `delivery`), `public/audio/bab3_*.mp3`, semua lolos cek Scribe (ind). Suara baru di `audio/voices.json`: `lina` = Maya (U3dExJoUNcmTY5H6GMuG), `rakus` = Clowny (UafGxvF2q1XMC9Qy4tPR, +3 semiton). Ketiganya (Maya, Clowny, Lunetta uQyqjJGSy9EJK7ZcWe4B yang tidak dipakai) ditambah ke akun; slot akun 3/10 setelahnya. Soal Bu Lina memakai id `bab3_lina_total`. Teks tampilan tetap '3' dan '2'; ucapan memakai kata lewat `delivery`. Tanpa perubahan kode src.

- L6 selesai: QA penuh lulus (1.748 pemeriksaan). Catatan: kamera adegan akhir mungkin terhalang pinus.
