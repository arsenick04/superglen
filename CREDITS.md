# Kredit

## Suara (voices)
Suara cerita dan soal dibuat dengan ElevenLabs (model `eleven_v4`, tag emosi seperti [excited]) lewat langganan pemilik proyek; nada Glen dan Nino dinaikkan di pascaproduksi (ffmpeg rubberband). Suara sementara; akan diganti rekaman keluarga bila ada. Pengaturan: `audio/voices.json`. Semua suara dari ElevenLabs Voice Library (dipakai lewat langganan berbayar), ditambahkan ke akun pemilik proyek 2026-11-14:

| Peran | Suara | ID | Catatan |
|---|---|---|---|
| Glen | Dakocan - Expressive, Cheerful and Clear | `plgKUYgnlZ1DCNh54DwJ` | Indonesia, aksen standar, nada +3 semiton |
| Nino | Pratama - Clear, Confident and Warm | `q8qwd1jY2jS3AWOBeq25` | Indonesia, aksen standar, nada +2 semiton |
| Kata bahasa Inggris | Josh - Teacher for Kids | `nzFihrBIvB34imQBuxub` | Inggris Amerika |
| Kata Mandarin | Sage - Soothing & Gentle | `APSIkVZudNbPAwyPoeVO` | Mandarin standar (dipilih pemilik proyek) |

## Musik
Soundtrack milik pemilik proyek (diisi setelah file diunggah ke `public/audio/music/`).

| Adegan | File | Pencipta | Lisensi |
|---|---|---|---|
| | | | |

## Suara hewan (domain publik / CC0)

Semua diambil dari Wikimedia Commons, hanya berlisensi CC0 atau Domain Publik (diperiksa dari metadata halaman file: LicenseShortName, License, UsageTerms, Copyrighted, AttributionRequired). Tidak ada kewajiban atribusi; pencipta tetap dicatat sebagai tanda terima kasih. Diakses 2026-11-13. Semua dipotong 1.5 sampai 3 detik, fade in 20 ms, fade keluar, mono 44.1 kHz, loudness sekitar -16 LUFS (singa -18 LUFS), MP3 96 kbps.

| Hewan | File di game | Halaman file Commons | Pencipta | Lisensi | Diubah |
|---|---|---|---|---|---|
| kucing | sfx_hewan_kucing.mp3 | https://commons.wikimedia.org/wiki/File:GettingOutImpatient.ogg | Heismark | Domain Publik (pd) | dipotong 6.35 s sampai 8.65 s, dinormalkan |
| ayam | sfx_hewan_ayam.mp3 | https://commons.wikimedia.org/wiki/File:Medium_rooster_crowing.ogg | alys (PDSounds) | Domain Publik (pd) | dipotong 2.9 s sampai 5.0 s, diturunkan volumenya, dinormalkan |
| kuda | sfx_hewan_kuda.mp3 | https://commons.wikimedia.org/wiki/File:Wiehern.ogg | Hü | Domain Publik (pd) | dipotong 0.05 s sampai 2.27 s, dinaikkan volumenya, dinormalkan |
| singa | sfx_hewan_singa.mp3 | https://commons.wikimedia.org/wiki/File:Lion_raring-sound1TamilNadu178.ogg | த*உழவன் (Tamil Nadu, singa di kebun binatang) | Domain Publik (pd) | dipotong 0.42 s sampai 2.42 s, fade keluar 300 ms, 2 dB lebih pelan, dinormalkan |
| anjing | sfx_hewan_anjing.mp3 | ElevenLabs Sound Effects API | ElevenLabs (prompt: "A friendly medium-sized dog barking twice, clear, close microphone, no background noise", 2.5 s, prompt_influence 0.6, 2026-11-13, dipilih take 1 dari 2) | dibuat dengan ElevenLabs Sound Effects (langganan pemilik proyek), bukan rekaman | diolah: mono 44.1 kHz, dipangkas, fade, sekitar -16 LUFS |
| sapi | sfx_hewan_sapi.mp3 | ElevenLabs Sound Effects API | ElevenLabs (prompt: "A single cow mooing, clear, close, calm farm, no background noise", 2.5 s, prompt_influence 0.6, 2026-11-13, dipilih take 1 dari 2) | dibuat dengan ElevenLabs Sound Effects (langganan pemilik proyek), bukan rekaman | diolah: mono 44.1 kHz, dipangkas, fade, sekitar -16 LUFS |
| bebek | sfx_hewan_bebek.mp3 | ElevenLabs Sound Effects API | ElevenLabs (prompt: "A duck quacking three times, clear, close, no background noise", 2.5 s, prompt_influence 0.6, 2026-11-13, dipilih take 2 dari 2) | dibuat dengan ElevenLabs Sound Effects (langganan pemilik proyek), bukan rekaman | diolah: mono 44.1 kHz, dipangkas, fade, sekitar -16 LUFS |

Catatan: akses ke commons.wikimedia.org dan upload.wikimedia.org terbuka (dengan pembatasan laju yang ketat). Host sumber lain (bigsoundbank.com, freesound.org, pixabay.com, archive.org) belum dicoba dan sebelumnya diblokir proxy.

## Model 3D (Tripo, CC BY)
Diisi di Fase C.

## Musik

| Lagu | File | Sumber | Dipakai di |
|---|---|---|---|
| Superglen Theme Song (instrumental) | `public/audio/music/superglen_theme.mp3` | Milik pemilik proyek | layar awal, menjelajah (Chapter 1), latihan (Chapter 2) |
| Superglen Theme Song, versi adegan (`theme_awal`, `theme_jelajah`, `theme_latihan`, `theme_berubah`) | `public/audio/music/theme_*.mp3` | Dipotong dari Superglen Theme Song (milik pemilik proyek) | layar awal, menjelajah, latihan/pertarungan, berubah |
