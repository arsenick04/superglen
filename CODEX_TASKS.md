# Antrean tugas Codex

Claude menulis instruksi lengkap tiap tugas saat gilirannya; pemilik proyek menempelnya ke Codex (repo `arsenick04/superglen`, branch `main`); Codex membuka PR; Claude memeriksa dan merge. Aturan untuk Codex: `AGENTS.md`.

## Tim (peran → model Codex)

Pilihan di pemilih model Codex (16 November 2026): 6 Astra, 6.1 Sol, 6.1 Terra, 6 Sol, 6 Luna, 5.6 Sol/Terra/Luna. Pemetaan ini berdasarkan ulasan pihak ketiga (belum dicek ke dokumentasi resmi OpenAI): Astra = paling kuat dan paling mahal, 6.1 Sol = andalan harian, 6.1 Terra = cepat dan hemat, Luna = paling ringan.

| Peran | Model | Penalaran | Dipakai untuk |
|---|---|---|---|
| Arsitek | **6.1 Sol** (naik ke **6 Astra** hanya bila Sol gagal 2 kali) | tinggi | kinerja grafik, kamera, bos baru, perubahan lintas banyak file |
| Pengembang | **6.1 Sol** | sedang | chapter, UI, perbaikan bug, pemasangan model |
| Penguji | **6.1 Terra** | rendah-sedang | menjalankan tes, melaporkan angka, tanpa mengubah kode game |
| Konten | **6 Luna** (atau 6.1 Terra bila hasilnya kurang rapi) | rendah | soal kuis JSON, teks dialog, dokumen |

Model 5.6 dan 6 Sol tidak dipakai (generasi lama). Aturan: paling banyak 2 tugas berjalan bersamaan, dan hanya bila daftar filenya tidak beririsan. Setiap instruksi menyebut peran dan modelnya di baris pertama.

## Antrean

| No | Peran | Tugas | Status |
|---|---|---|---|
| C1 | Arsitek (6.1 Sol, tinggi) | Hemat grafik: ukur lalu turunkan beban (LOD model tokoh/musuh/gedung, gabung draw call, bayangan), tetapkan batas baru yang masuk akal | menunggu main |
| C2 | Pengembang | Rapikan 7 gedung pemilik: pijakan panjat menempel rapi, atap sesuai collider, pintu gedung Barongsai lurus dengan pintu game, lubang wajah singa | menunggu C1 |
| C3 | Pengembang | Selesaikan kota: ubin jalan Kenney, alas menara, tanah dan bukit jauh | boleh paralel dengan C2 bila file berbeda |
| C4 | Penguji (6.1 Terra) | Jalankan seluruh smoke test per grup pada tampilan baru, laporkan yang gagal | setelah C1-C3 |
| C5 | Arsitek (6.1 Sol, tinggi) | Chapter 7: Elang Belang (bulu es dan bulu api, pertarungan udara) | |
| C6 | Pengembang | Chapter 8: Gorilla Gembira (ditolong, bukan dilawan) | |
| C7 | Pengembang | Penutup: pesta kota + pancingan Sosok Misterius | |
| C8 | Pengembang | Pemutar sinematik (video dari pemilik proyek, bisa dilewati) | menunggu video |
| C9 | Konten (6 Luna) | Tambahan soal kuis dan perbaikan teks | kapan saja |

## Serah terima dari Claude (16 November 2026) — keadaan `main`

Build, `check:reach`, `check:quiz` lulus. Smoke `kota` lulus. Semua pekerjaan berikut sudah ada di kode tetapi **belum terverifikasi penuh**:

- **Beban grafik terlalu besar (prioritas C1).** Model tokoh penuh (~90k segitiga per tokoh), model musuh penuh, 7 gedung pemilik (~16k per gedung), kota Kenney, bayangan: terukur 314k sampai 1,2 juta segitiga dan sampai 121 draw call di PC. Halaman tes sering crash kehabisan memori (`Target crashed`, contoh: smoke `bab1` di jalan kota). `TRI_MAX` di `scripts/smoke-test.cjs` dinaikkan ke 1.200.000 hanya sebagai penanda sementara, bukan target.
- **Mode pertarungan (L17)** `src/gameplay/BattleMode.ts`, `src/battle.css`, kamera di `src/camera/ThirdPersonCamera.ts`: grup `battle` desktop 54/57 (3 gagal karena anggaran grafik dan satu crash di intro Rakus); `battle-touch` belum diulang setelah perubahan CSS terakhir (sebelumnya spanduk nama menumpuk dengan bintang pada ular).
- **Zoom kamera** `src/ui/ZoomButtons.ts`, `src/zoom.css` (roda mouse, +/-, cubit, tombol sentuh, R3/L3): grup `zoom`, `zoom-touch` belum pernah selesai dijalankan; posisi tombol belum dicek terhadap tombol bintang.
- **Musuh model pemilik (L19)** `src/world/kota/EnemyModels.ts`: grup `combat`, `bab3`, `bab5-fight`, `bab6-fight` belum lulus bersih; cek "tames it, in order" di bab5/bab6 gagal (kemungkinan karena teks dialog yang diubah).
- **Kota Kenney (L18)** `CityModels.ts`, `CityDressing.ts`, `scripts/env-kenney.mjs`: pijakan panjat menonjol dari gedung pemilik, atap gedung pemilik lebih tinggi dari collider, pintu gedung Barongsai belum lurus, lubang di wajah singa, ubin jalan Kenney dan alas menara belum, tanah dan bukit jauh masih polos.
- `hud-layout`, `hud-layout-touch`, `dlg-compact`: hasil terakhir tidak bisa dipercaya (dijalankan sebelum tombol zoom ada, sebagian crash).


## Pembaruan 18 November 2026

- T0 dan C2 sudah pernah di-merge; sebagian status antrean/serah terima 16 November di atas merupakan catatan lama.
- Kamera PR #25 sudah di main: default 2,5 m, battleLook 0, Curut mengikuti Glen.
- Paket stabilisasi setelah kamera: pusatkan HUD bintang battle agar tidak berbagi kolom dengan bubble; cincin arena additive DoubleSide memakai forceSinglePass (menghindari satu submission ekstra secara struktural); setup tes transisi Curut mematikan serangan kota insidental, menyelesaikan dialog dan memeriksa prasyarat tanpa memperpanjang timeout.
- Build, typecheck, check:reach, check:quiz, syntax smoke, dan review silang lulus. Browser/FPS/draw call aktual tidak diuji atas permintaan pemilik; belum diklaim bahwa kegagalan suite sebelumnya sudah hijau. Optimasi kota menyeluruh T2 masih antre.
- Fitur injak-pantul non-bos selesai di cabang `codex/nonboss-head-hop` (PR terpisah): Curut pasar/arena dan pendamping Rakus, satu hit saat turun ke kepala lalu otomatis memantul. Bos tidak berlangganan fitur ini. Probe kontak 8/8, typecheck/build/reach/quiz dan review silang lulus; rasa bermain/posisi kepala belum diuji browser, pemilik menguji manual. Tidak ada dialog/audio baru.

- Koreksi kesulitan Curut dari uji pemilik: arena memakai satu giliran aktif, enam menunggu tersembunyi; jeda 1,2 detik setelah jinak. Curut pendamping Rakus juga maksimal satu. Build/check/probe antrean/review lulus; pengujian browser tetap ditunda. Lihat PROGRESS.md bagian "Curut muncul satu per satu".
- Transisi battle berbasis area selesai di cabang `codex/battle-area-entry`: Pasar memindahkan Glen sebelum Curut kota sempat menyerang; Ular/Rakus masuk mode battle saat area terpicu dan musuh menunggu dialog + intro. Titik kembali Pasar berada di luar batas distrik. Probe non-browser/build/reach/quiz lulus; browser tidak dijalankan atas keputusan pemilik.
- Alur baru dikerjakan per PR kecil: (1) kostum → wajib pulang → pagi berikutnya kembali ke Nino; (2) setelah Ular, perayaan Nino/Glen/Aara → pulang → latihan lompat Barongsai tiga tingkat; (3) Tikus Rakus baru sesudah latihan. Arena khusus/ring, penghapusan Curut pendamping Rakus, dan umpan balik injak Curut adalah PR terpisah.
- PR alur Ular aktif di cabang `codex/snake-lab-celebration`: `snake_lab` → perayaan bertiga di Lab → `snake_home` → `snake_return`. Chapter 6 ditahan sampai PR latihan Barongsai berikutnya; build/probe/review lulus, browser ditunda.

### Kalimat baru untuk disuarakan

- `bab1_nino_pulang_dulu` (Nino): “Sekarang pulang dulu ke rumah. Istirahat yang cukup, lalu kembali besok pagi!” — klip belum dibuat; teks tampil sebagai fallback.
- `bab5_nino_panggil_lab`, `bab5_glen_rayakan`, `bab5_aara_rayakan`, `bab5_nino_pulang`, `bab5_nino_latihan_besok` — dialog checkpoint Ular/Lab/latihan; klip belum dibuat, teks fallback.
