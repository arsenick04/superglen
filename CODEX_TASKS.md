# Antrean tugas Codex

Claude menulis instruksi lengkap tiap tugas saat gilirannya; pemilik proyek menempelnya ke Codex (repo `arsenick04/superglen`, branch `main`); Codex membuka PR; Claude memeriksa dan merge. Aturan untuk Codex: `AGENTS.md`.

## Tim (peran → tingkat model di Codex)

Nama model di Codex berubah-ubah; pakai tingkatnya. Pemilik proyek memilih model dan tingkat penalaran (reasoning) di pemilih model Codex saat menempel tugas.

| Peran | Model di Codex | Penalaran | Dipakai untuk |
|---|---|---|---|
| Arsitek | model koding terkuat | tinggi | sistem rumit: kinerja grafik, kamera, bos baru, perubahan lintas banyak file |
| Pengembang | model koding standar | sedang | sebagian besar tugas: chapter, UI, perbaikan bug, pemasangan model |
| Konten | model kecil/cepat | rendah | soal kuis JSON, teks dialog, dokumen |
| Penguji | model standar | rendah-sedang | menjalankan tes, melaporkan angka, tanpa mengubah kode game |

Aturan: paling banyak 2 tugas berjalan bersamaan, dan hanya bila daftar filenya tidak beririsan. Setiap instruksi menyebut perannya di baris pertama.

## Antrean

| No | Peran | Tugas | Status |
|---|---|---|---|
| C1 | Arsitek | Hemat grafik: ukur lalu turunkan beban (LOD model tokoh/musuh/gedung, gabung draw call, bayangan), tetapkan batas baru yang masuk akal | menunggu main |
| C2 | Pengembang | Rapikan 7 gedung pemilik: pijakan panjat menempel rapi, atap sesuai collider, pintu gedung Barongsai lurus dengan pintu game, lubang wajah singa | menunggu C1 |
| C3 | Pengembang | Selesaikan kota: ubin jalan Kenney, alas menara, tanah dan bukit jauh | boleh paralel dengan C2 bila file berbeda |
| C4 | Penguji | Jalankan seluruh smoke test per grup pada tampilan baru, laporkan yang gagal | setelah C1-C3 |
| C5 | Arsitek | Chapter 7: Elang Belang (bulu es dan bulu api, pertarungan udara) | |
| C6 | Pengembang | Chapter 8: Gorilla Gembira (ditolong, bukan dilawan) | |
| C7 | Pengembang | Penutup: pesta kota + pancingan Sosok Misterius | |
| C8 | Pengembang | Pemutar sinematik (video dari pemilik proyek, bisa dilewati) | menunggu video |
| C9 | Konten | Tambahan soal kuis dan perbaikan teks | kapan saja |
