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
- `npm run audio:voices` : pilih suara otomatis per peran dan tulis ke `audio/voices.json` (tambah `--dry-run` untuk hanya melihat usulan).

File yang sudah ada dilewati. Teks atau suara yang berubah terdeteksi lewat hash di manifest dan dibuat ulang otomatis.

## Mengganti satu kalimat dengan rekaman keluarga
1. Simpan rekaman sebagai `public/audio/<id>.mp3`.
2. Beri tanda di `audio/dialog.json` pada kalimat itu: `"source": "recorded"` (untuk soal quiz, di `audio/manifest.json`: `"<id>": { "source": "recorded" }`).
3. Skrip tidak akan menimpa kalimat itu. MP3 yang tidak ada di manifest juga dianggap buatan tangan dan tidak ditimpa (kecuali `--force`).

## Mengganti suara
Ubah `voice_id` (atau pengaturan stability, similarity_boost, style) di `audio/voices.json`, lalu jalankan `npm run audio` (atau `--category=...` dulu). Baris dengan suara lama dibuat ulang otomatis. Kalau API tidak bisa dijangkau, cari suara di ElevenLabs Voice Library, salin Voice ID, tempel manual ke `voices.json`. Semua suara harus mendukung model multilingual untuk Bahasa Indonesia.

## Mandarin
Suara aktif: Sage - Soothing & Gentle (perempuan, aksen standar daratan, lembut seperti guru). Dipilih dari metadata (bahasa zh, aksen standar), BELUM didengar penutur asli: cek nada dulu. Alternatif (sudah ada di akun, sampel uji di `audio/voice-tests/`, 4 nada + "nihao" + "xiexie"):
- `4VZIsMPtgggwNg7OXbPY` James Gao (laki-laki, tenang, hangat, aksen standar) : `mandarin_jamesgao.mp3`
- `MI36FIkp9wRP7cpWKPTl` Evan Zhao (laki-laki muda, hangat, aksen Beijing) : `mandarin_evanzhao.mp3`
- `APSIkVZudNbPAwyPoeVO` Sage (terpilih) : `mandarin_sage.mp3`
Untuk ganti: ubah `mandarin.voice_id` di `audio/voices.json`, lalu `npm run audio -- --category=quiz_mandarin,speak_zh`.

Tulis dalam aksara Han (misal 你好), bukan pinyin, dan `language_code: "zh"`. Pinyin di data soal hanya untuk tampilan. Minta penutur asli mengecek nada sebelum dipakai anak.

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
