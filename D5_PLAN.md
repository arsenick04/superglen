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
- [x] **L2 Aara.** Aara (sahabat sekolah Glen, acuan art/reference/aara_*) sebagai figur sederhana low-poly di sekolah, membawa alat penerjemah. Tantangan "Kata Inggris dari Aara": 3 soal pakai quiz engine (mis. "Apa bahasa Inggrisnya buku?"), tiap jawaban benar membuat alatnya makin canggih (efek visual), lalu alat menangkap sinyal yang menunjuk ke taman kota. Tes `bab4-aara`.
- [x] **L3 Petunjuk di taman.** 3 papan/kertas petunjuk bertuliskan satu kata ("bola", "pohon", "kolam"), dibacakan bila anak menekan tombol pengeras suara. Anak memilih tempat yang cocok (atau berjalan ke sana), tempat itu berkilau, petunjuk berikutnya muncul. Tanpa jalan buntu: bantuan muncul setelah beberapa detik. Tes `bab4-clues`.
- [x] **L4 Sosok Misterius + penutup.** Siluet muncul di taman: "Aku sudah lama mengawasimu... Superglen." lalu menghilang (ramah, tidak menakutkan). Kembali ke Lab: Nino menemukan pasukan tikus memakai alat curian dari lab lama; misi berikutnya dimulai (teaser). Chapter 4 selesai, perayaan, kota bebas lagi dan misi warga aktif. Tes `bab4-end`.
- [x] **L5 Suara.** Semua kalimat baru Chapter 4 ke audio/dialog.json dengan ekspresi per kalimat. Aara: pilih suara anak perempuan/remaja putri yang ceria, berbeda dari warga lain. Sosok Misterius: tenang, misterius-ramah, tidak menakutkan. Glen = Finn +2, Nino = Pratama +2. Kata-kata soal dan petunjuk (bola, pohon, kolam, kata Inggris) pakai klip yang sudah ada bila ada. Anggaran sekitar 1.000 karakter.
- [x] **L6 QA dan laporan.** build, check:reach, check:quiz, smoke penuh sekali; PROGRESS.md bagian D5 + "Untuk dicoba besok pagi".

## Catatan antar sesi
(tulis di sini keputusan, masalah, dan apa yang setengah jadi)

**L0 selesai.** Adegan akhir Chapter 3 menaruh anak di jalan (`MARKET.stage.rakus/figure` di Bab3Data.ts, hook `Chapter3Hooks.placePlayer` -> `KotaLevel.placePlayer`) bila dia jauh dari titik adegan; Rakus dan siluet terlihat jelas (test-results/bab3-end-rakus.png, bab3-end-figure.png, versi -touch). `ch3Watch` di smoke test mengambil tangkapan layar di tengah adegan.

**L1 selesai.** `src/world/kota/Chapter4.ts` (state machine '' -> 'school' -> 'aara' -> 'park' -> 'figure' -> 'lab' -> `chaptersDone` 'bab4'), data/teks `Bab4Data.ts` (`AARA`, `BAB4_LINES`). Save: `save.data.bab4 = { step, clue }` (+ `setBab4`, disanitasi). Chapter 4 dimulai di `KotaLevel.startCh4()`: setelah perayaan Chapter 3 (hook baru `Chapter3Hooks.afterParty`) atau saat load bila bab3 selesai dan bab4 belum (bukan sandbox). Glen dipaksa mode glen dan tombol ubah dimatikan sampai bab selesai (`complete()` menyalakannya lagi); misi warga dijeda (`canOffer` memeriksa ch4.active); beam + bintang peta ke Aara (-17,-93, jalan sekolah). Tes lama disesuaikan: `chaptersDone` yang berarti "kota bebas" kini memuat 'bab4'; `bab3-end` memeriksa Chapter 4 mulai ("school") setelah perayaan. Tes baru `bab4-flow`. Handle tes `window.__ch4` (step/arrived/advance/done).

Kalimat baru Chapter 4 (teks saja; sumber `Bab4Data.ts` `BAB4_LINES`):
- `bab4_nino_mulai` (nino): Glen, ayo temui Aara di sekolah. Dia pintar mencari petunjuk!

**L2 selesai.** `src/world/kota/Aara.ts` (`AaraActor`: model low-poly 1 mesh `lit` + 1 bola cahaya MeshBasic = 2 draw call; level alat 0..3 membesarkan/mewarnai bola). `Chapter4.runAara()`: tiba (<9 m) -> langkah 'aara' -> Aara menyapa, 3 soal bank `inggris_008` (buku), `inggris_007` (bola), `inggris_001` (kucing) lewat `quiz.runQuestion` (klip suara soal sudah ada; soal dihitung di statistik Inggris), tiap benar: bola naik level + kilau + cincin + pujian Aara; lalu sinyal -> `setStep('park')`: Aara "lari duluan" ke gerbang timur taman (`PARK.aara`), beam + bintang peta ke taman (-113.5,-113.5). Di sekolah: 49 draw call / ~59,5k segitiga (aman). Tes `bab4-aara`, `bab4-aara-touch` (dengan tangkapan layar bab4-aara-meet.png). `PARK`, `AARA_QUESTIONS` ada di Bab4Data.ts.

Kalimat baru L2 (teks saja):
- `bab4_aara_halo` (aara): Glen! Aku membuat alat penerjemah. Mau coba?
- `bab4_glen_mau` (glen): Mau! Aku siap menjawab.
- `bab4_aara_benar1` (aara): Benar! Alatnya mulai menyala.
- `bab4_aara_benar2` (aara): Betul! Alatnya makin canggih.
- `bab4_aara_benar3` (aara): Hebat! Alatnya sudah canggih sekali!
- `bab4_aara_sinyal` (aara): Tuut tuut! Ada sinyal. Menunjuk ke taman kota!
- `bab4_glen_taman` (glen): Ayo ke taman, kita selidiki!

**L3 selesai.** `ClueProps.ts` (1 papan petunjuk yang pindah-pindah + 1 tiang cahaya = 2 draw call; park: 43-44 draw call / ~50k segitiga). `Chapter4` fase taman: `clue` (0..3, disimpan di `save.bab4.clue`) + `phase` 'paper'/'place'. Papan 0 di jalan utara taman, papan n berdiri di tempat yang ditemukan petunjuk n-1. Tombol tangan di papan membuka kartu baca (soal cerita `bab4_clue_<kata>`, kategori membaca, tampilan teks besar, 3 kartu gambar bola/pohon/kolam, tombol pengeras suara = `audio_id` `bab4_kata_<kata>`, KLIP BELUM ADA: L5 harus membuatnya; kalimat kartu "Baca katanya. Tempat apa?"). Benar -> tempat berkilau (tiang cahaya), beam ke sana, tiba -> papan berikut muncul di situ; kolam (ketiga) -> langkah 'figure' (L4 mengisi). Tanpa jalan buntu: Aara menolong setelah 22 dtk tanpa kemajuan (`CLUE_HELP_AFTER`); kartu salah dua kali menyisakan yang benar (quiz engine). Resume: clue n -> papan n di tempatnya (clue 3 -> menuju kolam). Item baru `pohon`, `kolam` di src/data/quiz/items.json (emoji sementara). Tes `bab4-clues`, `-touch` (tangkapan layar bab4-clues-*.png). Catatan: menekan tombol tangan saat baris dialog terbuka hanya melewati baris (tekan lagi).
Klip kata (bola/pohon/kolam) tidak ada di public/audio atau bank kuis: L5 perlu `bab4_kata_bola`, `bab4_kata_pohon`, `bab4_kata_kolam`.

Kalimat baru L3 (teks saja):
- `bab4_aara_taman` (aara): Lihat! Ada papan petunjuk. Ayo kita baca!
- `bab4_aara_baca` (aara): Baca katanya! Tekan gambar pengeras suara kalau mau mendengarnya.
- `bab4_aara_papan` (aara): Dekati papan itu, lalu tekan tombol tangan.
- `bab4_aara_bola` (aara): Bola! Tempat bermain berkilau. Ayo ke sana!
- `bab4_aara_pohon` (aara): Pohon! Pohonnya berkilau. Ayo ke sana!
- `bab4_aara_kolam` (aara): Kolam! Kolamnya berkilau. Ayo ke sana!
- `bab4_aara_lagi` (aara): Ada papan lagi di sini! Baca, yuk.
- `bab4_aara_ayo` (aara): Ayo, ke tempat yang berkilau!
- (klip kartu baca, bukan baris dialog) `bab4_kata_bola` / `bab4_kata_pohon` / `bab4_kata_kolam`; teks kartu: "Baca katanya. Tempat apa?"

**L4 selesai.** Adegan Sosok Misterius: `Chapter4.runFigure()` (langkah 'figure'): anak dipindah ke tepi kolam (`FIGURE.stage`), siluet biru-tua ramah (mesh `personGeo`, MeshBasic transparan) memudar masuk di rumput barat kolam (-114.5,-119.5), melambai, "Aku sudah lama mengawasimu... Superglen.", memudar dengan kilau; Aara dan Glen bereaksi; langkah 'lab' (beam + bintang peta ke pintu gedung tua, misi warga tetap dijeda, Glen tetap mode Glen, Aara menunggu di gerbang taman). Penutup di Lab: `Story.chapter4Finale()` (bab1/Story.ts): bila `bab4.step === 'lab'` beam menuju Nino, Nino bicara (komputer lab, pasukan tikus memakai alat curian dari lab lama, teaser), `markChapterDone('bab4')`, 5 koin, `Celebration` "Chapter 4 selesai!", lalu `travel` ke kota (pintu bukit): kota bebas, misi warga aktif, tombol ubah menyala. `Chapter4.complete()` dihapus (penutup terjadi di Lab). Wajah bubble `misterius` ditambah. Tes `bab4-end`, `bab4-end-touch` (figure -> lab -> Nino -> kota bebas; tangkapan bab4-end-figure.png). Catatan: tes `ch3Watch`-style memakai `.chapter-star` yang `show` (di Lab ada dua elemen bintang). Batas diketahui: kamera adegan siluet dituning lewat tangkapan layar desktop saja; reload di langkah 'lab' mulai di pintu bukit (beam mati bila < 6 m dari pintu).

**Daftar lengkap kalimat baru Chapter 4 (teks saja; sumber `src/world/kota/Bab4Data.ts` `BAB4_LINES`)**:
- `bab4_nino_mulai` (nino): Glen, ayo temui Aara di sekolah. Dia pintar mencari petunjuk!
- `bab4_aara_halo` (aara): Glen! Aku membuat alat penerjemah. Mau coba?
- `bab4_glen_mau` (glen): Mau! Aku siap menjawab.
- `bab4_aara_benar1` (aara): Benar! Alatnya mulai menyala.
- `bab4_aara_benar2` (aara): Betul! Alatnya makin canggih.
- `bab4_aara_benar3` (aara): Hebat! Alatnya sudah canggih sekali!
- `bab4_aara_sinyal` (aara): Tuut tuut! Ada sinyal. Menunjuk ke taman kota!
- `bab4_glen_taman` (glen): Ayo ke taman, kita selidiki!
- `bab4_aara_taman` (aara): Lihat! Ada papan petunjuk. Ayo kita baca!
- `bab4_aara_baca` (aara): Baca katanya! Tekan gambar pengeras suara kalau mau mendengarnya.
- `bab4_aara_papan` (aara): Dekati papan itu, lalu tekan tombol tangan.
- `bab4_aara_bola` (aara): Bola! Tempat bermain berkilau. Ayo ke sana!
- `bab4_aara_pohon` (aara): Pohon! Pohonnya berkilau. Ayo ke sana!
- `bab4_aara_kolam` (aara): Kolam! Kolamnya berkilau. Ayo ke sana!
- `bab4_aara_lagi` (aara): Ada papan lagi di sini! Baca, yuk.
- `bab4_aara_ayo` (aara): Ayo, ke tempat yang berkilau!
- `bab4_aara_lihat` (aara): Glen, lihat! Siapa itu di dekat pohon?
- `bab4_misterius_awas` (misterius): Aku sudah lama mengawasimu... Superglen.
- `bab4_glen_tahu` (glen): Dia tahu namaku! Dia siapa, ya?
- `bab4_aara_lapor` (aara): Ayo lapor ke Nino di lab!
- `bab4_nino_temu` (nino): Glen! Aku menemukan sesuatu di komputer lab.
- `bab4_nino_alat` (nino): Pasukan tikus memakai alat curian dari lab lama kita!
- `bab4_glen_curi` (glen): Wah! Kita harus mengambilnya kembali.
- `bab4_nino_siap` (nino): Betul. Petualangan berikutnya menunggu. Siap, Superglen?
- Klip kartu baca (bukan dialog; belum ada di public/audio): `bab4_kata_bola`, `bab4_kata_pohon`, `bab4_kata_kolam`. Soal Aara memakai klip bank yang sudah ada (`quiz_inggris_008`, `_007`, `_001`).

**L5 selesai.** 27 klip `bab4_*` (24 baris dialog + `bab4_kata_bola/pohon/kolam`, Nino membaca satu kata pelan) di `audio/dialog.json` dengan `delivery`, `public/audio/`. Suara baru di `audio/voices.json`: `aara` = Kak Ceria (d15jrIAARvF899pDoC6T, sudah di akun), `misterius` = Den (HmwgE8AfbDbaZpgAi4Bn, -1 semiton). Lunetta dihapus dari akun (slot bebas). Cek Scribe (ind): semua cocok kecuali perbedaan ejaan nama (Ara, Super Glenn, Tutut) dan `bab4_nino_temu` yang dibaca "computer lab" oleh Scribe setelah 1 ulang (kemungkinan ejaan STT; dengarkan). Tanpa perubahan kode src: semua `dialog.say` dan kartu baca (`audio_id` `bab4_kata_*`) sudah memakai id.

- L6 selesai: QA penuh, bug pasar kosong (?level= sandbox) diperbaiki di 867ea4e.
