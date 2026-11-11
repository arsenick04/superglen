# PROGRESS Superglen

## Paket malam A1 (11 November 2026): selesai

### Yang selesai
- Proyek Vite + TypeScript + Three.js + Rapier, dengan struktur folder `src/core`, `src/input`, `src/player`, `src/camera`, `src/world`, `src/ui`.
- Glen sebagai kapsul oranye, bergerak relatif terhadap kamera, dengan fisika Rapier (naik anak tangga rendah otomatis, tidak bisa memanjat tanjakan curam).
- Kamera orang ketiga yang mengikuti Glen dan tidak menembus dinding.
- Kontrol PC: WASD atau panah untuk jalan, klik untuk mengunci kursor, mouse untuk memutar kamera, Esc untuk melepas.
- Area uji 60 x 60 m: 3 anak tangga rendah, kotak-kotak tinggi, lorong sempit, tanjakan landai ke panggung, tanjakan curam, 6 tiang, dinding tinggi, pagar pembatas.
- Tidak ada game over: kalau jatuh, Glen muncul lagi di tempat aman terakhir.
- Penghitung FPS di kiri atas (sembunyikan dengan `?fps=0`), kartu petunjuk "Klik untuk mulai" di PC.
- Preset kualitas otomatis: PC (bayangan 2048) dan perangkat sentuh (bayangan 1024, resolusi dibatasi). Bisa dipaksa dengan `?quality=low` atau `?quality=high`.
- 5 subagent di `.claude/agents/`, gambar acuan di `art/reference/`.
- Auto-deploy GitHub Pages (`.github/workflows/deploy.yml`) dan cek build di setiap PR (`ci.yml`).

### Yang belum (sesuai rencana, bukan bagian A1)
- Kontrol sentuh iPhone dan layar "Ketuk untuk mulai" (paket A2). Di iPhone sekarang game tampil tapi Glen belum bisa digerakkan.
- Lompat Barongsai, mode Superglen, tuning rasa kontrol (paket A3).

### Hasil tes
| Pemeriksaan | Hasil |
|---|---|
| `npm run build` | Lulus, tanpa error TypeScript |
| Error console | 0 (desktop dan iPhone landscape) |
| Desktop 1280x720 | Lulus: jalan dengan W dan D, tetap di tanah |
| iPhone landscape 844x390, sentuh disimulasikan | Lulus: kanvas penuh layar, preset kualitas rendah terpilih |
| Naik 3 anak tangga, naik tanjakan 20°, ditolak tanjakan 55° | Lulus |

Frame rate: baru diukur di Chromium headless dengan renderer software, jadi hanya perkiraan kasar: 10 sampai 12 fps di 1280x720 (50 fps saat diam di awal), 21 sampai 24 fps di 844x390. Angka ini **bukan** angka perangkat asli. Fps asli di PC dan iPhone belum diukur; lihat angka "FPS" di kiri atas saat mencoba dan catat di sini.

### Cara mengetes
```bash
npm install
npm run dev          # PC: http://localhost:5173  iPhone (WiFi sama): alamat "Network" yang dicetak Vite
npm run build
npm run test:smoke   # tes otomatis di Chromium headless (butuh Playwright terpasang global)
```
Sesi ini berjalan di cloud, jadi tidak ada link dev server lokal yang bisa saya berikan. Setelah PR di-merge ke `main`, game terbuka di https://arsenick04.github.io/superglen/

### Keputusan yang diambil sendiri (pilihan aman)
- **GitHub Pages**: workflow mencoba mengaktifkan Pages otomatis. Kalau deploy pertama gagal, buka Settings > Pages di repo, pilih Source: **GitHub Actions**, lalu jalankan ulang workflow.
- **Ukuran bundle 4,9 MB (1,8 MB gzip)**: hampir semuanya mesin fisika Rapier versi "compat" yang dipilih design doc. Dibiarkan dulu; bisa dikecilkan di Fase F kalau waktu muat di iPhone terasa lama.
- **Lompat tidak dibuat** di A1 walau tombol Spasi sudah terbaca, karena itu bagian A3.
- **qa-tester tidak dipanggil sebagai agen terpisah**: orkestrator menjalankan build dan smoke test langsung karena lebih hemat. Subagent baru di `.claude/agents/` baru aktif di sesi berikutnya; malam ini perannya dijalankan agen umum dengan model yang sama (opus untuk architect, sonnet untuk gameplay-dev).
- Versi: three 0.187, rapier3d-compat 0.21, vite 8.3, typescript 7.0.

### Kredit terpakai
Higgsfield: 0. ElevenLabs: 0.

## Untuk dicoba besok pagi
1. **Merge PR, lalu buka https://arsenick04.github.io/superglen/ di PC.** Klik layar, jalan dengan WASD, putar kamera dengan mouse. Rasakan: apakah kecepatan jalan dan putaran kamera enak?
2. **Jelajahi area uji**: maju lurus (W) untuk naik 3 anak tangga, ke kiri lalu maju untuk naik tanjakan ke panggung kuning, berdiri membelakangi dinding tinggi di sisi kiri untuk melihat kamera merapat.
3. **Buka link yang sama di Safari iPhone (landscape)** hanya untuk melihat tampilannya dan angka FPS di kiri atas. Glen belum bisa digerakkan di iPhone sampai paket A2.
