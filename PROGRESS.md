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

## Logo dan paket malam A3 (11 November 2026): selesai

### Yang selesai
- **Logo Superglen di layar awal** (PC dan iPhone), dengan tombol "Ketuk untuk mulai" atau "Klik untuk mulai". Asli di `art/logo/`, versi ringan 117 KB di `public/img/logo.webp`.
- **Lompat Glen**: lompat kecil setinggi 0,9 m.
- **Lompat Barongsai (Superglen)**: lompat 2,4 m, tekan lagi di udara untuk double jump dengan putaran (total sekitar 4,4 m), hentakan mendarat dengan cincin emas.
- **Ganti mode Glen dan Superglen**: tombol bintang di kanan atas (sentuh) atau E (PC). Kapsul oranye menjadi merah dengan sabuk emas. Ini sementara untuk area uji; nanti terjadi di lab.
- **Tombol sentuh Superglen**: Lompat Barongsai, Laser, Perisai tersusun melengkung. Laser dan Perisai belum berfungsi (paket B2).
- **Tuning untuk anak**: masih bisa lompat 0,15 detik setelah lewat tepi, tekan lompat sedikit sebelum mendarat tetap dihitung, tinggi lompat selalu sama, menahan tombol tidak melompat berulang.
- **Kamera mengikuti otomatis** ke arah jalan setelah 1,5 detik tanpa geser kamera, dan naik sedikit saat melompat tinggi.
- **Bayangan bulat di bawah karakter** untuk memperkirakan tempat mendarat.
- **Joystick**: dorong sedikit untuk jalan pelan, dorong 70% ke atas untuk lari.
- **Resolusi adaptif**: kalau fps di bawah target (30 di HP, 60 di PC) selama 2 detik, resolusi turun bertahap, lalu naik lagi saat lancar. `?adaptive=0` mematikannya.

### Angka tuning
| | Glen | Superglen |
|---|---|---|
| Tinggi lompat | 0,9 m | 2,4 m |
| Double jump | tidak ada | +2,0 m dari titik tekan |
| Kecepatan lari | 5 m/s | 6 m/s |
| Hentakan mendarat | tidak ada | ada, radius 3 m |

Semua angka ada di `src/player/PlayerConfig.ts` dan `CameraConfig` di `src/camera/ThirdPersonCamera.ts`.

### Hasil tes
| Pemeriksaan | Hasil |
|---|---|
| `npm run build` dan `npm run typecheck` | Lulus |
| Error console | 0 |
| Desktop 1280x720 | Lulus 6 dari 6 |
| Lompat di desktop (Glen, Superglen, double jump, hentakan, coyote, buffer, tiang) | Lulus 20 dari 20 |
| iPhone landscape 844x390, sentuhan disimulasikan | Lulus 37 dari 37 |
| Tata letak tombol 667x375 dan 1024x768, kedua mode | Lulus |
| Smoke test diulang 4 kali | Lulus 4 dari 4 |

Tinggi terukur: Glen 0,90 m, Superglen 2,40 m, double jump 4,40 m. Tiang 1 m dan 1,5 m bisa dinaiki dengan satu lompatan, lompat dari tiang ke tiang sampai 3,5 m berhasil, dan tiang 3,5 m bisa dicapai dari tanah dengan double jump.

**Frame rate di perangkat asli belum diukur.** Sesi ini berjalan di cloud tanpa akses ke iPhone atau GPU, jadi butir "cek fps di kedua perangkat" dari paket A3 belum bisa dipenuhi. Di Chromium headless dengan renderer software: desktop 10 sampai 22 fps, ukuran iPhone 23 sampai 40 fps. Angka itu hanya perkiraan kasar. Mohon catat angka FPS di kiri atas layar dari iPhone dan PC.

### Catatan tes
- Satu pemeriksaan desktop ("tahan D 1 detik") sempat gagal tidak konsisten. Penyebabnya renderer software headless yang kadang macet sampai 1 detik per frame, bukan bug game. Pemeriksaan itu sekarang memakai langkah waktu deterministik.
- `qa-tester` (haiku) terhenti di tengah karena batas pemakaian. Sisa pemeriksaannya dijalankan orkestrator.

### Yang hanya bisa dinilai di iPhone asli
- Apakah anak bisa mendarat di atas tiang (radius 0,3 m). Kalau terlalu sulit, tiang bisa dilebarkan atau diberi bantuan mendarat.
- Rasa lompat: kontrol di udara dan kecepatan jatuh.
- Kamera otomatis: saat joystick ditahan menyamping, Glen berjalan melengkung lebar. Perlu dirasakan apakah ini nyaman.
- Apakah putaran double jump terlihat jelas di kapsul.

### Keputusan yang diambil sendiri
- Tombol Bicara/Ambil di mode Glen untuk sementara juga mengganti mode, karena belum ada yang bisa diajak bicara.
- Logo dipakai apa adanya dengan latar hitam, jadi layar awal berlatar hitam.

### Kredit terpakai
Higgsfield: 0. ElevenLabs: 0.

## Perbaikan gerak melingkar (12 November 2026): selesai

### Masalah
Dilaporkan dari rekaman iPhone: setelah berjalan sebentar, gerak Glen terasa terseret dan mampet. FPS di rekaman tetap 60, jadi bukan masalah performa.

### Penyebab
Kamera otomatis dari paket A3 mulai berputar 1,5 detik setelah berjalan. Arah joystick relatif terhadap kamera, jadi dengan jempol miring, kamera berputar lalu arah jalan ikut berputar lagi. Pemain berjalan melingkar terus (radius sekitar 5 m, satu putaran sekitar 9 detik). Di PC hal yang sama terjadi saat hanya menahan tombol D.

### Perbaikan
- **Arah jalan dikunci selama jempol belum diangkat.** Kamera tetap berputar ke belakang pemain, tetapi arah jalan di dunia tidak ikut berbelok. Pemain berjalan lurus.
- Menggeser kamera dengan jari lain saat berjalan tetap memutar arah jalan bersama kamera, seperti sebelumnya.
- Setelah jempol diangkat lalu ditekan lagi, "maju di joystick" berarti maju ke arah layar saat itu. Ini disengaja.
- Perubahan ada di `src/camera/ThirdPersonCamera.ts` (`steeringYaw`) dan `src/core/Game.ts`.

### Hasil tes
| Pemeriksaan | Sebelum | Sesudah |
|---|---|---|
| Jempol miring 5 detik, kelurusan jalur | Melingkar, radius sekitar 5 m | Lurus (1,00) |
| Arah jalan berubah | Terus berputar | 0,00 rad |
| Tombol D ditahan 5 detik di PC | Melingkar | Lurus (1,00) |
| Geser kamera sambil jalan | Berfungsi | Berfungsi, arah ikut berputar |
| Angkat dan tekan ulang joystick | Berfungsi | Berjalan ke arah kamera |
| Kamera berhenti berputar setelah di belakang pemain | Tidak pernah berhenti | Berhenti dalam sekitar 4 sampai 5 detik |

Smoke test: 76 pemeriksaan lulus, diulang 5 kali berturut-turut, 0 error console.

### Catatan tes
- Satu pemeriksaan diagonal kanan-bawah sempat gagal sesekali karena dimulai dari posisi sisa tes sebelumnya dan menabrak kotak. Pemeriksaan itu sekarang berjalan di halaman sendiri dari titik awal dengan jalur kosong.
- `qa-tester` menemukan kegagalan sesekali itu pada run ke-2 dari 3.

### Yang perlu dicoba di iPhone
- Berjalan dengan jempol miring 10 detik atau lebih. Jalur harus lurus dan kamera menyusul ke belakang.
- Kamera butuh sekitar 4 sampai 5 detik untuk berhenti di belakang pemain. Kalau terasa lambat, angka `followGain` di `CameraConfig` bisa dinaikkan.
- Pagar tepi dunia (30 m dari titik awal) menahan gerak, dan kecepatan turun saat menyusuri pagar. Belum diubah.

## Untuk dicoba besok pagi
1. **Merge PR, tunggu deploy sekitar 2 menit, lalu buka https://arsenick04.github.io/superglen/ di Safari iPhone posisi landscape.** Layar logo muncul, ketuk untuk mulai. Kalau tampilan lama masih muncul, tutup tab dan buka lagi.
2. **Biarkan anak mencoba melompat**: tombol kuning untuk lompat. Ketuk tombol bintang di kanan atas untuk jadi Superglen, lalu lompat dua kali untuk berputar di udara. Jalan lurus ke depan untuk menemukan deretan tiang, lalu coba naik ke atasnya.
3. **Perhatikan dan catat**: angka FPS di kiri atas (iPhone dan PC), apakah lompat terasa enak, dan apakah mendarat di atas tiang terlalu sulit.

**Fase A selesai.** Ini checkpoint: mohon dimainkan bersama anak sebelum lanjut ke Fase B (paket B1: Bab 1).
