# Laporan audit suara (otomatis: `npm run audio:audit`)

Diaudit: 666 kalimat beride, 7 kalimat tanpa id.
- ok: 565
- missing-clip: 77
- stale-text: 0
- missing-in-dialog-json: 24
- menunggu varian nama (tidak dibuat sekarang): 15
- perlu dibuat sekarang: 69 kalimat, sekitar 3152 karakter

## Perlu dibuat (urut prioritas)

### Prioritas 1 (14 kalimat, 1200 karakter)

| id | speaker | text | status | chars | src |
|---|---|---|---|---|---|
| bab1_nino_pulang_dulu | nino | Sekarang pulang dulu ke rumah. Istirahat yang cukup, lalu kembali besok pagi! | missing-clip | 84 | audio/dialog.json |
| bab5_aara_rayakan | aara | Hore! Kita bertiga hebat sekali! | missing-clip | 40 | audio/dialog.json |
| bab5_glen_rayakan | glen | Kita berhasil menjinakkan Ular Melar! Terima kasih, Nino dan Aara! | missing-clip | 76 | audio/dialog.json |
| bab5_nino_latihan_besok | nino | Selamat pagi! Siap latihan Lompat Barongsai? | missing-clip | 54 | audio/dialog.json |
| bab5_nino_pulang | nino | Sekarang pulang dulu. Besok kita mulai latihan Lompat Barongsai. | missing-clip | 71 | audio/dialog.json |
| elang_glen_berangkat | glen | Aku akan terbang ke Bank dan menolong mereka! | missing-clip | 58 | audio/dialog.json |
| elang_glen_melihat | glen | Itu Elang Belang! Sayapnya biru dan merah. Aku harus berhati-hati! | missing-clip | 78 | audio/dialog.json |
| elang_nino_lawan | nino | Elang menyerang dengan es dan api. Hindari atau tangkis keduanya, lalu tembak saat ia kelelahan! | missing-clip | 110 | audio/dialog.json |
| flight_nino_done | nino | Tiga level selesai! Glen sudah mahir terbang, membidik, dan bertahan di udara. Ayo kembali ke Lab! | missing-clip | 98 | audio/dialog.json |
| flight_nino_easy | nino | Level satu! Tahan lompat tetap bisa untuk terbang. Sekarang tombol roket juga bisa menjaga Glen di udara. Lewati empat lingkaran besar! | missing-clip | 135 | audio/dialog.json |
| flight_nino_hard | nino | Level tiga! Lewati enam lingkaran sempit. Sasaran dan bola makin cepat. Tetap tenang dan gunakan perisai! | missing-clip | 105 | audio/dialog.json |
| flight_nino_laser | nino | Lintasan selesai! Tetap terbang dan tembak semua sasaran yang muncul bergantian. | missing-clip | 80 | audio/dialog.json |
| flight_nino_medium | nino | Level dua! Ikuti lima lingkaran yang lebih kecil, lalu bidik sasaran bergerak dan tangkis tiga bola. | missing-clip | 100 | audio/dialog.json |
| flight_nino_shield | nino | Sekarang hadapi mesin bola. Tetap di udara dan tangkis bolanya dengan perisai sampai latihan level ini selesai. | missing-clip | 111 | audio/dialog.json |

### Prioritas 2 (55 kalimat, 1952 karakter)

| id | speaker | text | status | chars | src |
|---|---|---|---|---|---|
| aara_quiz_baca_061 | aara | Huruf pertama kata ini apa? | missing-clip | 27 | src/data/quiz/membaca.json |
| aara_quiz_baca_062 | aara | Kata mana yang cocok? | missing-clip | 21 | src/data/quiz/membaca.json |
| aara_quiz_baca_063 | aara | Suku kata mana yang melengkapi kata ini? | missing-clip | 40 | src/data/quiz/membaca.json |
| aara_quiz_baca_064 | aara | Kata mana yang berarti bergerak ke atas dari tanah? | missing-clip | 51 | src/data/quiz/membaca.json |
| aara_quiz_baca_065 | aara | Kalimat mana yang ditulis dengan benar? | missing-clip | 39 | src/data/quiz/membaca.json |
| aara_quiz_hewan_061 | aara | Hewan mana yang suka bergelantungan di pohon? | missing-clip | 45 | src/data/quiz/hewan.json |
| aara_quiz_hewan_062 | aara | Hewan mana yang hidup di air? | missing-clip | 29 | src/data/quiz/hewan.json |
| aara_quiz_hewan_063 | aara | Hewan mana yang punya belalai? | missing-clip | 30 | src/data/quiz/hewan.json |
| aara_quiz_hewan_064 | aara | Hewan mana yang punya pelindung keras di punggung? | missing-clip | 50 | src/data/quiz/hewan.json |
| aara_quiz_hewan_065 | aara | Hewan mana yang biasanya aktif pada malam hari? | missing-clip | 47 | src/data/quiz/hewan.json |
| aara_quiz_hitung_061 | aara | Ada 3 monyet, lalu datang 2 lagi. Jadi berapa? | missing-clip | 46 | src/data/quiz/berhitung.json |
| aara_quiz_hitung_062 | aara | Mana angka yang paling besar? | missing-clip | 29 | src/data/quiz/berhitung.json |
| aara_quiz_hitung_063 | aara | Ada 9 pisang. Dimakan 3. Sisanya berapa? | missing-clip | 40 | src/data/quiz/berhitung.json |
| aara_quiz_hitung_064 | aara | Empat ditambah empat sama dengan? | missing-clip | 33 | src/data/quiz/berhitung.json |
| aara_quiz_hitung_065 | aara | Glen melompati 5 pohon, lalu 3 pohon. Semuanya berapa? | missing-clip | 54 | src/data/quiz/berhitung.json |
| aara_quiz_inggris_061 | aara | Apa bahasa Inggrisnya pohon? | missing-clip | 28 | src/data/quiz/inggris.json |
| aara_quiz_inggris_062 | aara | Apa bahasa Inggrisnya teman? | missing-clip | 28 | src/data/quiz/inggris.json |
| aara_quiz_inggris_063 | aara | Kata mana yang berarti hutan? | missing-clip | 29 | src/data/quiz/inggris.json |
| aara_quiz_inggris_064 | aara | Apa bahasa Inggrisnya melompat? | missing-clip | 31 | src/data/quiz/inggris.json |
| aara_quiz_inggris_065 | aara | Kalimat mana yang berarti ayo bermain? | missing-clip | 38 | src/data/quiz/inggris.json |
| aara_quiz_mandarin_061 | aara | Artinya apa, ya? | missing-clip | 16 | src/data/quiz/mandarin.json |
| aara_quiz_mandarin_062 | aara | Artinya apa, ya? | missing-clip | 16 | src/data/quiz/mandarin.json |
| aara_quiz_mandarin_063 | aara | Artinya apa, ya? | missing-clip | 16 | src/data/quiz/mandarin.json |
| aara_quiz_mandarin_064 | aara | Artinya apa, ya? | missing-clip | 16 | src/data/quiz/mandarin.json |
| aara_quiz_mandarin_065 | aara | Artinya apa, ya? | missing-clip | 16 | src/data/quiz/mandarin.json |
| quiz_baca_061 | nino | Huruf pertama kata ini apa? | missing-clip | 37 | src/data/quiz/membaca.json |
| quiz_baca_062 | nino | Kata mana yang cocok? | missing-clip | 31 | src/data/quiz/membaca.json |
| quiz_baca_063 | nino | Suku kata mana yang melengkapi kata ini? | missing-clip | 50 | src/data/quiz/membaca.json |
| quiz_baca_064 | nino | Kata mana yang berarti bergerak ke atas dari tanah? | missing-clip | 62 | src/data/quiz/membaca.json |
| quiz_baca_065 | nino | Kalimat mana yang ditulis dengan benar? | missing-clip | 49 | src/data/quiz/membaca.json |
| quiz_hewan_061 | nino | Hewan mana yang suka bergelantungan di pohon? | missing-clip | 55 | src/data/quiz/hewan.json |
| quiz_hewan_062 | nino | Hewan mana yang hidup di air? | missing-clip | 39 | src/data/quiz/hewan.json |
| quiz_hewan_063 | nino | Hewan mana yang punya belalai? | missing-clip | 40 | src/data/quiz/hewan.json |
| quiz_hewan_064 | nino | Hewan mana yang punya pelindung keras di punggung? | missing-clip | 60 | src/data/quiz/hewan.json |
| quiz_hewan_065 | nino | Hewan mana yang biasanya aktif pada malam hari? | missing-clip | 57 | src/data/quiz/hewan.json |
| quiz_hitung_061 | nino | Ada 3 monyet, lalu datang 2 lagi. Jadi berapa? | missing-clip | 56 | src/data/quiz/berhitung.json |
| quiz_hitung_062 | nino | Mana angka yang paling besar? | missing-clip | 39 | src/data/quiz/berhitung.json |
| quiz_hitung_063 | nino | Ada 9 pisang. Dimakan 3. Sisanya berapa? | missing-clip | 51 | src/data/quiz/berhitung.json |
| quiz_hitung_064 | nino | Empat ditambah empat sama dengan? | missing-clip | 43 | src/data/quiz/berhitung.json |
| quiz_hitung_065 | nino | Glen melompati 5 pohon, lalu 3 pohon. Semuanya berapa? | missing-clip | 64 | src/data/quiz/berhitung.json |
| quiz_inggris_061 | nino | Apa bahasa Inggrisnya pohon? | missing-clip | 39 | src/data/quiz/inggris.json |
| quiz_inggris_062 | nino | Apa bahasa Inggrisnya teman? | missing-clip | 39 | src/data/quiz/inggris.json |
| quiz_inggris_063 | nino | Kata mana yang berarti hutan? | missing-clip | 39 | src/data/quiz/inggris.json |
| quiz_inggris_064 | nino | Apa bahasa Inggrisnya melompat? | missing-clip | 41 | src/data/quiz/inggris.json |
| quiz_inggris_065 | nino | Kalimat mana yang berarti ayo bermain? | missing-clip | 49 | src/data/quiz/inggris.json |
| quiz_mandarin_061 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_061_kata | mandarin | 树 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_062 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_062_kata | mandarin | 朋友 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_063 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_063_kata | mandarin | 森林 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_064 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_064_kata | mandarin | 跳 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_065 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_065_kata | mandarin | 一起玩 | missing-clip | 14 | src/data/quiz/mandarin.json |

### Prioritas 3 (0 kalimat, 0 karakter)

(kosong)

### Prioritas 4 (0 kalimat, 0 karakter)

(kosong)

## missing-in-dialog-json (id dipakai di kode, belum ada di audio/dialog.json)

| id | speaker | text | status | chars | src |
|---|---|---|---|---|---|
| demo_halo | nino | Halo! | missing-in-dialog-json | 5 | src/world/DemoLevel.ts:58 |
| forest_glen_flight_broken | glen | Oh tidak, alat terbangku rusak! Aku harus melompat untuk menolong monyet-monyet itu! | missing-in-dialog-json | 84 | src/world/arena/ForestRescueLevel.ts:95 |
| forest_nino_rescue_ten | nino | Selamatkan sepuluh monyet dari atas pohon. Dekati mereka, lalu tekan tangan. Jangan menyentuh tanah! Kalau jatuh, penyelamatan diulang dari awal. | missing-in-dialog-json | 145 | src/world/arena/ForestRescueLevel.ts:96 |
| forest_glen_monkeys_safe | glen | Semua monyet sudah aman! Sekarang kita harus mencari sumber api. | missing-in-dialog-json | 64 | src/world/arena/ForestRescueLevel.ts:112 |
| forest_aara_play | aara | Hutannya luas sekali! Ayo bermain lompat dari pohon ke pohon! | missing-in-dialog-json | 61 | src/world/arena/ForestTrainingLevel.ts:92 |
| forest_nino_three | nino | Ada tiga lintasan: mudah, menengah, dan sulit. Selesaikan satu per satu, ya! | missing-in-dialog-json | 76 | src/world/arena/ForestTrainingLevel.ts:93 |
| forest_nino_medium | nino | Lintasan mudah selesai! Sekarang pijakannya lebih kecil dan lebih berjauhan. | missing-in-dialog-json | 76 | src/world/arena/ForestTrainingLevel.ts:94 |
| forest_aara_hard | aara | Berikutnya lintasan sulit! Gunakan double jump untuk mencapai dahan yang tinggi. | missing-in-dialog-json | 80 | src/world/arena/ForestTrainingLevel.ts:95 |
| forest_nino_done | nino | Lima tingkat selesai! Ayo kembali ke Lab dan beristirahat bersama. | missing-in-dialog-json | 66 | src/world/arena/ForestTrainingLevel.ts:96 |
| forest_gorilla_accuse | gorila | Kamu manusia yang membakar hutanku? Pergi dari sini! | missing-in-dialog-json | 52 | src/world/arena/GorillaArena.ts:81 |
| forest_glen_explain | glen | Bukan aku! Kami datang menolong monyet-monyet. Tenang dulu, Gorilla! | missing-in-dialog-json | 68 | src/world/arena/GorillaArena.ts:82 |
| forest_nino_gorilla_pattern | nino | Hindari lompatan Gorilla atau pakai perisai. Setelah dua serangannya gagal, tembak saat dia beristirahat. Alat terbangmu masih rusak, jadi tetap di atas pohon! | missing-in-dialog-json | 159 | src/world/arena/GorillaArena.ts:83 |
| forest_glen_help_fire | glen | Tidak apa-apa, Gorilla. Ayo kita selamatkan hutan ini bersama! | missing-in-dialog-json | 62 | src/world/arena/GorillaArena.ts:170 |
| forest_aara_lab | aara | Kami sudah datang, Nino. Latihan apa hari ini? | missing-in-dialog-json | 46 | src/world/bab1/Bab1Level.ts:194 |
| forest_nino_lab | nino | Kita akan berlatih lompat pohon di Hutan Botanica! Keluar dan cari jalur di belakang gedung ini. | missing-in-dialog-json | 96 | src/world/bab1/Bab1Level.ts:195 |
| forest_nino_return | nino | Lima lintasan selesai! Kalian sudah kembali dengan selamat. | missing-in-dialog-json | 59 | src/world/bab1/Bab1Level.ts:202 |
| forest_nino_hurry | nino | Kita harus segera ke sana. Gunakan jalur di belakang gedung Barongsai! | missing-in-dialog-json | 70 | src/world/bab1/Bab1Level.ts:234 |

## Menunggu varian nama (sapaan Glen/Superglen oleh tokoh lain)

| id | speaker | text | status | chars | src |
|---|---|---|---|---|---|
| bab5_nino_panggil_lab | nino | Kembali ke Lab, Glen! Kita rayakan kemenangan kalian bersama Aara. | missing-clip (waiting name) | 76 | audio/dialog.json |
| elang_nino_alarm | nino | Alarm berbunyi! Elang Belang terbang di atas Bank dan mengganggu warga. Hari mulai malam. Superglen, temui dia di sana! | missing-clip (waiting name) | 128 | audio/dialog.json |
| elang_nino_menang | nino | Elang Belang sudah tenang! Warga aman. Malam ini pulang dan istirahat dulu, Glen. | missing-clip (waiting name) | 92 | audio/dialog.json |
| elang_nino_terbang | nino | Aktifkan mode terbang dulu, Glen! Dekati Elang dari udara lalu tembak saat sayapnya turun. | missing-clip (waiting name) | 100 | audio/dialog.json |
| forest_aara_home | aara | Pagi, Glen! Nino mengajak kita ke Lab. Katanya ada tempat latihan baru! | missing-in-dialog-json (waiting name) | 71 | src/world/kota/KotaLevel.ts:486 |
| forest_aara_quiz_complete | aara | Hebat! Lima pertanyaan berhasil kamu jawab, Glen! | missing-in-dialog-json (waiting name) | 49 | src/world/bab1/Bab1Level.ts:207 |
| forest_aara_quiz_ready | aara | Sambil istirahat, ayo bermain tebak-tebakan lagi, Glen! | missing-in-dialog-json (waiting name) | 55 | src/world/bab1/Bab1Level.ts:203 |
| forest_aara_sunset | aara | Matahari mulai terbenam. Ayo kita keluar dan pulang, Glen! | missing-in-dialog-json (waiting name) | 58 | src/world/bab1/Bab1Level.ts:209 |
| forest_gorilla_sorry | gorila | Maaf, Glen. Aku salah paham. Ternyata kamu datang untuk menolong kami. | missing-in-dialog-json (waiting name) | 70 | src/world/arena/GorillaArena.ts:169 |
| forest_nino_fire | nino | Glen, lihat layar! Ada kebakaran besar di Hutan Botanica! | missing-in-dialog-json (waiting name) | 57 | src/world/bab1/Bab1Level.ts:232 |
| forest_nino_urgent | nino | Glen, segera datang ke Lab! Ada keadaan genting di Hutan Botanica! | missing-in-dialog-json (waiting name) | 66 | src/world/kota/KotaLevel.ts:518 |
| rakus_morning_letters | nino | Selamat pagi, Glen! Cari huruf SUPERGLEN yang tersebar di kota. Setelah lengkap, datang ke Lab, ya! | missing-clip (waiting name) | 110 | audio/dialog.json |
| rakus_nino_lab_arrival | nino | Selamat datang kembali, Superglen! Latihan berikutnya adalah terbang sambil menembak dan memakai perisai. | missing-clip (waiting name) | 116 | audio/dialog.json |
| rakus_nino_lab_invite | nino | Hebat, semua huruf SUPERGLEN sudah terkumpul! Sekarang datang ke Lab, Glen. Kita latihan lagi! | missing-clip (waiting name) | 104 | audio/dialog.json |
| rakus_nino_pulang | nino | Hari sudah malam, Glen. Pulang dan istirahat dulu, ya. Besok ada tantangan baru! | missing-clip (waiting name) | 87 | audio/dialog.json |

## Tanpa id (belum bisa disuarakan; kode perlu memberi id)

| file:line | speaker | text | catatan |
|---|---|---|---|
| src/world/DemoLevel.ts:80 | nino | Wah, kamu sampai! | no-id |
| src/world/DemoLevel.ts:81 | glen | Ayo kita main lagi! | no-id |
| src/world/arena/JumpTrainingLevel.ts:92 | nino | Mulai dari lintasan mudah: pijakannya besar. Setelah itu menengah dan sulit! | no-id |
| src/world/arena/JumpTrainingLevel.ts:123 | nino | Lintasan ${course.name} selesai! Berikutnya ${next.name}. | dynamic-template |
| src/world/arena/JumpTrainingLevel.ts:135 | nino | Hebat! Pijakan kecil dan double jump pun berhasil. Latihan selesai! | no-id |
| src/world/kota/CityLife.ts:938 | (shout) | Awas! | shout-bubble |
| src/world/kota/CityLife.ts:997 | (shout) | Hore! | shout-bubble |

## Pembicara tanpa suara di audio/voices.json

- gorila: 2 kalimat (forest_gorilla_accuse, forest_gorilla_sorry)

## ok (565)

Tidak dirinci; jalankan audit untuk daftar penuh dengan --json=file.
