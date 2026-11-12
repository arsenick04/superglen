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

## Perbaikan tampilan dari uji iPhone (12 November 2026): selesai

### Masalah yang dilaporkan
1. Logo di layar awal terlihat terpotong kiri dan kanan, dan latarnya hitam.
2. Setelah berubah jadi Superglen, tombol bintang menumpuk dengan tombol perisai di iPhone.

### Penyebab
1. Pudar tepi dipasang pada elemen selebar layar, bukan pada gambarnya. Gambar logo aslinya juga berlatar hitam.
2. Bilah Safari di atas membuat area game hanya sekitar 281 pt tinggi. Tata letak hanya dites di tinggi 390 pt ke atas.

### Perbaikan
- **Logo transparan**: latar hitam dibuang, aura emas di sekelilingnya dipertahankan sebagai halo lembut. Master di `art/logo/superglen_logo_alpha.png`, versi web 203 KB di `public/img/logo.webp`. Asli berlatar hitam tetap ada di `art/logo/superglen_logo.png`.
- **Layar awal ceria**: gradien langit, sinar matahari berputar pelan, awan melayang, bintang berkilau, bukit hijau. Semuanya CSS, tanpa gambar tambahan, dan animasi mati saat pengaturan "kurangi gerakan" aktif.
- **Tata letak tombol mengikuti tinggi layar**: di bawah 360 pt, tombol Lompat, Laser, dan Perisai berderet melengkung di kanan bawah, dan tombol bintang sendirian di kanan atas. Tombol selalu minimal 80 px dan tidak masuk ke area joystick. Hit test memilih tombol dengan pusat terdekat.

### Hasil tes
- Smoke test 175 pemeriksaan per run, lulus 3 kali berturut-turut oleh `qa-tester`, 0 error console.
- Tata letak dites di 8 ukuran: 844x281, 844x250, 844x330, 667x250, 568x320, 932x300, 1024x768, 1366x1024, masing-masing mode Glen dan Superglen. Tidak ada yang tumpang tindih atau terpotong.
- Layar awal dites di 844x281, 844x250, 667x250, dan 1280x720: logo dan tombol mulai tidak saling menutupi, latar terang.

### Yang hanya bisa dinilai di iPhone asli
- Animasi layar awal: ada satu lapisan sinar besar yang berputar. Kalau terasa tersendat saat game dimuat, hapus animasi sinar lebih dulu.
- Area aman di sisi poni layar. Di tes headless nilainya 0.
- Kenyamanan jari pada susunan tombol melengkung di layar pendek.
- Di layar setinggi 250 pt logo menjadi kecil karena tombol mulai memakai sepertiga tinggi layar.

### Catatan
- Tes gerak melingkar dari PR sebelumnya (PR #4) sudah digabung di branch ini.
- Tombol Laser dan Perisai belum berfungsi. Itu paket B2.

### Kredit terpakai
Higgsfield: 0. ElevenLabs: 0.

## Paket malam B1 (12 November 2026): selesai

### Yang selesai
- **Bab 1: Komputer Kuno Barongsai** bisa dimainkan dari gerbang sekolah sampai bintang "Bab 1 selesai":
  1. Jalan kota sepulang sekolah, dengan tutorial lompat melewati palang rendah. Kalau anak belum berhasil dalam 20 detik, muncul papan miring di samping supaya bisa lewat.
  2. Gedung Barongsai tua merah-emas di ujung jalan, masuk lewat celah pagar.
  3. Lorong redup dengan senter, lampion, dan panel sirkuit yang membuka dinding.
  4. Lab dengan komputer berbentuk kepala Barongsai dan tombol besar.
  5. Nino muncul, kostum keluar, Glen berubah jadi Superglen, lalu penutup lucu saat semua fitur kostum menyala.
- **Penunjuk tanpa teks**: sinar emas menandai tujuan berikutnya, panah di tepi layar kalau tujuan di luar pandangan, ikon melayang di atas benda yang bisa ditekan.
- **Balon dialog** dengan ikon wajah, maju otomatis atau dengan ketukan. 18 kalimat di `audio/dialog.json`, siap diberi suara di paket B4.
- **Progres tersimpan**: pemain yang kembali langsung mulai di lab sebagai Superglen. `?reset=1` mengulang cerita.
- **Tiga tiang latihan** di lab untuk mencoba Lompat Barongsai setelah bab selesai.
- **Kerangka untuk bab berikutnya**: sistem level, interaksi, dialog, penanda tujuan, urutan adegan, dan penyimpanan.
- Level awal sekarang Bab 1. Area uji lama ada di `?level=test`.

### Yang belum (sesuai rencana)
- Suara: semua dialog masih teks. Suara Nino dan Glen di paket B4.
- Laser, Perisai, dan Terbang: terbuka di Bab 2 (paket B2). Setelah Bab 1 hanya Lompat Barongsai yang aktif.
- Model 3D asli: semua masih bentuk sederhana (kapsul dan kotak). Fase C.

### Hasil tes
| Pemeriksaan | Hasil |
|---|---|
| `npm run build` dan `npm run typecheck` | Lulus |
| Smoke test penuh oleh `qa-tester`, 2 kali | Lulus, 0 kegagalan, 0 error console |
| Bab 1 dimainkan otomatis sampai selesai di desktop | Lulus 59 dari 59 |
| Bab 1 di layar sentuh 844x281 | Lulus 53 dari 53, tombol dan balon dialog tidak tumpang tindih |
| Papan bantuan setelah 20 detik | Lulus |
| Kembali ke game dan `?reset=1` | Lulus |
| Pindah level bolak-balik tanpa kebocoran memori | Lulus |

Draw call per area: jalan 44, gedung 29 sampai 43, lorong 41, lab 31 (batas 150). **Fps di perangkat asli belum diukur**; angka headless (10 sampai 60 fps, renderer software) hanya perkiraan.

### Bug yang ditemukan saat review dan sudah diperbaiki
- Setelah level dimuat, Glen berdiri terbenam 0,8 m di bawah tanah sampai ia melompat. Penyebabnya mesin fisika belum mengenal lantai level baru saat pemain ditempatkan. Sekarang pemain selalu diletakkan tepat di permukaan, dan ada tes pencegahnya.

### Masalah yang diketahui
- Tiang latihan di sisi kiri lab kadang menutupi pandangan kamera saat berdiri di dekat kostum.
- Di lorong redup, kapsul Glen terlihat gelap.
- Ikon wajah Glen di balon dialog tetap oranye setelah jadi Superglen.
- Bintang "Bab 1 selesai" dan kilatan transformasi dites secara tidak langsung, belum dilihat di tangkapan layar.
- Jumlah segitiga per frame sekitar 100 sampai 130 ribu. Kalau iPhone terasa berat, ini yang pertama dikurangi.
- Ukuran unduhan sekarang 5,0 MB (1,85 MB terkompresi).
- Smoke test penuh sekarang butuh sekitar 6 menit.

### Yang hanya bisa dinilai di iPhone asli
- Apakah lorong redup cukup terang di layar HP pada siang hari.
- Beban senter dan bayangan matahari terhadap fps.
- Sudut kamera saat adegan Nino muncul.

### Keputusan yang diambil sendiri
- Kata "laboratorium" diganti "ruang rahasia" di dialog Glen karena sulit untuk anak 5 tahun.
- Tiga tiang latihan, bukan empat, dan dipindah ke dinding kiri supaya tidak menghalangi kamera.
- Tutorial lompat diberi papan bantuan supaya anak tidak pernah tersangkut.
- Agen Bab 1 sempat terhenti karena batas pemakaian dan dilanjutkan setelah reset. Tidak ada pekerjaan yang hilang.

### Kredit terpakai
Higgsfield: 0. ElevenLabs: 0.

## Polesan Chapter 1, perbaikan sendatan, dan paket malam B2 (12 November 2026): selesai

### Polesan Chapter 1 (sudah tayang lewat PR #5)
- Tiang latihan dipindah ke sudut belakang kanan lab dan tidak lagi menghalangi kamera.
- Lorong diberi cahaya pengisi tipis; kapsul Glen sekitar 2,5 kali lebih terang.
- Bintang "Chapter 1 selesai!" diperbesar (40% tinggi layar) dan tampil 3,2 detik.
- Tulisan "Bab" di layar diganti "Chapter", dan "laboratorium" diganti "Lab". Nama internal di kode (`bab1`, `bab2`) tetap.

### Perbaikan gerak tersendat tiap beberapa detik
- **Penyebab utama yang ditemukan**: bug di fisika karakter, bukan irama frame. Pengontrol fisika sesekali menghentikan Glen satu langkah, lalu ia butuh sekitar 8 langkah untuk kembali ke kecepatan penuh. Kapsul juga bergetar naik-turun sampai sekitar 22 mm.
- **Sesudah diperbaiki**: getaran di bawah 0,4 mm (diukur ulang oleh orkestrator). Variasi langkah kamera saat jalan lurus turun dari 18 sampai 26% menjadi di bawah 1,3% menurut pengukuran agen.
- **Perbaikan pendukung**: alokasi memori per frame dikurangi (Chapter 1 dari sekitar 38 KB menjadi 9 KB per frame), bayangan dikunci ke grid supaya tidak bergetar, resolusi adaptif dibuat lebih hati-hati, waktu frame diratakan, dan poligon Chapter 1 turun dari sekitar 100 sampai 130 ribu menjadi di bawah 50 ribu per frame.
- Agen menilai keyakinan sekitar 75% bahwa bug fisika itu penyebab utamanya. **Belum bisa dipastikan tanpa iPhone.**
- **Panel diagnosis `?perf=1`** untuk iPhone asli: buka game dengan tambahan `?perf=1`, jalan sekitar 20 detik, ketuk panel di tengah atas supaya grafiknya berhenti, ambil tangkapan layar, kirim.

### Paket B2: tiga skill dan Chapter 2
- **Terbang**: tahan tombol lompat 0,45 detik, naik sampai batas tinggi level, lepas untuk turun pelan, tahan lagi untuk naik lagi. Tanpa bahan bakar.
- **Laser**: bidikan otomatis ke sasaran terdekat dalam 22 m, terhalang dinding, ada penanda bidik di sasaran.
- **Perisai**: kubah emas di depan Superglen, memantulkan bola. Ketukan singkat tetap menangkis.
- **Chapter 2: Latihan Pagi Bersama Nino** di aula latihan:
  1. Percobaan terbang pertama yang lucu (kepala kena atap), lalu terbang melewati 5 cincin cahaya.
  2. Kena 5 sasaran dengan laser. Kalau meleset, Nino bilang "Tenang dulu, baru bidik."
  3. Menangkis 5 bola karet dengan perisai.
  4. Makan bekal bersama Nino.
  5. Alarm berbunyi dan layar menampilkan pasar kota. Bintang "Chapter 2 selesai!".
- **Skill terbuka satu per satu** di stasiunnya dan tersimpan. Tempat untuk menyisipkan Tantangan Pintar (paket B3) sudah ditandai di kode.
- **Tidak ada kegagalan**: meleset atau kena bola tidak mengurangi apa pun. Kalau anak lama tidak maju, cincin turun mendekat, sasaran mendekat dan membesar, dan pelempar bola melambat.
- **Baris kemajuan tanpa teks**: 5 ikon di atas layar yang terisi satu per satu.
- **Alur antar chapter**: setelah Chapter 1, permainan mulai di lab; bicara dengan Nino atau masuk pintu bercahaya untuk mulai Chapter 2. Setelah Chapter 2, permainan mulai di aula dengan semua skill. `?reset=1` mengulang dari awal, `?level=bab2` langsung ke Chapter 2.
- 17 kalimat dialog Chapter 2 di `audio/dialog.json` (total 35).

### Hasil tes
| Pemeriksaan | Hasil |
|---|---|
| `npm run build` dan `npm run typecheck` | Lulus |
| Smoke test penuh oleh `qa-tester` | 657 dari 658; satu skenario (`bab2-flow`) kehabisan waktu tunggu, lulus saat diulang |
| Setelah batas tunggu tes dinaikkan | `bab2-flow` dan `bab1-return` lulus 2 kali; run penuh ulang: lihat catatan di PR |
| Chapter 2 dimainkan otomatis sampai selesai (desktop) | Lulus 90 dari 90 |
| Chapter 2 di layar sentuh 844x281 | Lulus 81 dari 81 |
| Tiga skill di level uji | Lulus 71 dari 71 |
| Error console | 0 di semua skenario |

Kegagalan `bab2-flow` adalah kelemahan tes: ia menunggu 15 detik waktu nyata sementara renderer headless kadang macet. Batasnya sekarang 60 detik. **Fps di perangkat asli belum diukur.**

### Masalah yang diketahui
- Di layar sentuh pendek (281 pt), baris kemajuan turun ke tengah layar saat dialog tampil, dekat karakter.
- Di tangkapan layar stasiun laser hanya satu sasaran yang terlihat dalam bingkai. Tesnya mengenai kelima sasaran, tetapi tampilannya belum dinilai dari sudut pandang pemain.
- Unduhan sekarang 5,1 MB (1,89 MB terkompresi).
- Smoke test penuh sekarang butuh sekitar 10 menit.
- Perubahan pada langkah fisika memakai jalur internal mesin fisika untuk mengurangi alokasi. `?faststep=0` mengembalikan ke cara lama kalau ada masalah.

### Yang hanya bisa dinilai di iPhone asli
- Apakah gerak sudah mulus.
- Kenyamanan menahan tombol lompat untuk terbang.
- Apakah lengkung bola dan aba-aba lemparan terbaca oleh anak 5 tahun.
- Fps di aula dan di Chapter 1.

### Keputusan yang diambil sendiri
- Waktu tahan untuk terbang 0,45 detik, bukan "lebih dari 1 detik" seperti di design doc, karena satu lompatan Superglen hanya sekitar 0,8 detik. Angkanya ada di konfigurasi.
- Skill dibuka oleh cerita, belum oleh Tantangan Pintar. Kuisnya menyusul di B3.
- Berkas cahaya di aula dihapus karena menutupi pandangan.
- Agen sempat terhenti dua kali karena batas pemakaian dan dilanjutkan setelah reset. Tidak ada pekerjaan yang hilang.

### Kredit terpakai
Higgsfield: 0. ElevenLabs: 0.

## Pengingat untuk pemilik proyek

- **Soundtrack Superglen (paket B4):** siapkan file musik Anda. Unggah ke folder `public/audio/music/` di repo lewat GitHub (MP3 atau M4A, tiap lagu di bawah sekitar 3 MB, sebaiknya bisa diulang mulus) dan tentukan lagu mana untuk adegan mana: layar awal, menjelajah, berubah jadi Superglen, pertarungan. Pengingat ini juga tertulis di `CLAUDE.md` supaya muncul di akhir paket B3 dan di awal paket B4.

## Untuk dicoba besok pagi
1. **Merge PR, tunggu deploy sekitar 2 menit, lalu buka https://arsenick04.github.io/superglen/ di Safari iPhone posisi landscape.** Tutup tab lama dulu. Jalan beberapa saat dan rasakan apakah gerak sudah mulus. Kalau masih tersendat, buka dengan `?perf=1`, jalan 20 detik, ketuk panel di tengah atas, dan kirim tangkapan layarnya.
2. **Mainkan Chapter 2 bersama anak**: di lab, dekati Nino dan tekan tombol bicara. Tahan tombol lompat untuk terbang melewati cincin, tekan tombol petir untuk laser, tahan tombol perisai saat bola datang. Perhatikan di mana ia bingung.
3. **Catat**: angka FPS di aula, apakah menahan tombol untuk terbang terasa nyaman, dan apakah bola mudah ditangkis. Untuk mengulang dari awal, tambahkan `?reset=1`.
