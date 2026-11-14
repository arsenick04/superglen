# Paket D5: Chapter 4 "Sosok Misterius" (mode detektif) — rencana dan status

File ini membuat D5 bisa dilanjutkan di sesi mana pun. Setiap langkah selesai = commit + push + centang di sini.
Sesi baru: baca file ini, `git log --oneline -15`, lalu lanjutkan dari langkah pertama yang belum dicentang.

Acuan: SUPERGLEN_GAME_DESIGN.md baris 94-104 (Aara), 164-168 (Bab 4), 289-305 (Membaca, papan petunjuk #6, kata Inggris dari Aara #7), 14 (petunjuk lewat suara dan ikon).
Aturan: CLAUDE.md (anak 5 tahun, tanpa kekerasan, tanpa unsur mistis: Sosok Misterius hanya siluet ramah yang muncul lalu hilang; teks Indonesia "Chapter"), PAKET_P1_PARKOUR.md, angka lompat hanya di src/config/parkour.ts, `npm run check:reach` lulus.
Anggaran grafis kota hampir penuh (57/60 draw call, 63,5k/65k segitiga di preset HP): isi baru harus hemat.
Pola yang sudah ada: Chapter 3 di src/world/kota/Chapter3.ts + Bab3Data.ts + D4_PLAN.md.

## Langkah

- [x] **L0 Perbaikan kecil dari D4.** Kamera adegan akhir Chapter 3 terhalang pohon pinus (test-results/bab3-end.png): posisikan adegan/kamera supaya Si Tikus Rakus dan sosok misterius terlihat jelas. Tes `bab3-end` tetap lulus, simpan tangkapan layar baru.
- [x] **L1 Pemicu dan alur Chapter 4.** Setelah Chapter 3 selesai: Chapter 4 aktif, Glen dalam mode Glen (tanpa kostum, detektif), tujuan + bintang peta ke Sekolah. State machine tersimpan di save, bisa dilanjutkan setelah reload. Misi warga dijeda. Tes `bab4-flow`.
- [ ] **L2 Aara.** Aara (sahabat sekolah Glen, acuan art/reference/aara_*) sebagai figur sederhana low-poly di sekolah, membawa alat penerjemah. Tantangan "Kata Inggris dari Aara": 3 soal pakai quiz engine (mis. "Apa bahasa Inggrisnya buku?"), tiap jawaban benar membuat alatnya makin canggih (efek visual), lalu alat menangkap sinyal yang menunjuk ke taman kota. Tes `bab4-aara`.
- [ ] **L3 Petunjuk di taman.** 3 papan/kertas petunjuk bertuliskan satu kata ("bola", "pohon", "kolam"), dibacakan bila anak menekan tombol pengeras suara. Anak memilih tempat yang cocok (atau berjalan ke sana), tempat itu berkilau, petunjuk berikutnya muncul. Tanpa jalan buntu: bantuan muncul setelah beberapa detik. Tes `bab4-clues`.
- [ ] **L4 Sosok Misterius + penutup.** Siluet muncul di taman: "Aku sudah lama mengawasimu... Superglen." lalu menghilang (ramah, tidak menakutkan). Kembali ke Lab: Nino menemukan pasukan tikus memakai alat curian dari lab lama; misi berikutnya dimulai (teaser). Chapter 4 selesai, perayaan, kota bebas lagi dan misi warga aktif. Tes `bab4-end`.
- [ ] **L5 Suara.** Semua kalimat baru Chapter 4 ke audio/dialog.json dengan ekspresi per kalimat. Aara: pilih suara anak perempuan/remaja putri yang ceria, berbeda dari warga lain. Sosok Misterius: tenang, misterius-ramah, tidak menakutkan. Glen = Finn +2, Nino = Pratama +2. Kata-kata soal dan petunjuk (bola, pohon, kolam, kata Inggris) pakai klip yang sudah ada bila ada. Anggaran sekitar 1.000 karakter.
- [ ] **L6 QA dan laporan.** build, check:reach, check:quiz, smoke penuh sekali; PROGRESS.md bagian D5 + "Untuk dicoba besok pagi".

## Catatan antar sesi
(tulis di sini keputusan, masalah, dan apa yang setengah jadi)

**L0 selesai.** Adegan akhir Chapter 3 menaruh anak di jalan (`MARKET.stage.rakus/figure` di Bab3Data.ts, hook `Chapter3Hooks.placePlayer` -> `KotaLevel.placePlayer`) bila dia jauh dari titik adegan; Rakus dan siluet terlihat jelas (test-results/bab3-end-rakus.png, bab3-end-figure.png, versi -touch). `ch3Watch` di smoke test mengambil tangkapan layar di tengah adegan.

**L1 selesai.** `src/world/kota/Chapter4.ts` (state machine '' -> 'school' -> 'aara' -> 'park' -> 'figure' -> 'lab' -> `chaptersDone` 'bab4'), data/teks `Bab4Data.ts` (`AARA`, `BAB4_LINES`). Save: `save.data.bab4 = { step, clue }` (+ `setBab4`, disanitasi). Chapter 4 dimulai di `KotaLevel.startCh4()`: setelah perayaan Chapter 3 (hook baru `Chapter3Hooks.afterParty`) atau saat load bila bab3 selesai dan bab4 belum (bukan sandbox). Glen dipaksa mode glen dan tombol ubah dimatikan sampai bab selesai (`complete()` menyalakannya lagi); misi warga dijeda (`canOffer` memeriksa ch4.active); beam + bintang peta ke Aara (-17,-93, jalan sekolah). Tes lama disesuaikan: `chaptersDone` yang berarti "kota bebas" kini memuat 'bab4'; `bab3-end` memeriksa Chapter 4 mulai ("school") setelah perayaan. Tes baru `bab4-flow`. Handle tes `window.__ch4` (step/arrived/advance/done).

Kalimat baru Chapter 4 (teks saja; sumber `Bab4Data.ts` `BAB4_LINES`):
- `bab4_nino_mulai` (nino): Glen, ayo temui Aara di sekolah. Dia pintar mencari petunjuk!
