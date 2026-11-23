# Musik Superglen

Taruh soundtrack sendiri di folder ini.

- Format: MP3 atau M4A.
- Ukuran: tiap lagu di bawah sekitar 3 MB (supaya cepat dimuat di iPhone).
- Sebaiknya bisa diulang mulus (awal dan akhir lagu menyambung).
- Lalu isi `tracks.json` dengan nama file untuk tiap adegan. Kosong ("") berarti tanpa musik.

| Kunci | Adegan |
|---|---|
| `awal` | layar awal |
| `jelajah` | menjelajah kota |
| `berubah` | saat berubah jadi Superglen |
| `latihan` | area latihan |
| `pertarungan` | pertarungan |
| `kredit` | kredit akhir (`credits.mp3`; diputar sekali, tanpa ulang; kalau file belum ada, tanpa musik) |

Contoh: `"awal": "tema-awal.mp3"`. Catat sumber lagu di `CREDITS.md`.
