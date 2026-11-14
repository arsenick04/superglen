# Musik Superglen

Semua versi dipotong dari `public/audio/music/superglen_theme.mp3` (instrumental, 85,4 dtk, 90 BPM, 4/4, 1 bar = 2,667 dtk, bar 0 mulai di 0,36 dtk). Pemotongan dilakukan otomatis dari analisis tempo dan energi (tanpa didengar manusia), jadi mohon didengarkan dan dikoreksi bila perlu.

| Adegan | File | Bagian lagu asli | Bar | Durasi | Catatan |
|---|---|---|---|---|---|
| Layar awal | `theme_awal.mp3` | 3,03 - 35,03 dtk | bar 1-12 | 32,0 dtk | tema pembuka yang ceria, loop |
| Menjelajah (Bab 1) | `theme_jelajah.mp3` | 48,36 - 80,36 dtk | bar 18-29 | 32,0 dtk | bagian tengah yang lebih rata (sedikit melodi sibuk), volume 0,8 |
| Latihan (Bab 2) | `theme_latihan.mp3` | 37,69 - 59,03 dtk | bar 14-21 | 21,3 dtk | tanjakan lalu bagian keras, loop |
| Berubah jadi Superglen | `theme_berubah.mp3` | 37,69 - 41,69 dtk | bar 14 sampai 1,5 | 4,0 dtk | tanjakan ke bagian keras, fade-out 0,7 dtk, tidak berulang |
| Pertarungan | `theme_latihan.mp3` | sama dengan latihan | - | - | belum ada bagian berbeda, memakai berkas latihan |

Semua berkas: MP3 44,1 kHz stereo 128 kbps, sekitar -18 LUFS, puncak di bawah -6 dBFS. Loop dipotong pada bar dan titik nol, lalu ujung loop disambung dengan 10 ms crossfade sama-daya (kepala loop dicampur dengan lanjutan alami setelah titik potong).

## Cara mengganti
1. Ubah `public/audio/music/tracks.json` (nilai teks, atau `{ "file": "...", "volume": 0..1 }`).
2. Untuk memotong ulang: loop harus kelipatan bar (1 bar = 2,667 dtk), mulai di `0,36 + 2,667 x nomor_bar`. Ekspor 44,1 kHz stereo, normalisasi ke -18 LUFS dengan ffmpeg (`ebur128`, lalu `volume`), enkode `libmp3lame -b:a 128k`.
3. Jalankan `npm run build`.
