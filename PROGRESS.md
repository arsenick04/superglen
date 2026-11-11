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

## Paket malam A2 (11 November 2026): selesai

### Yang selesai
- **Joystick virtual** di kiri: muncul di tempat jempol menyentuh (seluruh 45% kiri layar), radius 60 px.
- **Dua tombol besar** di kanan bawah untuk mode Glen: Lompat (emas, 104 px) dan Bicara/Ambil (merah, 88 px). Ikon saja, tanpa tulisan.
- **Geser jari di area kosong** untuk memutar kamera.
- Multi-sentuh: joystick, kamera, dan tombol bisa dipakai bersamaan.
- **Layar "Ketuk untuk mulai"** di perangkat sentuh. Ketukan ini juga disiapkan sebagai pembuka audio iOS untuk paket B4.
- **Layar "Putar HP ke samping"** kalau HP dipegang tegak.
- Deteksi otomatis: PC tetap memakai keyboard dan mouse, perangkat sentuh memakai kontrol sentuh. `?touch=1` memaksa kontrol sentuh di PC untuk uji coba.
- Pencegahan zoom, scroll, dan menu tekan-lama di Safari iOS.

### Yang belum
- Tombol Lompat sudah terbaca tapi Glen belum melompat. Itu paket A3.
- Tombol Bicara/Ambil belum punya fungsi sampai Bab 1 (paket B1).

### Hasil tes
| Pemeriksaan | Hasil |
|---|---|
| `npm run build` dan `npm run typecheck` | Lulus |
| Error console | 0 |
| Desktop 1280x720 | Lulus 3 dari 3 |
| iPhone landscape 844x390, sentuhan disimulasikan | Lulus 24 dari 24: layar mulai, joystick, geser kamera, multi-sentuh, tombol |
| Tata letak 667x375 (iPhone SE) dan 1024x768 (iPad) | Lulus: tidak terpotong, tidak tumpang tindih |
| Layar putar HP di 390x844 | Lulus |

Frame rate headless (renderer software, hanya perkiraan): desktop 10 sampai 11 fps, iPhone landscape 14 sampai 23 fps. **Fps di perangkat asli belum diukur.** Angka FPS di kiri atas layar adalah angka yang perlu dicatat dari iPhone dan PC.

### Yang hanya bisa dinilai di iPhone asli
- Rasa joystick (zona mati, radius) dan kecepatan putar kamera untuk jari anak.
- Posisi tombol terhadap poni layar dan garis home.
- Arah geser kamera naik-turun (sekarang sama dengan mouse; bisa dibalik kalau terasa aneh).

### Keputusan yang diambil sendiri
- Joystick dibuat "mengambang" (muncul di tempat jempol), karena lebih mudah untuk anak daripada joystick di posisi tetap.
- Di laptop layar sentuh, sekali layar disentuh game pindah ke mode sentuh dan mouse tidak lagi mengunci kursor. Dibiarkan karena target utama adalah iPhone dan PC biasa.
- Akses jaringan lokal sudah aktif dari A1 (`npm run dev` mencetak alamat "Network"). Cara termudah tetap lewat GitHub Pages.

### Kredit terpakai
Higgsfield: 0. ElevenLabs: 0.

## Untuk dicoba besok pagi
1. **Merge PR, tunggu deploy sekitar 2 menit, lalu buka https://arsenick04.github.io/superglen/ di Safari iPhone, posisi landscape.** Ketuk untuk mulai. Kalau tampilan lama masih muncul, tutup tab dan buka lagi.
2. **Biarkan anak mencoba**: jempol kiri untuk jalan, geser jari kanan untuk memutar kamera. Perhatikan: apakah joystick mudah dipakai, apakah kamera terlalu cepat atau lambat, apakah tombol mudah dijangkau.
3. **Catat angka FPS** di kiri atas, di iPhone dan di PC. Tombol Lompat belum berfungsi sampai paket A3.
