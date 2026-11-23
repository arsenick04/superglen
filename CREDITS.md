# Kredit

## Suara (voices)
Suara cerita dan soal dibuat dengan ElevenLabs (model `eleven_v4`, tag emosi seperti [excited]) lewat langganan pemilik proyek; nada Nino dinaikkan dan nada Glen dinaikkan 2 semiton di pascaproduksi (ffmpeg rubberband). Per 2026-11-15: 520 klip ucapan (200 soal quiz di 5 kategori x 60 soal minus soal lama sudah termasuk, kata Inggris/Mandarin, 16 variasi pujian/coba lagi/semangat Nino). Suara sementara; akan diganti rekaman keluarga bila ada. Pengaturan: `audio/voices.json`. Semua suara dari ElevenLabs Voice Library (dipakai lewat langganan berbayar), ditambahkan ke akun pemilik proyek 2026-11-14:

| Peran | Suara | ID | Catatan |
|---|---|---|---|
| Glen | Finn - Expressive & Ads Indonesian | `zmTMXWr9TzPTCLvo0Uqr` | Indonesia, laki-laki muda ekspresif, nada +2 semiton |
| Nino | Pratama - Clear, Confident and Warm | `q8qwd1jY2jS3AWOBeq25` | Indonesia, aksen standar, nada +2 semiton |
| Bu Sari (warga kota) | Serena - Heartfelt Indonesian Voice | `fpsPI3vlnQ0anCTPiHk5` | Indonesia, perempuan paruh baya, lembut |
| Pak Joko | Mazlan - Warm, Neutral and Clear | `GcHP6UfXX0zaHYu0b0ut` | Indonesia, laki-laki tua, hangat |
| Kak Dimas | Rafiq - Upbeat | `xlBOShi2835jfBgaEld4` | Indonesia, laki-laki muda, ceria |
| Pak Guru | Ghaisan - Warm, Engaging and Clear | `vLsH4ENK3zGpAuW1lSh4` | Indonesia, laki-laki paruh baya, jelas |
| Mbak Lala | Defasyalala - Warm, Expressive and Clear | `JaUVfDrFcfwGIsv8X2kN` | Indonesia, perempuan muda, bersemangat |
| Pak Pos | Angga - Authentic Indonesian | `Aw7qttNp8aSAczVs9nwb` | Indonesia, laki-laki muda, santai |
| Dokter Ani | Citra - Gentle, Inviting and Calm | `RbNgJzKAV7jpYJNtCBpj` | Indonesia, perempuan muda, lembut |
| Kak Bima | Aldo - Youth, Friendly, Natural | `H7dnu83omjrDrtfihMsb` | Indonesia, laki-laki muda, ceria |
| Bu Lina (penjual kue pasar) | Maya - Warm, Calm and Soft | `U3dExJoUNcmTY5H6GMuG` | Indonesia, perempuan paruh baya, hangat |
| Gorilla Gembira (Bab 8) | Bagas - Deep & Relaxed | `aJiaMo73BheNakP6EPev` | Indonesia, laki-laki, dalam dan lembut, nada -2 semiton (Voice Library, ditambahkan ke akun 2026-11-22) |
| Si Tikus Rakus | Clowny - Funny and Cheerful | `UafGxvF2q1XMC9Qy4tPR` | Indonesia, laki-laki muda bernada tinggi jenaka, nada +3 semiton |
| Ular Melar | Ami - Expressive, Friendly and Clear | `oEOMTAySmTfDmVF6zZ2i` | Indonesia, perempuan muda ramah dan ekspresif, nada -1 semiton, desisan lewat teks penyampaian |
| Warga / kerumunan (Bab 6, "Hore!") | Defasyalala - Warm, Expressive and Clear (suara Mbak Lala) | `JaUVfDrFcfwGIsv8X2kN` | Indonesia, perempuan muda, bersemangat |
| Aara (Chapter 4) | Kak Ceria - Cute Kids Storyteller | `d15jrIAARvF899pDoC6T` | Indonesia, perempuan muda/anak, ceria |
| Kata bahasa Inggris | Josh - Teacher for Kids | `nzFihrBIvB34imQBuxub` | Inggris Amerika |
| Kata Mandarin | Sage - Soothing & Gentle | `APSIkVZudNbPAwyPoeVO` | Mandarin standar (dipilih pemilik proyek) |

## Musik
Soundtrack milik pemilik proyek (diisi setelah file diunggah ke `public/audio/music/`).

| Adegan | File | Pencipta | Lisensi |
|---|---|---|---|
| Musik latar (awal, menjelajah, latihan, pertarungan) | `ringan_a.mp3`, `ringan_b.mp3`, `battle_a.mp3`, `battle_b.mp3` (pertarungan) | Musik orisinal dibuat dengan skrip untuk proyek ini (`scripts/make-music.py`, sintesis numpy/scipy), tanpa sampel pihak lain | milik proyek |
| Berubah jadi Superglen | `theme_berubah_tagline.mp3`, `theme_berubah.mp3`, `superglen_theme*.mp3` | lagu tema Superglen milik pemilik proyek (dibuat dengan Suno) | milik pemilik proyek |

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
Diisi di Fase C. Model musuh (Curut Cemberut, Ular Melar, Tikus Rakus, Elang Belang, Gorilla Gembira): buatan pemilik proyek (Tripo), tanpa rig, `art/models/source/enemies/`, dioptimalkan ke `public/models/enemies/` oleh `npm run models`; animasi lewat kode.

## Musik

| Lagu | File | Sumber | Dipakai di |
|---|---|---|---|
| Superglen Theme Song (instrumental) | `public/audio/music/superglen_theme.mp3` | Milik pemilik proyek | layar awal, menjelajah (Chapter 1), latihan (Chapter 2) |
| Superglen Theme Song, versi adegan (`theme_awal`, `theme_jelajah`, `theme_latihan`, `theme_berubah`) | `public/audio/music/theme_*.mp3` | Dipotong dari Superglen Theme Song (milik pemilik proyek) | layar awal, menjelajah, latihan/pertarungan, berubah |
| Superglen Theme Song (vokal), milik pemilik proyek; potongan tagline | `public/audio/music/superglen_theme_vocal.mp3`, `theme_berubah_tagline.mp3` | Milik pemilik proyek | berubah jadi Superglen ("sistem aktif, Superglen siap!") |

## Lingkungan kota (public/env/env.glb, CC0)
Dibuat dengan `npm run env-assets` (scripts/build-env-assets.mjs); daftar lengkap di `public/env/manifest.json`.
- Bangku kayu: "Painted Wooden Bench" oleh Kirill Sannikov, Poly Haven (https://polyhaven.com/a/painted_wooden_bench), CC0 1.0. Tekstur dipanggang ke warna verteks, disederhanakan.
- Pohon bulat, pohon cemara, lampu jalan, mobil: dibuat oleh proyek Superglen (geometri prosedural), CC0 1.0.

## Kota: Kenney, gedung pemilik proyek, langit (L18)
Dibuat dengan `npm run env-assets` (scripts/build-env-assets.mjs + scripts/env-kenney.mjs).
- Model kota dari Kenney (https://kenney.nl), lisensi CC0 1.0 (Creative Commons Zero), file asli di `art/kenney/*.zip` (masing-masing dengan License.txt): City Kit (Suburban) 2.0 (rumah), City Kit (Commercial) 2.1 (ruko, kios, menara), City Kit (Roads) (lampu jalan), Car Kit (mobil), Nature Kit (pohon, semak, bunga, batu). Warna palet dipanggang ke warna verteks; daftar model di `public/env/kenney.json`. Terima kasih, Kenney!
- Gedung khusus (gedung tua Barongsai, sekolah, pasar, gudang, bank, rumah sakit, rumah Glen): milik pemilik proyek (Higgsfield + Tripo), `art/models/buildings/`, dioptimalkan ke `public/env/buildings/`.
- Langit dan cahaya: "Kloofendal 48d Partly Cloudy (Pure Sky)" oleh Greg Zaal, Poly Haven (https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky), CC0 1.0. `public/env/sky/`.

# Contoh hutan Quaternius (22 November 2026)

Model `NormalTree_1`, `PineTree_2`, `Bush`, dan `Rock_1` serta teksturnya berasal dari Quaternius Ultimate Stylized Nature, melalui https://github.com/walterpalladino/godot-quaternius-ultimate-stylized-nature . Salinan lisensi MIT yang disertakan repositori sumber ada di `public/env/quaternius/LICENSE.txt` (copyright Walter H. Palladino untuk distribusi Godot). Pembuat aset: Quaternius, https://quaternius.com . Model dikonversi dari FBX ke GLB dan tekstur diperkecil menjadi WebP 512 px. Contoh ditaruh di belakang area awal latihan hutan; belum mengganti seluruh pepohonan kota.

# Monyet penyelamatan hutan

"monkey" oleh **Poly by Google**, lisensi **CC BY 3.0**: https://creativecommons.org/licenses/by/3.0/ . Halaman sumber: https://poly.pizza/m/0yRz2AkLuuo . File FBX beranimasi dan tekstur diperoleh melalui https://github.com/Digx7/Thrust-Pets-Offline/tree/main/Assets/Art/3D/monkey (Credit.txt sumber disalin ke public/models/rescue/CREDIT.txt). Perubahan Superglen: konversi FBX ke GLB, pemilihan animasi run untuk gerakan panik, tekstur WebP 512 px, normalisasi ukuran saat dimuat. Tidak ada hubungan dukungan dari pembuat aset.

## Suara pemilik proyek (Daddy)
Pesan penutup `credit_daddy_1..3.mp3` adalah rekaman suara asli pemilik proyek (bukan ElevenLabs, tanpa kredit TTS); hanya dibersihkan dengan ffmpeg. Asli: `audio/recorded-originals/daddy/Daddy.m4a`.

## Musik kredit akhir
`public/audio/music/credits.mp3` adalah lagu karya pemilik proyek sendiri (bagian piano/instrumental saja, tanpa vokal; dipotong, disambung, dinormalisasi dengan ffmpeg). Tanpa lisensi pihak ketiga.
