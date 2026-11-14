# Paket D4: Chapter 3 "Pasar Kacau!" — rencana dan status

File ini membuat D4 bisa dilanjutkan di sesi mana pun. Setiap langkah selesai = commit + push + centang di sini.
Sesi baru: baca file ini, `git log --oneline -15`, lalu lanjutkan dari langkah pertama yang belum dicentang.

Acuan: SUPERGLEN_GAME_DESIGN.md baris 156-162 (Bab 3), 296-301 (Tantangan Pintar #3), 319-336 (Musuh: Tikus Kecil, Sosok Misterius).
Aturan: CLAUDE.md (anak 5 tahun, tanpa kekerasan, musuh dijinakkan bukan mati, teks Indonesia "Chapter"), PAKET_P1_PARKOUR.md, angka lompat hanya di src/config/parkour.ts, `npm run check:reach` lulus.
Anggaran grafis kota hampir penuh (57/60 draw call, 63,5k/65k segitiga di preset HP): isi baru harus hemat (instanced, atau ganti/kurangi isi lain di area pasar).

## Langkah

- [x] **L1 Pemicu dan alur Chapter 3.** Setelah Chapter 2 selesai: alarm pasar dari Nino (dialog teks), tujuan + bintang peta ke distrik Pasar. State machine Chapter 3 (mulai, kejar, hitung, Tikus Rakus, penutup, selesai) tersimpan di save, bisa dilanjutkan setelah reload. Misi warga di-jeda selama Chapter 3. Tes `bab3-flow` dasar.
- [ ] **L2 Tikus Kecil.** 6-8 tikus lucu low-poly membawa makanan di pasar. Perilaku: lari menjauh, berputar di sekitar kios, tidak menyerang. Dijinakkan dengan 1 laser atau hentakan mendarat: efek bintang + "boing", tikus menjatuhkan makanan lalu kabur ke gorong-gorong (tidak mati). Mudah untuk anak 5 tahun (lambat, bisa dikejar dengan terbang). Tes `bab3-rats`.
- [ ] **L3 Tantangan berhitung pasar.** Pedagang: "Bakpaoku hilang 3, kue hilang 2." Anak mengumpulkan jumlah yang tepat dari makanan yang jatuh, lalu menjawab "Totalnya berapa?" (pilih dari 3 kartu besar, pakai quiz engine yang ada). Jawaban benar = makanan kembali ke kios + perayaan. Salah = coba lagi dengan bantuan visual. Tes `bab3-count`.
- [ ] **L4 Si Tikus Rakus + penutup.** Muncul, tertawa "Hihihi, semua makanan ini milikku!", kabur ke gorong-gorong: "Suatu hari aku akan jadi RAJA kota ini!" (adegan, tanpa pertarungan). Penutup: sosok misterius terlihat sebentar di bayangan. Chapter 3 selesai, stiker/perayaan, kota bebas lagi. Tes `bab3-end`.
- [ ] **L5 Suara.** Semua kalimat baru Chapter 3 ke audio/dialog.json dengan ekspresi per kalimat; suara Tikus Rakus dan pedagang dipilih berbeda dan lucu (bukan menakutkan); generate lewat pipeline. Glen = Finn +2, Nino = Pratama +2 (audio/voices.json). Anggaran sekitar 1.000 karakter.
- [ ] **L6 QA dan laporan.** build, check:reach, check:quiz, smoke penuh sekali; PROGRESS.md bagian D4 + "Untuk dicoba besok pagi"; perbarui CLAUDE.md jika perlu.

## Catatan antar sesi
(tulis di sini keputusan, masalah, dan apa yang setengah jadi)

**L1 selesai.** `src/world/kota/Chapter3.ts` (state machine: '' -> 'chase' -> 'count' -> 'rakus' -> 'closing' -> `chaptersDone` 'bab3'), data/teks di `Bab3Data.ts` (MARKET: hub (93,0), vendor Bu Lina (113.5,-6.6), 4 drain, 7 tikus, baris dialog `BAB3_LINES`). Save: `save.data.bab3 = { step, tamed[] }` (+ `setBab3`). KotaLevel membuat `ch3` hanya bila bab2 selesai, bab3 belum, bukan sandbox (`?level=kota`); `canOffer` residen = `!doorBeam && !ch3.active`. Alarm Nino = dialog teks (tanpa suara), langkah 'chase' disimpan di awal alarm. Tes: `bab3-flow`. Dua tes lama disesuaikan (pakai chaptersDone + 'bab3' untuk "kota bebas setelah Chapter 2": `flow-saves` continue Chapter 2 done, `kota-d3-story`). Handle tes `window.__ch3` (step/arrived/advance).
Tikus tidak punya collider (hanya berlari di jalan pasar, dijepit `clampToStreets`), jadi `check:reach` tidak berubah. `QuizEngine.runQuestion(q)` ditambah untuk satu soal cerita di luar bank (dipakai L3). `MarketRats.ts` ditulis di L2.
