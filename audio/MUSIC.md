# Musik Superglen

## Musik latar sekarang (2026-11-14): "ringan", buatan skrip
Pemilik proyek merasa potongan lagu tema terlalu mengganggu, jadi musik latar diganti dengan lagu pendek yang ringan, lucu, tanpa drum atau perkusi, berulang tanpa henti. Dibuat sendiri oleh `scripts/make-music.py` (Python, numpy/scipy, deterministik; ffmpeg untuk MP3). Jalankan ulang: `python3 scripts/make-music.py --check`.

| Varian | File | Suasana | Tempo | Durasi | Alat |
|---|---|---|---|---|---|
| A (dipakai) | `ringan_a.mp3` | marimba melompat-lompat, pentatonik C mayor | 104 BPM | 36,9 dtk (16 bar) | marimba, bas petik lembut |
| B (cadangan) | `ringan_b.mp3` | lebih tenang, kotak musik + petikan pizzicato | 100 BPM | 38,4 dtk (16 bar) | kotak musik, pizzicato |

Sekitar -20 LUFS (lebih pelan dari tema lama, -18), puncak sampel di bawah -8 dBFS, MP3 44,1 kHz stereo 112 kbps, sekitar 0,5 MB. Loop dirender dalam penyangga melingkar (ekor nada, gema, dan filter menyambung ke awal) sehingga sambungan akhir-awal tanpa letupan. Catatan: pemutar MP3 browser kadang menyisakan celah sangat kecil saat mengulang.

`tracks.json`: `awal`, `jelajah`, `latihan` memakai A volume 0,6, `pertarungan` A volume 0,7, `berubah` tetap `theme_berubah_tagline.mp3` (tagline dari lagu tema). Untuk mencoba varian B, ganti `ringan_a.mp3` menjadi `ringan_b.mp3` di `tracks.json`.

## Riwayat: potongan lagu tema (tidak dipakai lagi)
Potongan `theme_awal.mp3`, `theme_jelajah.mp3`, `theme_latihan.mp3` sudah dihapus dari folder (supaya folder di bawah 6 MB); bisa dibuat ulang dari `superglen_theme.mp3` dengan cara di bawah. Yang masih ada: `superglen_theme.mp3`, `superglen_theme_vocal.mp3`, `theme_berubah.mp3`, `theme_berubah_tagline.mp3`.

Semua versi tema dipotong dari `public/audio/music/superglen_theme.mp3` (instrumental, 85,4 dtk, 90 BPM, 4/4, 1 bar = 2,667 dtk, bar 0 mulai di 0,36 dtk). Pemotongan dilakukan otomatis dari analisis tempo dan energi (tanpa didengar manusia), jadi mohon didengarkan dan dikoreksi bila perlu.

| Adegan | File | Bagian lagu asli | Bar | Durasi | Catatan |
|---|---|---|---|---|---|
| Layar awal | `theme_awal.mp3` | 3,03 - 35,03 dtk | bar 1-12 | 32,0 dtk | tema pembuka yang ceria, loop |
| Menjelajah (Bab 1) | `theme_jelajah.mp3` | 48,36 - 80,36 dtk | bar 18-29 | 32,0 dtk | bagian tengah yang lebih rata (sedikit melodi sibuk), volume 0,8 |
| Latihan (Bab 2) | `theme_latihan.mp3` | 37,69 - 59,03 dtk | bar 14-21 | 21,3 dtk | tanjakan lalu bagian keras, loop |
| Berubah jadi Superglen | `theme_berubah_tagline.mp3` | versi VOKAL, 70,25 - 75,10 dtk | - | 4,88 dtk | tagline akhir lagu "sistem aktif, Superglen siap!" (kata 70,49 - 73,33 dtk), fade-in 8 ms, fade-out 0,6 dtk, -16 LUFS, tidak berulang. Alternatif instrumental: `theme_berubah.mp3` (37,69 - 41,69 dtk, masih ada di folder, ganti lewat `tracks.json`) |
| Pertarungan | `theme_latihan.mp3` | sama dengan latihan | - | - | belum ada bagian berbeda, memakai berkas latihan |

Semua berkas: MP3 44,1 kHz stereo 128 kbps, sekitar -18 LUFS, puncak di bawah -6 dBFS. Loop dipotong pada bar dan titik nol, lalu ujung loop disambung dengan 10 ms crossfade sama-daya (kepala loop dicampur dengan lanjutan alami setelah titik potong).

## Cara mengganti
1. Ubah `public/audio/music/tracks.json` (nilai teks, atau `{ "file": "...", "volume": 0..1 }`).
2. Untuk memotong ulang: loop harus kelipatan bar (1 bar = 2,667 dtk), mulai di `0,36 + 2,667 x nomor_bar`. Ekspor 44,1 kHz stereo, normalisasi ke -18 LUFS dengan ffmpeg (`ebur128`, lalu `volume`), enkode `libmp3lame -b:a 128k`.
3. Jalankan `npm run build`.

## Versi vokal dan tagline
`superglen_theme_vocal.mp3` adalah versi vokal dari pemilik proyek (85,87 dtk, 48 kHz stereo, dibuat dengan Suno). Pemotongan tagline (`theme_berubah_tagline.mp3`) memakai transkrip ElevenLabs Scribe per kata: "Sistematik [=sistem aktif] Super Glenn, siap!" pada 70,49 - 73,33 dtk. Setelah itu lagu masih lanjut dengan "Super Glenn!" (77,81 - 79,13 dtk) sampai habis di 84,2 dtk. Potongan dimulai 0,24 dtk sebelum kata pertama (di jeda kecil) dan berakhir 1,8 dtk setelah "siap!" pada jeda sebelum ketukan berikut. Ketepatan irama (90 BPM) pada versi vokal belum terbukti: durasinya 85,87 dtk dibanding 85,4 dtk instrumental, jadi jalur waktu bisa bergeser; loop lain tetap dari versi instrumental. Mohon didengarkan.
