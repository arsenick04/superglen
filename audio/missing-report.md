# Laporan audit suara (otomatis: `npm run audio:audit`)

Diaudit: 690 kalimat beride, 7 kalimat tanpa id.
- ok: 671
- missing-clip: 8
- stale-text: 0
- missing-in-dialog-json: 11
- menunggu varian nama (tidak dibuat sekarang): 8
- perlu dibuat sekarang: 0 kalimat, sekitar 0 karakter

## Perlu dibuat (urut prioritas)

### Prioritas 1 (0 kalimat, 0 karakter)

(kosong)

### Prioritas 2 (0 kalimat, 0 karakter)

(kosong)

### Prioritas 3 (0 kalimat, 0 karakter)

(kosong)

### Prioritas 4 (0 kalimat, 0 karakter)

(kosong)

## missing-in-dialog-json (id dipakai di kode, belum ada di audio/dialog.json)

| id | speaker | text | status | chars | src |
|---|---|---|---|---|---|
| demo_halo | nino | Halo! | missing-in-dialog-json | 5 | src/world/DemoLevel.ts:58 |
| ff_gorilla_thanks | gorila | Terima kasih, {nama}! Hutanku selamat berkat kamu, Nino, dan Aara. | missing-in-dialog-json | 66 | src/world/arena/FirefightLevel.ts:26 |
| forest_gorilla_sorry | gorila | Maaf, {nama}. Aku salah paham. Ternyata kamu datang untuk menolong kami. | missing-in-dialog-json | 72 | src/world/arena/GorillaArena.ts:195 |
| forest_aara_quiz_ready | aara | Sambil istirahat, ayo bermain tebak-tebakan lagi, {nama}! | missing-in-dialog-json | 57 | src/world/bab1/Bab1Level.ts:217 |
| forest_aara_quiz_complete | aara | Hebat! Lima pertanyaan berhasil kamu jawab, {nama}! | missing-in-dialog-json | 51 | src/world/bab1/Bab1Level.ts:221 |
| forest_aara_sunset | aara | Matahari mulai terbenam. Ayo kita keluar dan pulang, {nama}! | missing-in-dialog-json | 60 | src/world/bab1/Bab1Level.ts:223 |
| forest_nino_fire | nino | {nama}, lihat layar! Ada kebakaran besar di Hutan Botanica! | missing-in-dialog-json | 59 | src/world/bab1/Bab1Level.ts:246 |
| lab_aara_kuis_halo | aara | Halo, {nama}! Ayo main Tantangan Pintar bersamaku! | missing-in-dialog-json | 50 | src/world/bab1/LabAaraHost.ts:8 |
| lab_nino_latihan_1 | nino | Selamat datang di Ruang Latihan, {nama}! Semua lawanmu tersimpan di sini sebagai hologram. | missing-in-dialog-json | 90 | src/world/ending/TrainingRoomLevel.ts:18 |
| forest_aara_home | aara | Pagi, {nama}! Nino mengajak kita ke Lab. Katanya ada tempat latihan baru! | missing-in-dialog-json | 73 | src/world/kota/KotaLevel.ts:486 |
| forest_nino_urgent | nino | {nama}, segera datang ke Lab! Ada keadaan genting di Hutan Botanica! | missing-in-dialog-json | 68 | src/world/kota/KotaLevel.ts:518 |

## Menunggu varian nama (sapaan Glen/Superglen oleh tokoh lain)

| id | speaker | text | status | chars | src |
|---|---|---|---|---|---|
| bab5_nino_panggil_lab | nino | Kembali ke Lab, Glen! Kita rayakan kemenangan kalian bersama Aara. | missing-clip (waiting name) | 76 | audio/dialog.json |
| elang_nino_alarm | nino | Alarm berbunyi! Elang Belang terbang di atas Bank dan mengganggu warga. Hari mulai malam. Superglen, temui dia di sana! | missing-clip (waiting name) | 128 | audio/dialog.json |
| elang_nino_menang | nino | Elang Belang sudah tenang! Warga aman. Malam ini pulang dan istirahat dulu, Glen. | missing-clip (waiting name) | 92 | audio/dialog.json |
| elang_nino_terbang | nino | Aktifkan mode terbang dulu, Glen! Dekati Elang dari udara lalu tembak saat sayapnya turun. | missing-clip (waiting name) | 100 | audio/dialog.json |
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

(semua ada)

## ok (671)

Tidak dirinci; jalankan audit untuk daftar penuh dengan --json=file.

## Catatan proses (2026-11-22, diisi manual)
- Dibuat: 85 klip (30 prioritas 1: Bab 1/5, Elang, latihan terbang, hutan dan Gorilla; 55 prioritas 2: soal 061..065 semua kategori, versi Nino dan Aara, kata Mandarin). Semua lolos cek Scribe (Indonesia) kecuali dua kata Mandarin satu aksara.
- Ditunda (menunggu varian nama `<id>_g` / `<id>_sg`): 15 kalimat sapaan yang belum punya klip: bab5_nino_panggil_lab, elang_nino_alarm, elang_nino_menang, elang_nino_terbang, rakus_morning_letters, rakus_nino_lab_arrival, rakus_nino_lab_invite, rakus_nino_pulang (ada di dialog.json), dan forest_aara_home, forest_aara_quiz_complete, forest_aara_quiz_ready, forest_aara_sunset, forest_gorilla_sorry, forest_nino_fire, forest_nino_urgent (belum ada di dialog.json; teks ada di kode). Sapaan yang sudah punya klip (kota_*_halo, kota_*_terima, nino_pujian_*, dst.) tidak disentuh.
- Ragu, perlu didengar manusia: quiz_mandarin_061_kata (树, Scribe: "shoe"), quiz_mandarin_064_kata (跳, Scribe: "tell"; satu suku kata, nada belum dicek penutur asli). Semua klip baru: ekspresi (tidak datar) hanya bisa dinilai telinga; terutama suara Gorilla (`forest_gorilla_accuse`, Bagas -2 semiton).
- `demo_halo` dan teks DemoLevel hanya untuk level uji, sengaja tidak disuarakan.
- Tidak dibuat: suara Elang Belang dan hewan hutan (tidak ada kalimat bicara mereka di kode; monyet tidak berbicara).
