# Audio Superglen

Suara dibuat sekali saat pengembangan dengan ElevenLabs, disimpan di `public/audio/{id}.mp3`, dan dicatat di `audio/manifest.json`.

## Kunci API
Simpan di file `.env` di akar proyek (sudah ada di `.gitignore`, jangan pernah di-commit):

    ELEVENLABS_API_KEY=isi_kunci_di_sini

Kunci tidak pernah dicetak atau dimasukkan ke kode game. Di mesin yang memakai proxy (HTTPS_PROXY) skrip otomatis ikut proxy.

## Perintah
- `npm run audio -- --dry-run` : tampilkan rencana (jumlah baris, karakter, porsi kuota) tanpa memakai kredit. Juga menulis `audio/lines.generated.json`, daftar semua kalimat yang akan diucapkan.
- `npm run audio -- --sample` : tepat satu baris per kategori (yang terpendek).
- `npm run audio -- --category=bab1,quiz_hitung` : kategori tertentu. Pilihan: bab1, bab2, quiz_nino, quiz_hitung, quiz_inggris, quiz_mandarin, quiz_hewan, quiz_baca, speak_en, speak_zh.
- `npm run audio -- --limit=10` : paling banyak 10 file.
- `npm run audio -- --only=bab1_glen_pulang` : hanya id itu (dibuat ulang walau sudah ada).
- `npm run audio -- --force` : buat ulang semuanya (boros kredit).
- `npm run audio` : semua yang belum ada atau berubah. **Perlu persetujuan pemilik proyek** (memakai kuota).
- `npm run audio:voices` : (lama, tidak dipakai lagi untuk v2) pilih suara otomatis per peran dan tulis ke `audio/voices.json` (tambah `--dry-run` untuk hanya melihat usulan).

File yang sudah ada dilewati. Teks atau suara yang berubah terdeteksi lewat hash di manifest dan dibuat ulang otomatis.

## Mengganti satu kalimat dengan rekaman keluarga
1. Simpan rekaman sebagai `public/audio/<id>.mp3`.
2. Beri tanda di `audio/dialog.json` pada kalimat itu: `"source": "recorded"` (untuk soal quiz, di `audio/manifest.json`: `"<id>": { "source": "recorded" }`).
3. Skrip tidak akan menimpa kalimat itu. MP3 yang tidak ada di manifest juga dianggap buatan tangan dan tidak ditimpa (kecuali `--force`).

## Suara dan model (v2, 2026-11-14)
Model: `eleven_v4` (paling ekspresif yang tersedia di paket ini, 1 karakter = 1 kredit; mendukung tag emosi dan bahasa Indonesia/Mandarin/Inggris). Tag seperti `[excited]`, `[laughs]` dibaca sebagai arahan, bukan diucapkan (diperiksa dengan speech-to-text). Tag dihitung sebagai karakter kuota.

| Peran | Suara | Pengaturan | Nada |
|---|---|---|---|
| glen | Dakocan - Expressive, Cheerful and Clear (`plgKUYgnlZ1DCNh54DwJ`), Indonesia aksen standar | stability 0.3, similarity 0.8 | +3 semiton |
| nino | Pratama - Clear, Confident and Warm (`q8qwd1jY2jS3AWOBeq25`), Indonesia aksen standar | stability 0.35, similarity 0.8 | +2 semiton |
| english | Josh - Teacher for Kids (`nzFihrBIvB34imQBuxub`), kata bahasa Inggris di quiz | stability 0.35 | 0 |
| mandarin | Sage (`APSIkVZudNbPAwyPoeVO`) | stability 0.4, similarity 0.8 | 0 |

Penyampaian: tiap baris di `audio/dialog.json` punya `delivery` (teks khusus TTS dengan tag; `text` untuk tampilan tidak berubah). Soal quiz dan kata memakai aturan kategori di `audio/delivery.json` (tag awal bervariasi per id). Mengubah `delivery`, aturan, suara, model, pengaturan, atau `pitchSemitones` otomatis menandai klip "berubah" (hash di manifest).

Pascaproduksi otomatis setelah unduh: geser nada `pitchSemitones` (ffmpeg `rubberband`, formant ikut naik supaya terdengar seperti penutur lebih kecil, tanpa efek tupai), potong hening awal/akhir, kompresi ringan, gain ke -16 LUFS, pembatas -1.5 dBTP, mono 44.1 kHz 96 kbps.

Sampel uji (empat kalimat, hasil akhir): `audio/voice-tests/v2_final_{glen,nino}_{a,b}.mp3`. Kandidat lain (mentah, tanpa geser nada): `audio/voice-tests/v2_glen_{kakceria,finn,dakocan}_{a,b}.mp3` dan `v2_nino_{pratama,zandhira,rafiq}_{a,b}.mp3`. Kak Ceria (`d15jrIAARvF899pDoC6T`) adalah suara anak-anak/kakak TV yang sangat tinggi (sekitar 400 Hz, perempuan); bila mau Glen terdengar lebih kecil lagi, ganti `glen.voice_id` ke sini dan setel `pitchSemitones` 0.

## Nada per kalimat (`pitchSemitones`)
Nada Glen +3 semiton (dari `voices.json`) bisa diganti untuk satu kalimat saja: tambahkan `"pitchSemitones": 1` pada baris itu di `audio/dialog.json` (atau `"_pitch": { "<id>": 1 }` di `audio/delivery.json`). Nilai ini MENGGANTIKAN nada suara (bukan ditambahkan), dan ikut hash manifest, jadi mengubahnya membuat klip dibuat ulang. Dipakai untuk kalimat pendek Glen (`bab1_glen_pulang/lompat/superglen/siapa/tertawa`, `bab2_glen_aduh/siap`) = +1 supaya lebih berat. Uji: `--say=glen --pitch=N ...`; `--from-raw=file.mp3` memproses ulang rekaman mentah tanpa biaya; `--keep-raw=dir` menyimpan keluaran mentah saat membuat klip. Perbandingan satu take: `audio/voice-tests/glen_pulang_alt2_p{2,1,0}.mp3`.

## Mengganti suara
Ubah `voice_id` (atau stability, similarity_boost, `pitchSemitones`, `model`) di `audio/voices.json`, lalu jalankan `npm run audio -- --category=...` (atau `--force`). Baris yang berubah dibuat ulang otomatis. Suara dari Voice Library harus ditambahkan ke akun dulu (gratis; Voice Library, "Add to my voices", atau API `POST /v1/voices/add/{public_owner_id}/{voice_id}`). Tes satu kalimat tanpa menyentuh manifest:

    node scripts/generate-audio.mjs --say=glen --text="Aduh!" --delivery="[surprised] Aduh!" --out=audio/voice-tests/coba.mp3

(`--raw` menyimpan keluaran mentah tanpa geser nada.) Versi lama (v1) ada di folder scratchpad sesi, tidak di repo; riwayat git menyimpan manifest lama.

## Mandarin
Suara aktif: Sage - Soothing & Gentle (perempuan, aksen standar daratan). Dipilih dari metadata, BELUM didengar penutur asli: cek nada dulu. Alternatif (sudah ada di akun, sampel uji di `audio/voice-tests/`, 4 nada + "nihao" + "xiexie"):
- `4VZIsMPtgggwNg7OXbPY` James Gao (laki-laki, tenang, hangat, aksen standar) : `mandarin_jamesgao.mp3`
- `MI36FIkp9wRP7cpWKPTl` Evan Zhao (laki-laki muda, hangat, aksen Beijing) : `mandarin_evanzhao.mp3`
- `APSIkVZudNbPAwyPoeVO` Sage (terpilih) : `mandarin_sage.mp3`
Untuk ganti: ubah `mandarin.voice_id` di `audio/voices.json`, lalu `npm run audio -- --category=quiz_mandarin,speak_zh`.

Tulis dalam aksara Han (misal 你好), bukan pinyin, dan `language_code: "zh"`. Pinyin di data soal hanya untuk tampilan. Tag emosi membuat nada lebih naik-turun; kalau nada Mandarin terdengar berlebihan, ganti tag di `audio/delivery.json` (`speak_zh`) atau hilangkan. Minta penutur asli mengecek nada sebelum dipakai anak.

## Aturan hemat kredit
- Selalu `--dry-run` dulu, lalu `--sample`, minta persetujuan, baru batch.
- Jangan `--force` tanpa alasan. Satu karakter teks = satu kredit.
- Hanya satu contoh per kategori sebelum disetujui.

## Suara hewan (`sfx_hewan_<key>`)
Ini efek suara, bukan ucapan, jadi tidak dibuat dengan skrip ini. Dua pilihan:

a) Rekaman gratis CC0 (Freesound dengan filter lisensi CC0, atau Pixabay). Simpan sebagai `public/audio/sfx_hewan_<key>.mp3` (pendek, 1 sampai 3 detik) dan catat di `CREDITS.md`.

| File | Suara |
|---|---|
| sfx_hewan_kucing.mp3 | kucing mengeong |
| sfx_hewan_anjing.mp3 | anjing menggonggong |
| sfx_hewan_sapi.mp3 | sapi melenguh |
| sfx_hewan_ayam.mp3 | ayam berkokok |
| sfx_hewan_bebek.mp3 | bebek berkwek |
| sfx_hewan_kuda.mp3 | kuda meringkik |
| sfx_hewan_singa.mp3 | singa mengaum |

b) API sound effects ElevenLabs (dipakai untuk anjing, sapi, bebek; lihat status di bawah).

### Status suara hewan (diisi 2026-11-13) dan alternatif
Sumber: Wikimedia Commons, hanya CC0 atau Domain Publik. Detail lisensi di `CREDITS.md`. Pemilihan dilakukan tanpa mendengar (agen tidak bisa mendengar audio): tolong dengarkan dulu. Untuk mengganti, simpan file baru dengan nama yang sama.

Sudah ada: kucing, ayam, kuda, singa. Alternatif bila kurang cocok (semua halaman di commons.wikimedia.org/wiki/File:...):
- kucing: `Meow of a Siamese cat - freemaster2.wav` (CC0, hanya 1.5 s, satu miauw bersih).
- ayam: `Small rooster crowing.ogg` (Domain Publik, alys, dua kokok pendek).
- kuda: tidak ada alternatif yang layak (hasil lain hanya orang mengucapkan kata "whinny").
- singa: `Lion sound effect.wav` (CC0, Zagzav12, berkas 56 MB, belum diperiksa isinya). Pilihan saat ini: singa kebun binatang, auman pendek (1 kali).

Status 2026-11-13: 7 dari 7 ada.
- Rekaman Domain Publik (Wikimedia Commons): kucing, ayam, kuda, singa.
- Dibuat dengan ElevenLabs Sound Effects (disetujui pemilik proyek): anjing, sapi, bebek. Prompt ada di `scripts/generate-sfx.mjs` dan `CREDITS.md`. Tiap hewan dibuat 2 kali (6 panggilan, sekitar 150 karakter kuota); pilihan dibuat dari ukuran (durasi, kenyaringan, pola diam/bunyi), BUKAN dari telinga: pemilik proyek harus mendengarkan dan memastikan. Take cadangan ada di `audio/voice-tests/sfx_<hewan>_alt.mp3`; untuk menukar, salin ke `public/audio/sfx_hewan_<hewan>.mp3`.
- Catatan anjing: kedua take punya tiga ledakan bunyi, bukan tepat dua gonggongan; dengarkan dan tukar dengan `_alt` bila kurang pas.

Membuat ulang satu suara (memakai kuota ElevenLabs): `npm run audio:sfx -- --only=anjing --takes=2` (hasil take di `audio/voice-tests/sfx_anjing_take<n>.mp3`, take 1 otomatis menjadi file akhir). Tanpa `--only`/`--force`, file yang sudah ada dilewati. `--dry-run` hanya menampilkan rencana. Skrip ini hanya mengenal anjing, sapi, bebek.
