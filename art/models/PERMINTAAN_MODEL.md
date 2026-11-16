# Model 3D yang dibutuhkan dari pemilik proyek

Buat dengan cara yang sama seperti Glen (GLB beranimasi, rig Mixamo). Unggah di chat; orkestrator yang menyimpan, mengecilkan (`npm run models`), dan memasang.

Semua model: menghadap depan, berdiri di lantai, satu karakter per file, tanpa podium/latar.

## Musuh (acuan gambar: `art/reference/enemies/`)

| File | Tokoh | Animasi yang dibutuhkan |
|---|---|---|
| `curut_cemberut.glb` | Curut Cemberut | idle, run, attack (seruduk), throw (lempar), hit, dizzy, run away (kabur) |
| `ular_melar.glb` | Ular Melar | idle (melingkar), slither (merayap), attack (menjulur/memanjang), hit, dizzy, happy (jinak) |
| `tikus_rakus.glb` | Tikus Rakus | idle, run, eat (makan), slam (banting perut / lompat), hit, dizzy, burp, sorry (minta maaf) |
| `elang_belang.glb` | Elang Belang | idle (berdiri), fly (terbang), shoot_left (bulu es), shoot_right (bulu api), hit, dizzy |
| `gorilla_gembira.glb` | Gorilla Gembira | idle, walk, sad (sedih), angry (marah/menghentak), happy, wave |

Ular tidak punya kaki: kalau rig Mixamo tidak cocok, kirim saja model tanpa animasi; gerak memanjang dibuat lewat kode.

## Warga (3-4 model umum, akan diwarnai ulang di game)

| File | Tokoh | Animasi |
|---|---|---|
| `warga_bapak.glb` | bapak | idle, walk, wave, talk |
| `warga_ibu.glb` | ibu | idle, walk, wave, talk |
| `warga_anak_laki.glb` | anak laki-laki | idle, walk, run, jump, wave |
| `warga_anak_perempuan.glb` | anak perempuan | idle, walk, run, jump, wave |

Opsional: animasi `jump`, `fall`, `land`, `hit` untuk Glen dan `fly` untuk Aara.
