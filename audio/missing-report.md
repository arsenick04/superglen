# Laporan audit suara (otomatis: `npm run audio:audit`)

Diaudit: 1444 kalimat beride, 7 kalimat tanpa id.
- ok: 945
- missing-clip: 478
- stale-text: 10
- missing-in-dialog-json: 11
- menunggu varian nama (tidak dibuat sekarang): 8
- perlu dibuat sekarang: 480 kalimat, sekitar 14211 karakter

## Perlu dibuat (urut prioritas)

### Prioritas 1 (5 kalimat, 309 karakter)

| id | speaker | text | status | chars | src |
|---|---|---|---|---|---|
| bab4_aara_bola | aara | Betul! Tempat bermain berkilau. Ayo ke sana! | stale-text | 54 | audio/dialog.json |
| bab4_aara_kolam | aara | Pintar! Kolamnya berkilau. Ayo ke sana! | stale-text | 49 | audio/dialog.json |
| bab4_aara_pohon | aara | Hebat! Pohonnya berkilau. Ayo ke sana! | stale-text | 48 | audio/dialog.json |
| forest_nino_done | nino | Tiga lintasan selesai! Ayo kembali ke Lab dan beristirahat bersama. | stale-text | 84 | audio/dialog.json |
| forest_nino_return | nino | Tiga lintasan selesai! Kalian sudah kembali dengan selamat. | stale-text | 74 | audio/dialog.json |

### Prioritas 2 (474 kalimat, 13816 karakter)

| id | speaker | text | status | chars | src |
|---|---|---|---|---|---|
| quiz_baca_066 | nino | Mana huruf c? | missing-clip | 23 | src/data/quiz/membaca.json |
| quiz_baca_067 | nino | Mana huruf f? | missing-clip | 24 | src/data/quiz/membaca.json |
| quiz_baca_068 | nino | Mana huruf j? | missing-clip | 23 | src/data/quiz/membaca.json |
| quiz_baca_069 | nino | Mana huruf v? | missing-clip | 24 | src/data/quiz/membaca.json |
| quiz_baca_070 | nino | Mana huruf w? | missing-clip | 23 | src/data/quiz/membaca.json |
| quiz_baca_071 | nino | Mana huruf x? | missing-clip | 23 | src/data/quiz/membaca.json |
| quiz_baca_072 | nino | Mana huruf y? | missing-clip | 24 | src/data/quiz/membaca.json |
| quiz_baca_073 | nino | Mana huruf z? | missing-clip | 23 | src/data/quiz/membaca.json |
| quiz_baca_074 | nino | Mana huruf q? | missing-clip | 23 | src/data/quiz/membaca.json |
| quiz_baca_075 | nino | Huruf pertama kata ini apa? | missing-clip | 37 | src/data/quiz/membaca.json |
| quiz_baca_076 | nino | Huruf pertama kata ini apa? | missing-clip | 37 | src/data/quiz/membaca.json |
| quiz_baca_077 | nino | Huruf pertama kata ini apa? | missing-clip | 37 | src/data/quiz/membaca.json |
| quiz_baca_078 | nino | Huruf pertama kata ini apa? | missing-clip | 37 | src/data/quiz/membaca.json |
| quiz_baca_079 | nino | Huruf pertama kata ini apa? | missing-clip | 38 | src/data/quiz/membaca.json |
| quiz_baca_080 | nino | Huruf pertama kata ini apa? | missing-clip | 38 | src/data/quiz/membaca.json |
| quiz_baca_081 | nino | Huruf pertama kata ini apa? | missing-clip | 37 | src/data/quiz/membaca.json |
| quiz_baca_082 | nino | Huruf pertama kata ini apa? | missing-clip | 37 | src/data/quiz/membaca.json |
| quiz_baca_083 | nino | Huruf pertama kata ini apa? | missing-clip | 37 | src/data/quiz/membaca.json |
| quiz_baca_084 | nino | Huruf pertama kata ini apa? | missing-clip | 38 | src/data/quiz/membaca.json |
| quiz_baca_085 | nino | Huruf pertama kata ini apa? | missing-clip | 37 | src/data/quiz/membaca.json |
| quiz_baca_086 | nino | Huruf pertama kata ini apa? | missing-clip | 37 | src/data/quiz/membaca.json |
| quiz_baca_087 | nino | Huruf pertama kata ini apa? | missing-clip | 37 | src/data/quiz/membaca.json |
| quiz_baca_088 | nino | Huruf pertama kata ini apa? | missing-clip | 37 | src/data/quiz/membaca.json |
| quiz_baca_089 | nino | Huruf pertama kata ini apa? | missing-clip | 38 | src/data/quiz/membaca.json |
| quiz_baca_090 | nino | Huruf pertama kata ini apa? | missing-clip | 38 | src/data/quiz/membaca.json |
| quiz_baca_091 | nino | Huruf pertama kata ini apa? | missing-clip | 38 | src/data/quiz/membaca.json |
| quiz_baca_092 | nino | Huruf pertama kata ini apa? | missing-clip | 38 | src/data/quiz/membaca.json |
| quiz_baca_093 | nino | Huruf pertama kata ini apa? | missing-clip | 37 | src/data/quiz/membaca.json |
| quiz_baca_094 | nino | Huruf pertama kata ini apa? | missing-clip | 37 | src/data/quiz/membaca.json |
| quiz_baca_095 | nino | Mana suku kata ja? | missing-clip | 28 | src/data/quiz/membaca.json |
| quiz_baca_096 | nino | Mana suku kata ju? | missing-clip | 28 | src/data/quiz/membaca.json |
| quiz_baca_097 | nino | Mana suku kata ra? | missing-clip | 29 | src/data/quiz/membaca.json |
| quiz_baca_098 | nino | Mana suku kata ri? | missing-clip | 29 | src/data/quiz/membaca.json |
| quiz_baca_099 | nino | Mana suku kata ru? | missing-clip | 29 | src/data/quiz/membaca.json |
| quiz_baca_100 | nino | Mana suku kata ha? | missing-clip | 29 | src/data/quiz/membaca.json |
| quiz_baca_101 | nino | Mana suku kata hu? | missing-clip | 28 | src/data/quiz/membaca.json |
| quiz_baca_102 | nino | Mana suku kata ga? | missing-clip | 28 | src/data/quiz/membaca.json |
| quiz_baca_103 | nino | Mana suku kata go? | missing-clip | 29 | src/data/quiz/membaca.json |
| quiz_baca_104 | nino | Mana suku kata wa? | missing-clip | 29 | src/data/quiz/membaca.json |
| quiz_baca_105 | nino | Mana suku kata wi? | missing-clip | 29 | src/data/quiz/membaca.json |
| quiz_baca_106 | nino | Mana suku kata ya? | missing-clip | 28 | src/data/quiz/membaca.json |
| quiz_baca_107 | nino | Mana suku kata yo? | missing-clip | 28 | src/data/quiz/membaca.json |
| quiz_baca_108 | nino | Mana suku kata fa? | missing-clip | 28 | src/data/quiz/membaca.json |
| quiz_baca_109 | nino | Mana suku kata fu? | missing-clip | 29 | src/data/quiz/membaca.json |
| quiz_baca_110 | nino | Mana suku kata ca? | missing-clip | 28 | src/data/quiz/membaca.json |
| quiz_baca_111 | nino | Mana suku kata ci? | missing-clip | 29 | src/data/quiz/membaca.json |
| quiz_baca_112 | nino | Mana suku kata za? | missing-clip | 28 | src/data/quiz/membaca.json |
| quiz_baca_113 | nino | Mana suku kata zu? | missing-clip | 29 | src/data/quiz/membaca.json |
| quiz_baca_114 | nino | Mana suku kata nu? | missing-clip | 28 | src/data/quiz/membaca.json |
| quiz_baca_115 | nino | Mana suku kata no? | missing-clip | 28 | src/data/quiz/membaca.json |
| quiz_baca_116 | nino | Mana suku kata ko? | missing-clip | 29 | src/data/quiz/membaca.json |
| quiz_baca_117 | nino | Mana suku kata ke? | missing-clip | 28 | src/data/quiz/membaca.json |
| quiz_baca_118 | nino | Mana suku kata lo? | missing-clip | 29 | src/data/quiz/membaca.json |
| quiz_baca_119 | nino | Mana suku kata me? | missing-clip | 29 | src/data/quiz/membaca.json |
| quiz_baca_120 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 45 | src/data/quiz/membaca.json |
| quiz_baca_121 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 45 | src/data/quiz/membaca.json |
| quiz_baca_122 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 44 | src/data/quiz/membaca.json |
| quiz_baca_123 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 45 | src/data/quiz/membaca.json |
| quiz_baca_124 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 44 | src/data/quiz/membaca.json |
| quiz_baca_125 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 44 | src/data/quiz/membaca.json |
| quiz_baca_126 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 44 | src/data/quiz/membaca.json |
| quiz_baca_127 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 44 | src/data/quiz/membaca.json |
| quiz_baca_128 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 45 | src/data/quiz/membaca.json |
| quiz_baca_129 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 45 | src/data/quiz/membaca.json |
| quiz_baca_130 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 45 | src/data/quiz/membaca.json |
| quiz_baca_131 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 44 | src/data/quiz/membaca.json |
| quiz_baca_132 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 45 | src/data/quiz/membaca.json |
| quiz_baca_133 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 45 | src/data/quiz/membaca.json |
| quiz_baca_134 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 44 | src/data/quiz/membaca.json |
| quiz_baca_135 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 45 | src/data/quiz/membaca.json |
| quiz_baca_136 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 44 | src/data/quiz/membaca.json |
| quiz_baca_137 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 44 | src/data/quiz/membaca.json |
| quiz_baca_138 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 44 | src/data/quiz/membaca.json |
| quiz_baca_139 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 45 | src/data/quiz/membaca.json |
| quiz_baca_140 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 44 | src/data/quiz/membaca.json |
| quiz_baca_141 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 44 | src/data/quiz/membaca.json |
| quiz_baca_142 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 45 | src/data/quiz/membaca.json |
| quiz_baca_143 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 45 | src/data/quiz/membaca.json |
| quiz_baca_144 | nino | Pilih gambar yang sesuai kata ini. | missing-clip | 45 | src/data/quiz/membaca.json |
| quiz_baca_145 | nino | Lawan kata 'besar' apa? | missing-clip | 34 | src/data/quiz/membaca.json |
| quiz_baca_146 | nino | Lawan kata 'panas' apa? | missing-clip | 33 | src/data/quiz/membaca.json |
| quiz_baca_147 | nino | Lawan kata 'atas' apa? | missing-clip | 33 | src/data/quiz/membaca.json |
| quiz_baca_148 | nino | Lawan kata 'cepat' apa? | missing-clip | 34 | src/data/quiz/membaca.json |
| quiz_baca_149 | nino | Lawan kata 'buka' apa? | missing-clip | 33 | src/data/quiz/membaca.json |
| quiz_baca_150 | nino | Lawan kata 'siang' apa? | missing-clip | 34 | src/data/quiz/membaca.json |
| quiz_baca_151 | nino | Lawan kata 'senang' apa? | missing-clip | 34 | src/data/quiz/membaca.json |
| quiz_baca_152 | nino | Lawan kata 'kanan' apa? | missing-clip | 33 | src/data/quiz/membaca.json |
| quiz_baca_153 | nino | Lawan kata 'panjang' apa? | missing-clip | 36 | src/data/quiz/membaca.json |
| quiz_baca_154 | nino | Lawan kata 'tinggi' apa? | missing-clip | 34 | src/data/quiz/membaca.json |
| quiz_baca_155 | nino | Lawan kata 'bersih' apa? | missing-clip | 34 | src/data/quiz/membaca.json |
| quiz_baca_156 | nino | Lawan kata 'basah' apa? | missing-clip | 34 | src/data/quiz/membaca.json |
| quiz_baca_157 | nino | Lawan kata 'dalam' apa? | missing-clip | 33 | src/data/quiz/membaca.json |
| quiz_baca_158 | nino | Lawan kata 'datang' apa? | missing-clip | 35 | src/data/quiz/membaca.json |
| quiz_baca_159 | nino | Lawan kata 'ya' apa? | missing-clip | 31 | src/data/quiz/membaca.json |
| quiz_baca_160 | nino | Kalimat mana yang ditulis dengan benar? | missing-clip | 49 | src/data/quiz/membaca.json |
| quiz_baca_161 | nino | Kalimat mana yang ditulis dengan benar? | missing-clip | 50 | src/data/quiz/membaca.json |
| quiz_baca_162 | nino | Kalimat mana yang ditulis dengan benar? | missing-clip | 50 | src/data/quiz/membaca.json |
| quiz_baca_163 | nino | Kalimat mana yang ditulis dengan benar? | missing-clip | 49 | src/data/quiz/membaca.json |
| quiz_baca_164 | nino | Kalimat mana yang ditulis dengan benar? | missing-clip | 50 | src/data/quiz/membaca.json |
| quiz_baca_165 | nino | Kalimat mana yang ditulis dengan benar? | missing-clip | 50 | src/data/quiz/membaca.json |
| quiz_baca_166 | nino | Kalimat mana yang ditulis dengan benar? | missing-clip | 49 | src/data/quiz/membaca.json |
| quiz_baca_167 | nino | Kalimat mana yang ditulis dengan benar? | missing-clip | 49 | src/data/quiz/membaca.json |
| quiz_baca_168 | nino | Kalimat mana yang ditulis dengan benar? | missing-clip | 49 | src/data/quiz/membaca.json |
| quiz_baca_169 | nino | Kalimat mana yang ditulis dengan benar? | missing-clip | 49 | src/data/quiz/membaca.json |
| quiz_baca_170 | nino | Kalimat mana yang ditulis dengan benar? | missing-clip | 50 | src/data/quiz/membaca.json |
| quiz_baca_171 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 40 | src/data/quiz/membaca.json |
| quiz_baca_172 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 40 | src/data/quiz/membaca.json |
| quiz_baca_173 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 40 | src/data/quiz/membaca.json |
| quiz_baca_174 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 40 | src/data/quiz/membaca.json |
| quiz_baca_175 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 40 | src/data/quiz/membaca.json |
| quiz_baca_176 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 41 | src/data/quiz/membaca.json |
| quiz_baca_177 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 40 | src/data/quiz/membaca.json |
| quiz_baca_178 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 41 | src/data/quiz/membaca.json |
| quiz_baca_179 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 40 | src/data/quiz/membaca.json |
| quiz_baca_180 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 40 | src/data/quiz/membaca.json |
| quiz_baca_181 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 40 | src/data/quiz/membaca.json |
| quiz_baca_182 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 40 | src/data/quiz/membaca.json |
| quiz_baca_183 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 40 | src/data/quiz/membaca.json |
| quiz_baca_184 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 41 | src/data/quiz/membaca.json |
| quiz_baca_185 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 41 | src/data/quiz/membaca.json |
| quiz_baca_186 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 41 | src/data/quiz/membaca.json |
| quiz_baca_187 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 40 | src/data/quiz/membaca.json |
| quiz_baca_188 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 41 | src/data/quiz/membaca.json |
| quiz_baca_189 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 41 | src/data/quiz/membaca.json |
| quiz_baca_190 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 40 | src/data/quiz/membaca.json |
| quiz_baca_191 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 41 | src/data/quiz/membaca.json |
| quiz_baca_192 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 41 | src/data/quiz/membaca.json |
| quiz_baca_193 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 40 | src/data/quiz/membaca.json |
| quiz_baca_194 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 40 | src/data/quiz/membaca.json |
| quiz_baca_195 | nino | Baca katanya. Pilih gambarnya. | missing-clip | 41 | src/data/quiz/membaca.json |
| quiz_hewan_066 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_067 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_068 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_069 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_070 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_071 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_072 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_073 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_074 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_075 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_076 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_077 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_078 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_079 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_080 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_081 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_082 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_083 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_084 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_085 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_086 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_087 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_088 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_089 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_090 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_091 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_092 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_093 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_094 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_095 | nino | Ini bayangan siapa, ya? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_096 | nino | Hewan mana yang lebih besar, kelinci atau kuda? | missing-clip | 57 | src/data/quiz/hewan.json |
| quiz_hewan_097 | nino | Hewan mana yang lebih besar, kucing atau kelinci? | missing-clip | 59 | src/data/quiz/hewan.json |
| quiz_hewan_098 | nino | Hewan mana yang lebih besar, kucing atau anjing? | missing-clip | 58 | src/data/quiz/hewan.json |
| quiz_hewan_099 | nino | Hewan mana yang lebih besar, kambing atau jerapah? | missing-clip | 60 | src/data/quiz/hewan.json |
| quiz_hewan_100 | nino | Hewan mana yang lebih besar, kelinci atau beruang? | missing-clip | 60 | src/data/quiz/hewan.json |
| quiz_hewan_101 | nino | Hewan mana yang lebih kecil, monyet atau gajah? | missing-clip | 57 | src/data/quiz/hewan.json |
| quiz_hewan_102 | nino | Hewan mana yang lebih kecil, lebah atau gajah? | missing-clip | 56 | src/data/quiz/hewan.json |
| quiz_hewan_103 | nino | Hewan mana yang lebih besar, harimau atau kucing? | missing-clip | 59 | src/data/quiz/hewan.json |
| quiz_hewan_104 | nino | Hewan mana yang lebih besar, unta atau bebek? | missing-clip | 55 | src/data/quiz/hewan.json |
| quiz_hewan_105 | nino | Hewan mana yang lebih besar, paus atau ikan? | missing-clip | 54 | src/data/quiz/hewan.json |
| quiz_hewan_106 | nino | Hewan mana yang lebih kecil, semut atau kucing? | missing-clip | 57 | src/data/quiz/hewan.json |
| quiz_hewan_107 | nino | Hewan mana yang lebih besar, singa atau kucing? | missing-clip | 57 | src/data/quiz/hewan.json |
| quiz_hewan_108 | nino | Hewan mana yang lebih kecil, kura-kura atau kuda? | missing-clip | 59 | src/data/quiz/hewan.json |
| quiz_hewan_109 | nino | Hewan mana yang lebih besar, sapi atau kambing? | missing-clip | 57 | src/data/quiz/hewan.json |
| quiz_hewan_110 | nino | Hewan mana yang lebih besar, zebra atau kucing? | missing-clip | 57 | src/data/quiz/hewan.json |
| quiz_hewan_111 | nino | Hewan mana yang lebih kecil, ayam atau gajah? | missing-clip | 55 | src/data/quiz/hewan.json |
| quiz_hewan_112 | nino | Hewan mana yang lebih besar, penguin atau semut? | missing-clip | 58 | src/data/quiz/hewan.json |
| quiz_hewan_113 | nino | Hewan mana yang lebih kecil, kepiting atau kuda? | missing-clip | 58 | src/data/quiz/hewan.json |
| quiz_hewan_114 | nino | Hewan mana yang lebih tinggi, jerapah atau kuda? | missing-clip | 58 | src/data/quiz/hewan.json |
| quiz_hewan_115 | nino | Hewan mana yang lebih kecil, burung atau gajah? | missing-clip | 57 | src/data/quiz/hewan.json |
| quiz_hewan_116 | nino | Hewan mana yang bisa mengeong? | missing-clip | 40 | src/data/quiz/hewan.json |
| quiz_hewan_117 | nino | Hewan mana yang bisa menggonggong? | missing-clip | 44 | src/data/quiz/hewan.json |
| quiz_hewan_118 | nino | Hewan mana yang bisa berkokok? | missing-clip | 40 | src/data/quiz/hewan.json |
| quiz_hewan_119 | nino | Hewan mana yang bisa meringkik? | missing-clip | 41 | src/data/quiz/hewan.json |
| quiz_hewan_120 | nino | Hewan mana yang hidup di kutub? | missing-clip | 41 | src/data/quiz/hewan.json |
| quiz_hewan_121 | nino | Hewan mana yang bisa melompat sangat jauh? | missing-clip | 52 | src/data/quiz/hewan.json |
| quiz_hewan_122 | nino | Hewan mana yang bisa terbang tinggi di langit? | missing-clip | 56 | src/data/quiz/hewan.json |
| quiz_hewan_123 | nino | Hewan mana yang berjalan menyamping di pasir? | missing-clip | 55 | src/data/quiz/hewan.json |
| quiz_hewan_124 | nino | Hewan mana yang punya surai tebal? | missing-clip | 44 | src/data/quiz/hewan.json |
| quiz_hewan_125 | nino | Hewan mana yang bergaris oranye dan hitam? | missing-clip | 52 | src/data/quiz/hewan.json |
| quiz_hewan_126 | nino | Hewan mana yang bernapas dengan insang? | missing-clip | 49 | src/data/quiz/hewan.json |
| quiz_hewan_127 | nino | Hewan mana yang punya bulu wol? | missing-clip | 41 | src/data/quiz/hewan.json |
| quiz_hewan_128 | nino | Hewan mana yang bertelur di air? | missing-clip | 42 | src/data/quiz/hewan.json |
| quiz_hewan_129 | nino | Hewan mana yang bisa berkicau? | missing-clip | 40 | src/data/quiz/hewan.json |
| quiz_hewan_130 | nino | Hewan mana yang berjalan di padang pasir? | missing-clip | 51 | src/data/quiz/hewan.json |
| quiz_hewan_131 | nino | Hewan mana yang punya bintik cokelat? | missing-clip | 47 | src/data/quiz/hewan.json |
| quiz_hewan_132 | nino | Hewan mana yang suka makan wortel? | missing-clip | 44 | src/data/quiz/hewan.json |
| quiz_hewan_133 | nino | Hewan mana yang punya belalai? | missing-clip | 40 | src/data/quiz/hewan.json |
| quiz_hewan_134 | nino | Hewan mana yang punya tanduk? | missing-clip | 39 | src/data/quiz/hewan.json |
| quiz_hewan_135 | nino | Hewan mana yang punya paruh lebar dan pandai berenang? | missing-clip | 64 | src/data/quiz/hewan.json |
| quiz_hewan_136 | nino | Mana yang bukan hewan laut? | missing-clip | 37 | src/data/quiz/hewan.json |
| quiz_hewan_137 | nino | Mana yang bukan hewan peliharaan? | missing-clip | 43 | src/data/quiz/hewan.json |
| quiz_hewan_138 | nino | Mana yang bukan burung? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_139 | nino | Mana yang bukan serangga? | missing-clip | 35 | src/data/quiz/hewan.json |
| quiz_hewan_140 | nino | Mana yang bisa terbang? | missing-clip | 33 | src/data/quiz/hewan.json |
| quiz_hewan_141 | nino | Mana yang berkaki dua? | missing-clip | 32 | src/data/quiz/hewan.json |
| quiz_hewan_142 | nino | Mana yang berkaki empat? | missing-clip | 34 | src/data/quiz/hewan.json |
| quiz_hewan_143 | nino | Mana yang bertelur? | missing-clip | 29 | src/data/quiz/hewan.json |
| quiz_hewan_144 | nino | Mana yang punya sayap? | missing-clip | 32 | src/data/quiz/hewan.json |
| quiz_hewan_145 | nino | Mana yang hidup di kutub? | missing-clip | 35 | src/data/quiz/hewan.json |
| quiz_hewan_146 | nino | Mana yang hidup di padang pasir? | missing-clip | 42 | src/data/quiz/hewan.json |
| quiz_hewan_147 | nino | Mana yang hidup di hutan? | missing-clip | 35 | src/data/quiz/hewan.json |
| quiz_hewan_148 | nino | Mana yang hidup di laut? | missing-clip | 34 | src/data/quiz/hewan.json |
| quiz_hewan_149 | nino | Mana yang hidup di sungai? | missing-clip | 36 | src/data/quiz/hewan.json |
| quiz_hewan_150 | nino | Mana yang bukan hewan berkaki empat? | missing-clip | 46 | src/data/quiz/hewan.json |
| quiz_inggris_178 | nino | Aara bilang apa? Pilih gambarnya! | stale-text | 43 | src/data/quiz/inggris.json |
| quiz_inggris_179 | nino | Aara bilang apa? Pilih gambarnya! | stale-text | 44 | src/data/quiz/inggris.json |
| quiz_inggris_180 | nino | Aara bilang apa? Pilih gambarnya! | stale-text | 43 | src/data/quiz/inggris.json |
| quiz_inggris_181 | nino | Aara bilang apa? Pilih gambarnya! | stale-text | 44 | src/data/quiz/inggris.json |
| quiz_mandarin_068 | nino | Angka ini artinya apa? | missing-clip | 32 | src/data/quiz/mandarin.json |
| quiz_mandarin_069 | nino | Angka ini artinya apa? | missing-clip | 32 | src/data/quiz/mandarin.json |
| quiz_mandarin_069_kata | mandarin | 零 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_070 | nino | Angka ini artinya apa? | missing-clip | 33 | src/data/quiz/mandarin.json |
| quiz_mandarin_070_kata | mandarin | 十五 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_071 | nino | Angka ini artinya apa? | missing-clip | 33 | src/data/quiz/mandarin.json |
| quiz_mandarin_071_kata | mandarin | 十四 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_072 | nino | Angka ini artinya apa? | missing-clip | 32 | src/data/quiz/mandarin.json |
| quiz_mandarin_072_kata | mandarin | 十六 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_073 | nino | Angka ini artinya apa? | missing-clip | 33 | src/data/quiz/mandarin.json |
| quiz_mandarin_073_kata | mandarin | 十七 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_074 | nino | Angka ini artinya apa? | missing-clip | 33 | src/data/quiz/mandarin.json |
| quiz_mandarin_074_kata | mandarin | 十九 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_075 | nino | Angka ini artinya apa? | missing-clip | 32 | src/data/quiz/mandarin.json |
| quiz_mandarin_075_kata | mandarin | 十三 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_076 | nino | Angka ini artinya apa? | missing-clip | 32 | src/data/quiz/mandarin.json |
| quiz_mandarin_076_kata | mandarin | 十八 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_077 | nino | Angka ini artinya apa? | missing-clip | 32 | src/data/quiz/mandarin.json |
| quiz_mandarin_077_kata | mandarin | 三十 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_078 | nino | Angka ini artinya apa? | missing-clip | 32 | src/data/quiz/mandarin.json |
| quiz_mandarin_078_kata | mandarin | 八十 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_079 | nino | Angka ini artinya apa? | missing-clip | 33 | src/data/quiz/mandarin.json |
| quiz_mandarin_079_kata | mandarin | 五十 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_080 | nino | Angka ini artinya apa? | missing-clip | 33 | src/data/quiz/mandarin.json |
| quiz_mandarin_080_kata | mandarin | 一百 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_081 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_081_kata | mandarin | 今天 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_082 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_082_kata | mandarin | 水 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_083 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_083_kata | mandarin | 米饭 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_084 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_084_kata | mandarin | 牛奶 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_085 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_085_kata | mandarin | 熊 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_086 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_086_kata | mandarin | 长颈鹿 | missing-clip | 14 | src/data/quiz/mandarin.json |
| quiz_mandarin_087 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_087_kata | mandarin | 斑马 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_088 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_088_kata | mandarin | 熊猫 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_089 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_089_kata | mandarin | 企鹅 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_090 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_090_kata | mandarin | 蝴蝶 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_091 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_091_kata | mandarin | 蜜蜂 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_092 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_092_kata | mandarin | 蚂蚁 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_093 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_093_kata | mandarin | 海豚 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_094 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_094_kata | mandarin | 乌龟 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_095 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_095_kata | mandarin | 螃蟹 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_096 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_096_kata | mandarin | 鹿 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_097 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_097_kata | mandarin | 汽车 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_098 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_098_kata | mandarin | 自行车 | missing-clip | 14 | src/data/quiz/mandarin.json |
| quiz_mandarin_099 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_099_kata | mandarin | 飞机 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_100 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_100_kata | mandarin | 船 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_101 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_101_kata | mandarin | 火车 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_102 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_102_kata | mandarin | 公交车 | missing-clip | 14 | src/data/quiz/mandarin.json |
| quiz_mandarin_103 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_103_kata | mandarin | 花 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_104 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_104_kata | mandarin | 草 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_105 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_105_kata | mandarin | 太阳 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_106 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_106_kata | mandarin | 月亮 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_107 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_107_kata | mandarin | 星星 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_108 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_108_kata | mandarin | 雨 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_109 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_109_kata | mandarin | 雪 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_110 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_110_kata | mandarin | 天空 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_111 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_111_kata | mandarin | 手 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_112 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_112_kata | mandarin | 脚 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_113 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_113_kata | mandarin | 眼睛 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_114 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_114_kata | mandarin | 耳朵 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_115 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_115_kata | mandarin | 鼻子 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_116 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_116_kata | mandarin | 嘴巴 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_117 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_117_kata | mandarin | 头 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_118 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_118_kata | mandarin | 帽子 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_119 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_119_kata | mandarin | 衣服 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_120 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_120_kata | mandarin | 裤子 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_121 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_121_kata | mandarin | 鞋 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_122 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_122_kata | mandarin | 椅子 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_123 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_123_kata | mandarin | 桌子 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_124 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_124_kata | mandarin | 门 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_125 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_125_kata | mandarin | 窗户 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_126 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_126_kata | mandarin | 老师 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_127 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_127_kata | mandarin | 学生 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_128 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_128_kata | mandarin | 医生 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_129 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_129_kata | mandarin | 警察 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_130 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_130_kata | mandarin | 小 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_131 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_131_kata | mandarin | 高 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_132 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_132_kata | mandarin | 矮 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_133 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_133_kata | mandarin | 快 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_134 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_134_kata | mandarin | 慢 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_135 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_135_kata | mandarin | 热 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_136 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_136_kata | mandarin | 冷 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_137 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_137_kata | mandarin | 开心 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_138 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_138_kata | mandarin | 难过 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_139 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_139_kata | mandarin | 吃 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_140 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_140_kata | mandarin | 喝 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_141 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_141_kata | mandarin | 睡觉 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_142 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_142_kata | mandarin | 走 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_143 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_143_kata | mandarin | 跑 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_144 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_144_kata | mandarin | 坐 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_145 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_145_kata | mandarin | 站 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_146 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_146_kata | mandarin | 唱歌 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_147 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_147_kata | mandarin | 画画 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_148 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_148_kata | mandarin | 写 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_149 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_149_kata | mandarin | 看 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_150 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_150_kata | mandarin | 读书 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_151 | nino | Pilih gambar yang benar, ya? | missing-clip | 39 | src/data/quiz/mandarin.json |
| quiz_mandarin_151_kata | mandarin | 鸟 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_152 | nino | Pilih gambar yang benar, ya? | missing-clip | 39 | src/data/quiz/mandarin.json |
| quiz_mandarin_152_kata | mandarin | 鱼 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_153 | nino | Pilih gambar yang benar, ya? | missing-clip | 38 | src/data/quiz/mandarin.json |
| quiz_mandarin_153_kata | mandarin | 西瓜 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_154 | nino | Pilih gambar yang benar, ya? | missing-clip | 39 | src/data/quiz/mandarin.json |
| quiz_mandarin_154_kata | mandarin | 草莓 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_155 | nino | Pilih gambar yang benar, ya? | missing-clip | 39 | src/data/quiz/mandarin.json |
| quiz_mandarin_155_kata | mandarin | 葡萄 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_156 | nino | Pilih gambar yang benar, ya? | missing-clip | 38 | src/data/quiz/mandarin.json |
| quiz_mandarin_156_kata | mandarin | 蛋糕 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_157 | nino | Pilih gambar yang benar, ya? | missing-clip | 38 | src/data/quiz/mandarin.json |
| quiz_mandarin_157_kata | mandarin | 铅笔 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_158 | nino | Pilih gambar yang benar, ya? | missing-clip | 39 | src/data/quiz/mandarin.json |
| quiz_mandarin_158_kata | mandarin | 灯 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_159 | nino | Pilih gambar yang benar, ya? | missing-clip | 38 | src/data/quiz/mandarin.json |
| quiz_mandarin_159_kata | mandarin | 伞 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_160 | nino | Pilih gambar yang benar, ya? | missing-clip | 39 | src/data/quiz/mandarin.json |
| quiz_mandarin_160_kata | mandarin | 房子 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_161 | nino | Pilih gambar yang benar, ya? | missing-clip | 38 | src/data/quiz/mandarin.json |
| quiz_mandarin_161_kata | mandarin | 饭 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_162 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_162_kata | mandarin | 饿 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_163 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_163_kata | mandarin | 渴 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_164 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_164_kata | mandarin | 累 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_165 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_165_kata | mandarin | 对 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_166 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_166_kata | mandarin | 好 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_167 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_167_kata | mandarin | 不 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_168 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_168_kata | mandarin | 是 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_169 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_169_kata | mandarin | 请 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_170 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_170_kata | mandarin | 早上 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_171 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_171_kata | mandarin | 晚上 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_172 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_172_kata | mandarin | 中午 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_173 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_173_kata | mandarin | 上 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_174 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_174_kata | mandarin | 下 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_175 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_175_kata | mandarin | 左 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_176 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_176_kata | mandarin | 右 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_177 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_177_kata | mandarin | 里 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_178 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_178_kata | mandarin | 外 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_179 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_179_kata | mandarin | 男孩 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_180 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_180_kata | mandarin | 女孩 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_181 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_181_kata | mandarin | 宝宝 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_182 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_182_kata | mandarin | 叔叔 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_183 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_183_kata | mandarin | 阿姨 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_184 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_184_kata | mandarin | 我 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_185 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_185_kata | mandarin | 你 | missing-clip | 12 | src/data/quiz/mandarin.json |
| quiz_mandarin_186 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_186_kata | mandarin | 吃饭 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_187 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_187_kata | mandarin | 喝水 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_188 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_188_kata | mandarin | 上学 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_189 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_189_kata | mandarin | 回家 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_190 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_190_kata | mandarin | 好吃 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_191 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_191_kata | mandarin | 很高兴 | missing-clip | 14 | src/data/quiz/mandarin.json |
| quiz_mandarin_192 | nino | Artinya apa, ya? | missing-clip | 27 | src/data/quiz/mandarin.json |
| quiz_mandarin_192_kata | mandarin | 我爱你 | missing-clip | 14 | src/data/quiz/mandarin.json |
| quiz_mandarin_193 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_193_kata | mandarin | 欢迎 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_194 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_194_kata | mandarin | 明天 | missing-clip | 13 | src/data/quiz/mandarin.json |
| quiz_mandarin_195 | nino | Artinya apa, ya? | missing-clip | 26 | src/data/quiz/mandarin.json |
| quiz_mandarin_195_kata | mandarin | 昨天 | missing-clip | 13 | src/data/quiz/mandarin.json |

### Prioritas 3 (0 kalimat, 0 karakter)

(kosong)

### Prioritas 4 (1 kalimat, 86 karakter)

| id | speaker | text | status | chars | src |
|---|---|---|---|---|---|
| lab_nino_latihan_3 | nino | Dekati tombol oranye di lantai, lalu tekan tombol aksi. Latihan pun dimulai! | stale-text | 86 | audio/dialog.json |

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
| lab_nino_latihan_1 | nino | Selamat datang di Ruang Latihan, {nama}! Semua lawanmu tersimpan di sini sebagai hologram. | missing-in-dialog-json | 90 | src/world/ending/TrainingRoomLevel.ts:19 |
| forest_aara_home | aara | Pagi, {nama}! Nino mengajak kita ke Lab. Katanya ada tempat latihan baru! | missing-in-dialog-json | 73 | src/world/kota/KotaLevel.ts:537 |
| forest_nino_urgent | nino | {nama}, segera datang ke Lab! Ada keadaan genting di Hutan Botanica! | missing-in-dialog-json | 68 | src/world/kota/KotaLevel.ts:569 |

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
| src/world/kota/CityLife.ts:1061 | (shout) | Awas! | shout-bubble |
| src/world/kota/CityLife.ts:1120 | (shout) | Hore! | shout-bubble |

## Pembicara tanpa suara di audio/voices.json

(semua ada)

## ok (945)

Tidak dirinci; jalankan audit untuk daftar penuh dengan --json=file.

## Catatan proses (2026-11-22, diisi manual)
- Dibuat: 85 klip (30 prioritas 1: Bab 1/5, Elang, latihan terbang, hutan dan Gorilla; 55 prioritas 2: soal 061..065 semua kategori, versi Nino dan Aara, kata Mandarin). Semua lolos cek Scribe (Indonesia) kecuali dua kata Mandarin satu aksara.
- Ditunda (menunggu varian nama `<id>_g` / `<id>_sg`): 15 kalimat sapaan yang belum punya klip: bab5_nino_panggil_lab, elang_nino_alarm, elang_nino_menang, elang_nino_terbang, rakus_morning_letters, rakus_nino_lab_arrival, rakus_nino_lab_invite, rakus_nino_pulang (ada di dialog.json), dan forest_aara_home, forest_aara_quiz_complete, forest_aara_quiz_ready, forest_aara_sunset, forest_gorilla_sorry, forest_nino_fire, forest_nino_urgent (belum ada di dialog.json; teks ada di kode). Sapaan yang sudah punya klip (kota_*_halo, kota_*_terima, nino_pujian_*, dst.) tidak disentuh.
- Ragu, perlu didengar manusia: quiz_mandarin_061_kata (树, Scribe: "shoe"), quiz_mandarin_064_kata (跳, Scribe: "tell"; satu suku kata, nada belum dicek penutur asli). Semua klip baru: ekspresi (tidak datar) hanya bisa dinilai telinga; terutama suara Gorilla (`forest_gorilla_accuse`, Bagas -2 semiton).
- `demo_halo` dan teks DemoLevel hanya untuk level uji, sengaja tidak disuarakan.
- Tidak dibuat: suara Elang Belang dan hewan hutan (tidak ada kalimat bicara mereka di kode; monyet tidak berbicara).
