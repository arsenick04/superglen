# AGENTS.md — instruksi untuk Codex (dan agen koding lain)

Superglen: game 3D (Vite + TypeScript + Three.js + Rapier) untuk anak 5 tahun. Target akhir aplikasi (APK/iOS); browser dipakai untuk pengujian.
Peran: **Claude adalah perencana dan pemeriksa**, Codex yang menulis kode. Setiap tugas datang sebagai instruksi tertulis dari Claude; kerjakan persis itu, jangan memperluas cakupan.

## Gambaran proyek (baca ini dulu)

**Cerita singkat.** Glen, anak sekolah di Kota Botanica, menemukan gedung tua Barongsai tersembunyi di bukit. Di dalamnya ada Lab rahasia dan Nino (pemandu ramah). Glen berubah menjadi **Superglen** (kostum Barongsai merah-emas) dengan kemampuan Lompat Irama Barongsai, terbang, laser, dan perisai. Ia menjinakkan monster hewan: Curut Cemberut → Ular Melar → Tikus Rakus → Elang Belang → Gorilla Gembira (ditolong, bukan dilawan). Aara, teman sekolah dengan alat penerjemah, berkenalan dengan Nino di Chapter 5. Sosok Misterius baru muncul di akhir game (pancingan Superglen 2). Di sela cerita ada "Tantangan Pintar" (kuis berhitung, Inggris, Mandarin, hewan, membaca) untuk persiapan SD.

**Status sekarang.** Chapter 1–6 bisa dimainkan di kota open world sekitar 300 × 300 m. Chapter 7 (Elang Belang), Chapter 8 (Gorilla Gembira), penutup, dan sinematik belum dibuat. Rincian per langkah ada di `D6_PLAN.md`; riwayat di `PROGRESS.md`.

**Peta kode.**
| Folder / file | Isi |
|---|---|
| `src/main.ts`, `src/core/` | boot, loop fisika 60 Hz (`Game.ts`), Save (localStorage), StartGate, renderer |
| `src/player/` | Glen/Superglen: gerak, lompat irama, terbang, laser, perisai, energi (hati); `CharacterModels.ts` memuat GLB tokoh |
| `src/camera/` | kamera orang ketiga, zoom, kamera pertarungan |
| `src/input/` | keyboard+mouse, sentuh (joystick), gamepad |
| `src/gameplay/` | Dialog, interaksi, objective, BattleMode, efek |
| `src/world/LevelManager.ts`, `levels.ts`, `progress.ts` | level, perpindahan level, rute save |
| `src/world/bab1/`, `bab2/` | Lab (Chapter 1) dan hangar latihan (Chapter 2) |
| `src/world/kota/` | kota: `CityData.ts` (tata letak, collider, pijakan — sumber kebenaran), `CityBuilder/CityMesher/ChunkStreamer` (tampilan per potongan), `CityModels/CityDressing/EnvModels` (model Kenney dan gedung pemilik), `CityLife` (warga dan lalu lintas), `Chapter3..6.ts` + `Bab*Data.ts` (cerita dan dialog per chapter), `MarketRats/SnakeBoss/RakusBoss` (musuh) |
| `src/quiz/`, `src/data/quiz/*.json` | mesin kuis dan bank soal |
| `src/audio/` | AudioManager (suara, efek, musik), efek prosedural |
| `src/ui/` | HUD, gelembung dialog berpotret, menu setelan, peta |
| `src/config/` | `parkour.ts` (angka lompat), `combat.ts` (angka pertarungan) |
| `public/models/`, `public/env/` | GLB hasil optimasi (tokoh, musuh, gedung, Kenney); sumber di `art/` |
| `public/audio/` | klip suara ElevenLabs (jangan dibuat ulang kecuali diminta), musik |
| `scripts/smoke-test.cjs` | tes end-to-end Playwright, dipilih per grup dengan `ONLY=<regex>` |
| `scripts/reachability.ts` | `check:reach`, memastikan semua atap dan koin bisa dicapai |

**Kebiasaan kode.** TypeScript ketat; tanpa alokasi per frame di loop (pakai objek yang dipakai ulang); semua debug lewat `window.__superglen`; tes memakai `?level=…&free=1` untuk masuk langsung.

## Wajib dibaca sebelum mengubah kode
- `CLAUDE.md` bagian "Aturan proyek", "Arah cerita", "Aturan parkour".
- `D6_PLAN.md` (status pekerjaan terkini dan catatan per langkah).
- `PAKET_P1_PARKOUR.md` bila menyentuh lompat/panjat/bangunan.

## Aturan keras
- Semua angka lompat hanya di `src/config/parkour.ts`; semua angka pertarungan di `src/config/combat.ts`.
- Setiap bangunan wajib punya rute naik; `npm run check:reach` harus lulus.
- Konten anak: tanpa kekerasan, musuh dijinakkan bukan mati, tanpa unsur mistis. Teks game Bahasa Indonesia ("Chapter", "Lab"); kode/komentar boleh Inggris.
- Jangan memanggil ElevenLabs/Higgsfield/API berbayar dari game. Jangan menulis kunci API ke repo.
- Jangan menambah dependensi npm tanpa diminta. Jangan menambah `playwright` ke package.json (pakai yang sudah terpasang global).
- Jangan melonggarkan tes supaya lulus; kalau batas harus berubah, tulis alasannya di deskripsi PR.
- Satu tugas = satu PR kecil dengan judul jelas.

## Perintah pemeriksaan (jalankan sebelum membuka PR)
```bash
npm ci
npm run build
npm run check:reach
npm run check:quiz
ONLY='<grup terkait>' node scripts/smoke-test.cjs   # satu grup per kali; butuh Playwright + Chromium
```
Kalau smoke test tidak bisa dijalankan di lingkunganmu, tulis itu di PR; Claude akan menjalankannya saat memeriksa.

## Format deskripsi PR
- Apa yang diubah (daftar file).
- Hasil build / check:reach / check:quiz / smoke (atau alasan tidak dijalankan).
- Tangkapan layar bila mengubah tampilan.
- Hal yang belum selesai atau diragukan.
