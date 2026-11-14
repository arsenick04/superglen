# Superglen Game: Instruksi Kerja Claude Code

File ini dibaca otomatis oleh Claude Code. Detail game ada di `SUPERGLEN_GAME_DESIGN.md`. Acuan karakter ada di `art/reference/`.

## Peran

**Kamu (sesi utama, model Fable) adalah orkestrator dan pengawas.** Tugasmu:
1. Memecah setiap fase jadi tugas kecil yang jelas.
2. Mendelegasikan tugas ke subagent dengan model yang paling hemat dan cukup mampu (lihat tabel di bawah).
3. Meninjau hasil subagent, menjalankan tes, dan memutuskan apakah tugas selesai.
4. Melaporkan ke pemilik proyek di setiap checkpoint.

Jangan menulis kode besar sendiri. Pakai kemampuanmu untuk keputusan arsitektur, review, dan memperbaiki masalah yang gagal diselesaikan subagent dua kali.

## Pembagian model

| Subagent | Model | Dipakai untuk |
|---|---|---|
| `architect` | opus | Struktur proyek awal, sistem inti yang rumit (fisika karakter, kamera, state machine boss). Dipakai jarang. |
| `gameplay-dev` | sonnet | Hampir semua kode game: level, musuh, skill, UI, quiz engine, kontrol PC dan sentuh. |
| `asset-pipeline` | sonnet | Higgsfield MCP, ElevenLabs MCP, konversi dan optimasi GLB, script audio. |
| `content-writer` | haiku | Bank soal quiz (JSON), dialog.json, teks UI, daftar prompt gambar. |
| `qa-tester` | haiku | Menjalankan build, tes, lint, cek error di console, cek ukuran file. Melaporkan, tidak memperbaiki. |

Aturan hemat token:
- Beri subagent hanya bagian design doc yang relevan, bukan seluruh dokumen.
- Satu tugas, satu subagent, instruksi spesifik dengan kriteria selesai yang bisa dicek.
- Kalau tugas gagal 2 kali di haiku, naikkan ke sonnet. Kalau gagal 2 kali di sonnet, tangani sendiri atau pakai `architect`.
- Jangan membaca ulang file besar yang tidak berubah.

## Aturan proyek

- **Game 3D penuh** (Three.js + Rapier). Gambar di `art/reference/` hanya acuan untuk membuat model 3D, bukan sprite 2D.
- **Browser dulu**: harus jalan di Chrome/Edge/Safari di PC dan Safari di iPhone. Satu kode, kontrol otomatis (keyboard + mouse di PC, joystick sentuh di HP).
- **Tools gratis**, kecuali ElevenLabs dan Higgsfield yang sudah dilanggan pemilik proyek. Jangan menambah layanan berbayar.
- Sebelum memakai kredit Higgsfield atau ElevenLabs dalam jumlah besar, buat 1 contoh dan minta persetujuan.
- Konten anak-anak: tanpa kekerasan, musuh dijinakkan bukan mati, tanpa unsur mistis.
- Tulis teks game dalam Bahasa Indonesia. Kode dan komentar boleh Bahasa Inggris.
- Commit git di akhir setiap tugas yang selesai, dengan pesan yang jelas.

## Definisi selesai (setiap milestone)

1. `npm run build` berhasil tanpa error.
2. Tidak ada error di console saat dimainkan.
3. Dites di viewport desktop (1280x720) dan viewport iPhone landscape (844x390) dengan input sentuh disimulasikan.
4. Frame rate dicatat. Target: 60 fps desktop, 30 fps HP.
5. Ada catatan singkat di `PROGRESS.md`: apa yang selesai, apa yang belum, cara mengetes.
6. Link untuk dimainkan (dev server lokal dan alamat jaringan lokal supaya bisa dibuka dari iPhone di WiFi yang sama).

## Rencana fase dan checkpoint

Kerjakan satu **Fase** per instruksi pemilik proyek. Setiap fase berisi beberapa milestone dari design doc. Di akhir fase, **berhenti dan tunggu** pemilik proyek memainkannya bersama anaknya.

**Fase A: Fondasi dan rasa bermain** (Milestone 1)
Proyek, karakter kapsul, kontrol PC dan sentuh, kamera, Lompat Barongsai, satu area uji. Ini fase terpenting: kalau kontrolnya tidak enak dimainkan anak, semua yang lain percuma.
Checkpoint: anak bisa menggerakkan Glen dan melompat di iPhone dan PC.

**Fase B: Awal cerita dan sistem inti** (Milestone 2, 3, 3b, 3c)
Bab 1 dan 2, semua skill Superglen, Tantangan Pintar, pipeline audio ElevenLabs.
Checkpoint: Bab 1 dan 2 bisa dimainkan dari awal sampai alarm pasar, dengan suara.

**Fase C: Aset visual asli** (Milestone 5)
Sheet karakter baru via Higgsfield, model 3D via Tripo, rigging Mixamo, ganti kapsul dengan GLB. Fase ini butuh banyak langkah manual dari pemilik proyek (upload ke Tripo dan Mixamo). Siapkan panduan langkah demi langkah dan folder tujuan.
Checkpoint: Glen, Superglen, Nino, Aara tampil sebagai model 3D yang beranimasi.

**Fase D: Kota dan pertarungan pertama** (Milestone 4, 6)
Pasar, Tikus Kecil, Kota Botanica open world, sepeda, Bab 4 detektif.
Checkpoint: kota bisa dijelajahi bebas, Bab 3 dan 4 selesai.

**Fase E: Mini-boss** (Milestone 7, 8, 9, 10)
Bab 5 sampai 8. Kerjakan satu bab per sub-tugas, tiap bab dites sebelum lanjut.
Checkpoint: semua mini-boss bisa dikalahkan anak tanpa bantuan lebih dari sekali.

**Fase F: Final dan rilis** (Milestone 11, 12, 13)
Sarang Raja, Raja Tikus Rakus, ending, PWA, hosting GitHub Pages.
Checkpoint: game lengkap bisa dibuka dari link dan dipasang di layar utama iPhone.

## Mode sesi malam

Pemilik proyek biasanya memberi instruksi malam hari lalu tidur. Setiap sesi malam:
1. Kerjakan **satu paket malam** dari daftar di bawah, tanpa menunggu persetujuan di tengah jalan. Kalau ada keputusan yang butuh pemilik proyek, ambil pilihan paling aman, catat di `PROGRESS.md`, dan lanjutkan.
2. Jangan memakai kredit Higgsfield atau ElevenLabs lebih dari 1 contoh per kategori tanpa persetujuan.
3. Sebelum berhenti: build lulus, commit, update `PROGRESS.md` dengan bagian "Untuk dicoba besok pagi" (maksimal 3 poin, cara membukanya di PC dan iPhone).
4. Berhenti setelah paket selesai. Jangan lanjut ke paket berikutnya.

**Paket malam Fase A**
- A1: Setup proyek (Vite, Three.js, Rapier, TypeScript), struktur folder, area uji datar dengan beberapa kotak dan tiang, karakter kapsul, kamera orang ketiga, gerak dengan WASD dan mouse di PC.
- A2: Kontrol sentuh iPhone (joystick virtual, tombol besar, deteksi otomatis PC vs sentuh), layar "Ketuk untuk mulai", akses dari iPhone lewat jaringan lokal.
- A3: Lompat Barongsai (lompat, double jump, hentakan mendarat), mode Glen dan Superglen (ganti warna kapsul dulu), tuning rasa kontrol untuk anak 5 tahun, cek fps di kedua perangkat.

**Paket malam Fase B**
- B1: Bab 1 (jalan kota sederhana, gedung tua, lab, interaksi, transformasi), dialog teks dulu.
- B2: Bab 2 bagian skill: terbang dan cincin, laser dan sasaran, perisai dan bola karet.
- B3: Tantangan Pintar: quiz engine + bank soal awal 5 kategori (gambar placeholder).
- B4: Pipeline audio ElevenLabs + audio Bab 1 dan 2 + 1 contoh per kategori soal (tunggu persetujuan untuk sisanya).
  - **PENGINGAT UNTUK PEMILIK PROYEK (soundtrack Superglen):** pemilik proyek punya soundtrack sendiri dan minta diingatkan saat B4. Di laporan akhir paket B3 dan di pesan pertama sesi B4, ingatkan: unggah file ke `public/audio/music/` di repo (MP3 atau M4A, tiap lagu di bawah sekitar 3 MB, bisa diulang mulus), lalu sebutkan lagu mana untuk adegan mana (layar awal, menjelajah, berubah jadi Superglen, pertarungan). Di B4 buat jalur musik di `AudioManager`: berulang, otomatis mengecil saat Nino berbicara, dimulai dari ketukan pertama (`StartGate.onStart`). Kalau file belum ada, jangan menunggu: bangun jalurnya, kerjakan sisa B4, dan catat di `PROGRESS.md` bahwa musik menunggu file. Cantumkan di `CREDITS.md`.

**Paket malam Fase D** (kota open world; dikerjakan sebelum Fase C atas keputusan pemilik proyek)
- D1: Kerangka Kota Botanica: sekitar 300 x 300 m, 5 sampai 6 distrik, dimuat per potongan (chunk) supaya ringan di iPhone, gedung modular yang semuanya punya rute naik, bisa dijelajahi bebas sebagai Glen dan Superglen. **Gedung tua Barongsai / Lab tidak di tengah kota**: tersembunyi di pinggir kota atau di bukit, terbengkalai.
- D2: Sambungkan cerita ke kota: Chapter 1 dimulai di jalan kota (pulang sekolah), jalan setapak ke gedung tua di bukit, pintu gedung membawa ke Lab (ruangan terpisah), Chapter 2 latihan di hangar Lab, keluar lewat pintu gedung ke bukit lalu kota terbuka bebas. Save lama tetap jalan.
- D3: Isi kota: koin, sepeda (mode Glen), warga dan misi kecil, penanda arah.
- D4: Chapter 3: pasar dan Tikus Kecil.
- D5: Chapter 4: mode detektif.

Fase berikutnya dipecah dengan cara yang sama saat fase itu dimulai: satu paket kira-kira 2 sampai 4 jam kerja agen.

## Format laporan di setiap checkpoint

Singkat, dalam Bahasa Indonesia:
- Apa yang bisa dimainkan sekarang dan cara membukanya
- Apa yang perlu dicoba bersama anak (2 sampai 3 hal spesifik)
- Masalah yang diketahui
- Keputusan yang butuh pemilik proyek
- Perkiraan kredit Higgsfield dan ElevenLabs yang terpakai

## Aturan parkour (berlaku di atas spesifikasi lama)

Semua hal tentang lompat, memanjat, undakan, dan Lompat Irama Barongsai
mengikuti PAKET_P1_PARKOUR.md. Jika ada yang bertentangan dengan A3,
SUPERGLEN_GAME_DESIGN.md bagian Dunia, atau paket lain, PAKET_P1_PARKOUR.md
yang dipakai. Semua angka lompat hanya boleh ada di src/config/parkour.ts.
Setiap bangunan baru wajib punya rute naik (lihat bagian 3 di file itu),
dan npm run check:reach harus lulus sebelum paket dianggap selesai.
