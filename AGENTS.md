# AGENTS.md — instruksi untuk Codex (dan agen koding lain)

Superglen: game 3D (Vite + TypeScript + Three.js + Rapier) untuk anak 5 tahun. Target akhir aplikasi (APK/iOS); browser dipakai untuk pengujian.
Peran: **Claude adalah perencana dan pemeriksa**, Codex yang menulis kode. Setiap tugas datang sebagai instruksi tertulis dari Claude; kerjakan persis itu, jangan memperluas cakupan.

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
