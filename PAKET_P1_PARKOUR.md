# Paket P1 dan P2: Parkour Bebas dan Lompat Irama Barongsai

Spesifikasi ini menggantikan dan memperluas bagian parkour di paket A3 dan bagian "Dunia: Kota Botanica" di design doc. Kalau ada yang bertentangan, file ini yang dipakai.

Cek dulu apa yang sudah ada dari paket A3 (lompat, double jump, coyote time, dan lainnya). Jangan dibuat ulang, ubah dan perluas yang ada.

## Tujuan

1. Pemain bebas melompat ke mana saja: tanah, genteng, atap, balkon, tiang, pohon. Tidak ada dinding yang rata tanpa jalan naik.
2. Setiap bangunan punya banyak undakan (pijakan) supaya bisa dipanjat dengan parkour.
3. **Lompat Irama Barongsai:** lompatan makin tinggi kalau pemain menekan lompat tepat saat mendarat, berulang kali, seperti irama tambur Barongsai.

## 1. Lompat Irama Barongsai

**Cara kerja**
- Saat Superglen mendarat, ada jendela waktu singkat. Kalau tombol lompat ditekan di jendela itu (sedikit sebelum atau sesudah menyentuh tanah), lompatan berikutnya naik satu **tingkat irama**.
- Ada 5 tingkat. Makin tinggi tingkatnya, makin tinggi lompatannya.
- Kalau terlewat, tingkat turun **satu**, bukan kembali ke nol. Kalau berdiri diam lebih dari 1,5 detik, tingkat juga turun satu. Anak 5 tahun tidak boleh merasa dihukum.
- Mendarat di tambur pantul selalu dihitung tepat dan naik satu tingkat.
- Double jump dan terbang tetap bisa dipakai di atas lompatan irama.

**Nilai awal (semua harus bisa diubah di satu file `src/config/parkour.ts`)**

| Tingkat | Tinggi lompat | Nada tambur |
|---|---|---|
| 0 | 1,6 m | nada 1 |
| 1 | 2,1 m | nada 2 |
| 2 | 2,7 m | nada 3 |
| 3 | 3,4 m | nada 4 |
| 4 (maksimal, "Lompat Singa") | 4,2 m | nada 5, plus sorak singa |

- Tinggi karakter sekitar 1 m. Double jump menambah sekitar 1,2 m di atas tinggi lompatan.
- Jendela waktu: "tepat" 120 ms, "bagus" 300 ms (default). Keduanya naik satu tingkat. Tepat memberi efek lebih meriah.
- Gunakan tangga nada pentatonik untuk kelima nada tambur supaya selalu terdengar enak, tidak peduli ritmenya.

**Umpan balik (tanpa teks, anak 5 tahun)**
- Cincin cahaya di kaki berdenyut saat hampir mendarat, sebagai petunjuk kapan menekan.
- Setiap tingkat: suara tambur "DUNG" dengan nada naik, kepala singa mengangguk lebih besar, aura emas lebih tebal, jejak partikel di udara.
- Di sudut layar ada 5 ikon tambur kecil yang menyala sesuai tingkat.
- Kamera sedikit menjauh di tingkat tinggi supaya pemain melihat tempat yang akan dituju.

**Mode mudah (default aktif untuk anak kecil, bisa dimatikan di halaman orang tua)**
- Menahan tombol lompat membuat lompat berulang otomatis dengan irama stabil, tingkat naik pelan sampai tingkat 3.
- Tingkat 4 hanya bisa dicapai dengan menekan sendiri tepat waktu. Ini jadi tantangan untuk yang sudah lancar.

**Kontrol**
- iPhone: tombol lompat besar. PC: spasi. Tidak ada tombol tambahan.

## 2. Bebas memanjat

- **Mantle otomatis:** kalau tangan hampir mencapai tepi platform (maksimal 0,5 m di atas kepala), karakter otomatis menarik diri naik dengan animasi.
- **Tendang dinding (wall kick):** saat di udara menempel dinding lalu menekan lompat, karakter menendang dinding ke atas sekali. Bisa dipakai antara dua dinding berdekatan. Boleh dikerjakan di P2 kalau waktu P1 habis.
- Semua bangunan, atap, genteng, dan balkon punya collider. Pemain bisa berdiri dan berjalan di atasnya.
- Genteng miring boleh dipijak tapi tidak membuat karakter tergelincir.
- Jatuh tidak merusak apa pun. Mendarat dari tempat tinggi terdengar "boing" empuk. Jatuh keluar peta kembali ke platform aman terakhir.

## 3. Undakan (pijakan) di setiap bangunan

Aturan tata letak, berlaku untuk semua distrik dan area uji:

1. Tidak ada bangunan dengan dinding rata dari tanah sampai atap. Setiap bangunan punya setidaknya satu **rute naik** dari tanah ke atap.
2. Pijakan bisa berupa: kanopi dan tenda, AC luar ruangan, kusen jendela, balkon, pipa, tumpukan peti dan tong, papan reklame, tangga genteng, lentera besar, tiang bendera, dahan pohon, bak air di atap.
3. Rute naik menyesuaikan tinggi bangunan:
   - Rumah 1 lantai (3 sampai 4 m): cukup lompatan biasa (tingkat 0 sampai 1).
   - Ruko 2 sampai 3 lantai (6 sampai 8 m): butuh tingkat 2 sampai 3.
   - Gedung landmark (10 sampai 12 m): butuh rantai pijakan dan tingkat 4. Ini hadiah untuk pemain yang sudah lancar (di atasnya ada stiker dan pemandangan kota).
4. Antar atap bertetangga: jarak mendatar maksimal 3 m, selisih tinggi maksimal 1,5 m untuk rute hijau.
5. Collider pijakan dibuat ramah: tepi diperlebar sekitar 10 cm dari tampilan visual supaya anak tidak kecewa karena "hampir".
6. Pijakan yang bisa dipakai diberi tepi berkilau tipis atau warna kontras, supaya anak tahu mana yang boleh diinjak.
7. Jalur koin membimbing rute lompatan. Koin tidak boleh ditaruh di tempat yang tidak terjangkau.
8. Bangunan dibangun dari **kit modul** (dinding, atap, pijakan) yang di-instance, supaya ringan di iPhone. Tambahkan kit pijakan di `src/world/kits/`.

## 4. Area uji: Arena Lompat (perbarui)

- Menara Irama: 5 lantai pijakan dengan celah yang makin lebar, tiap lantai butuh satu tingkat irama lebih tinggi. Dipakai untuk menguji dan membuat anak merasakan kemajuan.
- Deretan tiang Barongsai dengan tinggi berbeda.
- Tiga tambur pantul berjajar.
- Satu rumah mini dan satu ruko mini lengkap dengan rute naik, untuk menguji aturan di bagian 3.

## 5. Tes otomatis jangkauan (wajib di P2)

Buat `scripts/reachability.ts`:
- Membaca daftar pijakan dan atap dari data level.
- Menghitung dari titik mulai, pijakan mana yang bisa dicapai pada tiap tingkat irama, memakai nilai di `parkour.ts`.
- Gagal (error) kalau ada atap atau koin yang tidak bisa dicapai pada tingkat yang ditetapkan untuk bangunan itu.
- Dijalankan lewat `npm run check:reach` dan ikut dalam "Definisi selesai".

## Pembagian paket

**P1: Mekanik** (satu malam)
- Lompat Irama Barongsai lengkap (jendela waktu, 5 tingkat, penurunan lembut, umpan balik suara dan visual, mode mudah).
- Mantle otomatis, `src/config/parkour.ts`.
- Arena Lompat diperbarui dengan Menara Irama.
- Tes di PC dan iPhone. Catat fps.

**P2: Dunia** (satu malam)
- Kit pijakan dan modul bangunan, aturan tata letak di bagian 3.
- Terapkan ke jalan kota di Bab 1 (rumah, ruko, atap).
- Tes jangkauan otomatis (bagian 5).
- Wall kick kalau masih ada waktu.
- Perbarui `SUPERGLEN_GAME_DESIGN.md` bagian Dunia dan Kontrol dengan ringkasan isi file ini.

Di akhir tiap paket: build lulus, commit, update `PROGRESS.md` dengan "Untuk dicoba besok pagi" (maksimal 3 poin: coba lompat irama sampai tingkat 3, coba naik ke atap rumah, coba mode mudah).
