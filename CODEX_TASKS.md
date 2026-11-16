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
