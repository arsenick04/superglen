# Prompt Sinematik Superglen (untuk Higgsfield)

Dokumen ini berisi semua prompt untuk sinematik game Superglen. Prompt gambar dan gerak ditulis dalam bahasa Inggris supaya Higgsfield paham. Penjelasan dan narasi ditulis dalam bahasa Indonesia.

Total: **48 shot** (sinematik pembuka 9, Ch1 3, Ch2 sampai Ch8 masing-masing 4, finale 5, teaser Superglen 2 3).

---

## Bagian 0: Cara memakai dokumen ini

1. Buka bagian 1 (paket konsistensi). Salin baris **STYLE** dan baris karakter ke catatan terpisah.
2. Untuk setiap shot, bangun prompt gambar dengan urutan: **[STYLE] + baris karakter yang muncul di shot + deskripsi shot**. Di dokumen ini, `[STYLE]` dan `[GLEN]`, `[NINO]`, dan seterusnya adalah penanda. Ganti dengan teks lengkapnya dari bagian 1.
3. Untuk video (image-to-video), pakai gambar yang sudah dipilih dan prompt **gerak** dari shot tersebut. Prompt gerak sudah pendek, tidak perlu ditambah style.
4. Teks **narasi** tidak dimasukkan ke video. Narasi dipakai untuk audio dialog di game (`audio/dialog.json`). Video harus tanpa tulisan.
5. Sesuai aturan proyek, mulai dengan **1 contoh per kategori** (1 gambar dan 1 video), lalu minta persetujuan pemilik proyek sebelum membuat sisanya.

---

## Bagian 1: Paket konsistensi

### 1.1 Gaya tetap (STYLE)

Tempel di depan setiap prompt gambar:

> `Pixar-style 3D animation, Disney-like cinematic character render, warm colours, soft lighting, gentle rim light, child-friendly, cute and friendly mood, 16:9 cinematic framing, no text, no logos, no watermark, no scary elements, no blood, no weapons.`

### 1.2 Karakter (pakai referensi gambar)

Sebelum generate, **unggah gambar referensi sebagai image reference** di Higgsfield:
- Semua file di `art/reference/` (acuan Glen, Superglen, Nino, Aara, dan suasana kota).
- Semua file di `art/reference/enemies/` (acuan musuh).

Jika deskripsi di bawah berbeda dengan gambar referensi, **ikuti gambar referensi**. Deskripsi ini hanya pelengkap.

**[GLEN]**
> `Glen, a cheerful Indonesian boy about 6 years old, big brown eyes, warm tan skin, messy spiky black hair, white short-sleeve school shirt with a small orange tie, orange vest, orange shorts, blue socks, orange-and-white sneakers.`

**[SUPERGLEN]**
> `Superglen, the same boy Glen in a red-and-gold Barongsai lion dance hero costume: a big lion-head hood framing his smiling face (round googly lion eyes, turquoise gem and gold horn on the forehead, cream fur trim, gold ears), red suit with gold trim and a gold G emblem on the chest, gold belt, red-and-gold boots with cream curls.`

**[NINO]**
> `Nino, a friendly boy about 8 years old, swept black hair with a small glowing blue light at his temple, blue tunic with white fur trim and a white N emblem, silver belt with a blue gem, dark blue trousers with white fur cuffs, blue sneakers, soft blue glow.`

**[AARA]**
> `Aara, a cheerful Indonesian girl about 6 years old, long straight dark brown hair with an orange flower clip, white shirt with an orange tie, orange vest and pleated orange skirt, white socks, orange shoes, holding a small translator gadget.`

### 1.3 Musuh (pakai referensi gambar di `art/reference/enemies/`)

**[CURUT]** Curut Cemberut
> `Curut Cemberut, a small beige mouse with huge round ears, a very grumpy frowning face with angry eyebrows and red eyes, tufts of hair on top, wearing torn light-blue patched overalls, cartoon cute-grumpy, not scary.`

**[ULAR]** Ular Melar
> `Ular Melar, a long cartoon snake with olive-green and mustard-yellow camouflage patches, cream ribbed belly, big grumpy yellow-green eyes, small forked tongue, body that stretches long like rubber, cartoon not scary.`

**[TIKUS]** Tikus Rakus
> `Tikus Rakus, a huge round greedy rat with blue-grey fur, big cream belly, pink ears and nose, cheeky toothy grin with buck teeth, yellow eyes with mischievous eyebrows, colourful patchwork shorts, pink tail, silly not scary.`

**[ELANG]** Elang Belang
> `Elang Belang, a striped white-and-black eagle with an angry frown and yellow beak; left wing made of glowing icy blue feathers with snowflakes, right wing made of red-orange flame feathers, cartoon not scary.`

**[GORILA]** Gorilla Gembira
> `Gorilla Gembira, a big friendly gorilla with reddish-brown fur, grey face, chest and round belly, warm amber eyes and a gentle smile.`

**[SOSOK]** Sosok Misterius (hanya di teaser)
> `A tall mysterious silhouette in a long dark coat, face hidden in soft shadow, only a small glowing tech light visible, mysterious but not scary, no monster, no magic.`

### 1.4 Lingkungan tetap

- **Kota Botanica:** kota kecil Indonesia yang cerah, rumah-rumah pastel dengan atap genteng merah, pohon hijau, jalan lebar, pasar yang ramai, taman, dan bukit di pinggir kota.
- **Gedung tua Barongsai:** bangunan tua di atas bukit, catnya sudah pudar, ada hiasan kepala Barongsai di atap, tertutup tanaman merambat.
- **Lab rahasia:** ruangan bundar di dalam gedung, cahaya biru lembut, ada **mesin kuno berbentuk kepala Barongsai** dengan lampu-lampu teknologi di tengah ruangan.

---

## Bagian 2: Sinematik pembuka, "Kisah awal Glen" (9 shot, sekitar 65 detik)

Diputar sekali di awal game. Bisa dilewati pemain.

### Shot 1 · 7 detik · Kamera: slow aerial glide (meluncur pelan dari atas)
- **Gambar:** `[STYLE] Wide establishing shot of Kota Botanica in the morning, a colourful small Indonesian town with pastel shophouses, red tile roofs, tall green trees, a wide road with a yellow school bus, hills in the distance, warm golden sunlight.`
- **Gerak:** `Slow aerial glide forward over the town, sunlight warming, a bird flies past, leaves sway gently.`
- **Narasi (Narator):** "Ini Kota Botanica, kota kecil yang penuh warna."

### Shot 2 · 7 detik · Kamera: medium tracking shot dari samping
- **Gambar:** `[STYLE] [GLEN] Glen walks home from school on a sidewalk, backpack bouncing, kicking a small pebble, happy and relaxed, school gate in the background.`
- **Gerak:** `Glen walks forward at a relaxed pace, camera tracks alongside him, the pebble bounces away.`
- **Narasi (Narator):** "Glen pulang sekolah sambil bersiul."

### Shot 3 · 8 detik · Kamera: low angle melihat ke atas
- **Gambar:** `[STYLE] [GLEN] Glen stands at the foot of a small overgrown path that climbs a hill, at the top stands an old abandoned Barongsai temple building with faded red paint, a carved lion head on the roof, covered by climbing plants, soft clouds.`
- **Gerak:** `Camera slowly tilts up from Glen to the old building at the top of the hill, leaves rustle, Glen looks up with curiosity.`
- **Narasi (Narator):** "Di atas bukit, ada bangunan tua yang sudah lama ditinggalkan."

### Shot 4 · 7 detik · Kamera: over-the-shoulder, dolly-in pelan
- **Gambar:** `[STYLE] [GLEN] Glen from behind, climbing the path toward an old wooden door with a lion-head door knocker that has a soft blue glow.`
- **Gerak:** `Glen climbs the last steps, reaches the door, the lion-head knocker glows brighter, the door slides open slowly with a soft light from inside.`
- **Narasi (Narator):** "Glen penasaran. Pintunya terbuka sendiri."

### Shot 5 · 8 detik · Kamera: slow dolly-in dan reveal
- **Gambar:** `[STYLE] Inside a round secret Lab, soft blue light, glowing panels on the walls, in the center an ancient computer shaped like a Barongsai lion head with small technology lights and big round eyes, friendly and not scary.`
- **Gerak:** `Camera slowly moves in toward the ancient Barongsai-head computer, its lights blink one by one, a soft hum of light.`
- **Narasi (Narator):** "Di dalam ada ruangan rahasia yang penuh cahaya."

### Shot 6 · 7 detik · Kamera: medium close-up, sejajar mata
- **Gambar:** `[STYLE] [NINO] Nino stands in the Lab with a warm welcoming smile, one hand raised in a friendly wave, the computer glowing behind him.`
- **Gerak:** `Nino waves gently, his light ring glows, he steps forward with a friendly nod.`
- **Narasi (Nino):** "Halo, Glen! Namaku Nino. Selamat datang di Lab."

### Shot 7 · 8 detik · Kamera: orbit pelan mengelilingi Nino
- **Gambar:** `[STYLE] [NINO] [GLEN] Nino and Glen facing each other in the Lab, Nino gestures toward the big Barongsai-head computer, small floating costume pieces glowing in the air around them.`
- **Gerak:** `Camera slowly orbits around Nino and Glen, Nino gestures to the computer, the floating costume pieces spin slowly.`
- **Narasi (Nino):** "Kamu punya hati yang berani. Mau jadi pahlawan Superglen?"

### Shot 8 · 7 detik · Kamera: close-up dengan ledakan cahaya lembut
- **Gambar:** `[STYLE] [GLEN] Close-up of Glen's face, a little nervous and then determined, golden light starting to surround him, the computer's lion eyes glowing gold behind him.`
- **Gerak:** `Glen nods bravely, the golden light swirls around him, the computer lion eyes shine brighter and the lights make a happy chime.`
- **Narasi (Glen):** "Ayo!"

### Shot 9 · 6 detik · Kamera: tarik mundur (pull back) menampilkan seluruh tubuh
- **Gambar:** `[STYLE] [SUPERGLEN] Full-body shot of Superglen striking a proud hero pose in the Lab, golden sparkles around him, the red-and-gold costume shining.`
- **Gerak:** `Golden sparkles swirl and settle, Superglen raises a fist with a friendly grin, camera pulls back to show the full pose.`
- **Narasi (Narator):** "Hore! Glen jadi Superglen! Ayo kita mulai petualangan!"

---

## Bagian 3: Sinematik per bab

Setiap sinematik diputar **sebelum dialog pertama di bab itu**. Durasi total 15 sampai 30 detik.

### Ch1: Pintu rahasia (3 shot, sekitar 18 detik)

*Catatan: sinematik pembuka sudah menceritakan Ch1. Sinematik ini adalah versi pendek untuk pemain yang melewati pembuka, atau untuk pembukaan Ch1 di kota. Boleh dilewati jika pembuka sudah diputar.*

**Shot 1 · 6 detik · Kamera: wide, sunset**
- **Gambar:** `[STYLE] [GLEN] Glen stands on the hill in a warm sunset, the old Barongsai temple building behind him, soft orange sky.`
- **Gerak:** `Glen looks at the building, the wind gently moves his hair and the plants, slow camera push-in.`
- **Narasi (Glen):** "Itu tempat apa, ya?"

**Shot 2 · 6 detik · Kamera: close-up pintu**
- **Gambar:** `[STYLE] Close-up of an old wooden door with a carved lion-head knocker that glows soft blue, dust particles floating in the light.`
- **Gerak:** `The knocker glows brighter, the dust sparkles, the door creaks open slightly with blue light spilling out.`
- **Narasi (Narator):** "Pintu itu terbuka pelan-pelan."

**Shot 3 · 6 detik · Kamera: medium, sejajar mata**
- **Gambar:** `[STYLE] [NINO] Nino at the doorway of the Lab, smiling, one hand raised in a wave, inviting gesture.`
- **Gerak:** `Nino waves and beckons Glen inward, his light ring glows.`
- **Narasi (Nino):** "Masuk, Glen. Kamu sudah ditunggu."

### Ch2: Latihan di Lab (4 shot, sekitar 24 detik)

**Shot 1 · 6 detik · Kamera: follow dari belakang**
- **Gambar:** `[STYLE] [SUPERGLEN] Superglen flying in the blue Lab hangar, cheerful pose, a row of glowing rings in the air ahead.`
- **Gerak:** `Superglen flies forward and dives through the first glowing ring with a happy shout, camera follows.`
- **Narasi (Nino):** "Bagus! Terbang lewat cincin cahaya itu."

**Shot 2 · 6 detik · Kamera: side view, pan**
- **Gambar:** `[STYLE] [SUPERGLEN] [NINO] Superglen raises a hand, a soft laser beam from his glove hits colourful round target boards, the boards light up with stars and confetti.`
- **Gerak:** `Superglen aims, the soft beam hits the targets one by one, they pop with sparkles.`
- **Narasi (Nino):** "Tepat sasaran! Kamu hebat sekali."

**Shot 3 · 6 detik · Kamera: medium, ringan**
- **Gambar:** `[STYLE] [SUPERGLEN] Superglen holds a glowing shield in front of him, bouncing red and yellow rubber balls hit the shield and bounce away.`
- **Gerak:** `Rubber balls bounce toward the shield, they bounce off with a boing, Superglen laughs.`
- **Narasi (Superglen):** "Boing! Perisaiku kuat!"

**Shot 4 · 6 detik · Kamera: wide, lalu alarm**
- **Gambar:** `[STYLE] [GLEN] [NINO] Glen and Nino sitting together at a small table in the Lab eating a warm bowl of soup, then a small round alarm light in the ceiling starts to blink orange.`
- **Gerak:** `They eat happily, then the alarm light blinks, Nino looks up with a worried face.`
- **Narasi (Nino):** "Ada yang butuh bantuan di pasar!"

### Ch3: Kekacauan di pasar (4 shot, sekitar 24 detik)

**Shot 1 · 6 detik · Kamera: wide, crane pelan**
- **Gambar:** `[STYLE] A busy colourful Indonesian market, stalls with fruit and cloth, shoppers, a few tipped baskets on the ground, a small cute mess.`
- **Gerak:** `Camera crane moves down over the market, a fruit basket tips over and a few apples roll.`
- **Narasi (Narator):** "Di pasar, ada yang membuat kacau."

**Shot 2 · 6 detik · Kamera: low angle**
- **Gambar:** `[STYLE] [CURUT] Curut Cemberut stands on a market stall with a grumpy pout, arms crossed, a small pile of mixed-up vegetables around him.`
- **Gerak:** `Curut Cemberut stamps his foot, puffs his cheeks, then looks sideways with a grumpy face.`
- **Narasi (Curut):** "Hmph! Aku tidak mau membereskan ini!"

**Shot 3 · 6 detik · Kamera: medium, sejajar tanah**
- **Gambar:** `[STYLE] [TIKUS] Tikus Rakus peeks out from behind a sack of rice, cheeks full, holding a large mango, looking sneaky and greedy.`
- **Gerak:** `Tikus Rakus takes a big bite of the mango, then quickly runs away with the sack, his belly wobbles.`
- **Narasi (Narator):** "Tikus Rakus datang! Dia lari sambil membawa makanan."

**Shot 4 · 6 detik · Kamera: follow, tracking**
- **Gambar:** `[STYLE] [SUPERGLEN] Superglen running after a trail of footprints through the market, cape-like costume fluttering, confident pose.`
- **Gerak:** `Superglen runs forward quickly, camera tracks him, footprints and fruit scatter.`
- **Narasi (Superglen):** "Tunggu! Kita kejar bersama!"

### Ch4: Jejak di taman (4 shot, sekitar 24 detik)

**Shot 1 · 6 detik · Kamera: medium, sejajar mata**
- **Gambar:** `[STYLE] [AARA] Aara in a sunny city park, holding up her translator gadget with a curious smile, bright green trees behind her.`
- **Gerak:** `Aara turns the gadget, its small screen lights up, she nods with excitement.`
- **Narasi (Aara):** "Alat penerjemahku bisa membantu kita membaca jejaknya!"

**Shot 2 · 6 detik · Kamera: close-up, tanah**
- **Gambar:** `[STYLE] Close-up of a park path, footprints in the soft ground, a small drawn clue sign on a wooden post showing a picture of a footprint and an arrow (picture only, no letters).`
- **Gerak:** `Camera moves slowly along the footprints toward the sign, a small leaf drops down.`
- **Narasi (Aara):** "Lihat, jejak ini menuju ke arah sana."

**Shot 3 · 6 detik · Kamera: medium, Aara dan Glen**
- **Gambar:** `[STYLE] [GLEN] [AARA] Glen and Aara crouch together in the park, looking at a tree trunk, the gadget held between them.`
- **Gerak:** `They lean closer, the gadget beeps softly, they look at each other and smile.`
- **Narasi (Glen):** "Ayo kita ikuti jejaknya!"

**Shot 4 · 6 detik · Kamera: close-up, kulit ular**
- **Gambar:** `[STYLE] A long, stretched, empty snake skin hanging from a tree branch in the park, shiny green-yellow pattern, looking very long like a rubber band.`
- **Gerak:** `The long skin sways gently in the breeze, Aara and Glen look up with wide eyes.`
- **Narasi (Aara):** "Wah, panjang sekali! Ini pasti dari Ular Melar."

### Ch5: Aara bertemu Nino, Ular Melar (4 shot, sekitar 24 detik)

**Shot 1 · 6 detik · Kamera: wide, di depan gedung**
- **Gambar:** `[STYLE] [GLEN] [AARA] Glen and Aara standing together at the old Barongsai temple door on the hill, sunny day, Aara holding her gadget.`
- **Gerak:** `The door slides open slowly with a soft blue light, Glen waves Aara inside.`
- **Narasi (Glen):** "Ayo masuk, Aara. Ada temanku di dalam."

**Shot 2 · 6 detik · Kamera: medium, dua karakter**
- **Gambar:** `[STYLE] [NINO] [AARA] Nino and Aara meeting in the Lab, Aara's eyes are wide with amazement, Nino gives a friendly wave, the gadget in Aara's hand beeps.`
- **Gerak:** `Aara's gadget beeps and shows a small glow, Nino waves, Aara waves back, they both smile.`
- **Narasi (Nino):** "Halo, Aara! Senang sekali bertemu denganmu."

**Shot 3 · 6 detik · Kamera: wide, lapangan**
- **Gambar:** `[STYLE] [ULAR] [SUPERGLEN] Superglen in a bright open field, facing Ular Melar, the snake's body stretched long and wobbly, a little silly.`
- **Gerak:** `Ular Melar stretches toward Superglen, then wobbles and curls up in a funny way, Superglen holds up a soft glowing bubble-net.`
- **Narasi (Superglen):** "Ular Melar, ayo kita bermain dengan tenang!"

**Shot 4 · 6 detik · Kamera: close-up, akhir**
- **Gambar:** `[STYLE] [ULAR] Ular Melar curls up happily in a soft bubble-net, smiling with a sleepy face, small hearts floating above him.`
- **Gerak:** `Ular Melar gently giggles, the bubble-net sparkles and fades, he curls up and rests.`
- **Narasi (Ular Melar):** "Hehe, aku jadi teman kalian sekarang!"

### Ch6: Tikus Rakus di gudang pasar (4 shot, sekitar 24 detik)

**Shot 1 · 6 detik · Kamera: wide, gudang**
- **Gambar:** `[STYLE] A market warehouse full of sacks of rice, baskets of fruit, and wooden crates, warm dim light from a high window.`
- **Gerak:** `Camera slowly moves through the warehouse, a crate creaks, a sack wobbles.`
- **Narasi (Narator):** "Di gudang pasar, Tikus Rakus sedang makan banyak sekali."

**Shot 2 · 6 detik · Kamera: medium**
- **Gambar:** `[STYLE] [TIKUS] Tikus Rakus sitting on a crate, eating a big banana, his cheeks very full, his belly round, patchwork shorts.`
- **Gerak:** `He takes another big bite, his belly grows bigger and rounder, he grins happily.`
- **Narasi (Tikus Rakus):** "Nyam, nyam! Makin banyak makan, makin besar aku!"

**Shot 3 · 6 detik · Kamera: wide, Superglen datang**
- **Gambar:** `[STYLE] [SUPERGLEN] [TIKUS] Superglen standing near the big Tikus Rakus, who is now much larger, both looking at each other in the warehouse.`
- **Gerak:** `Superglen steps forward confidently, Tikus Rakus wobbles, his belly bounces.`
- **Narasi (Superglen):** "Tikus Rakus, ayo kita cari cara yang lebih sehat!"

**Shot 4 · 6 detik · Kamera: close-up, akhir**
- **Gambar:** `[STYLE] [TIKUS] Tikus Rakus sits happily with a full belly, holding a small basket of vegetables, a little shy smile.`
- **Gerak:** `He pats his belly, gives a small burp with a tiny bubble, and shares the basket, smiling.`
- **Narasi (Tikus Rakus):** "Sayurnya enak juga, ya!"

### Ch7: Elang Belang di langit (4 shot, sekitar 24 detik)

**Shot 1 · 6 detik · Kamera: wide, langit**
- **Gambar:** `[STYLE] [ELANG] Elang Belang flying high in a bright blue sky above Kota Botanica, his blue ice wing and red flame wing spread wide.`
- **Gerak:** `Elang Belang swoops across the sky, his wings flap, soft ice sparkles and warm glow trail behind.`
- **Narasi (Narator):** "Di langit, ada Elang Belang yang sedang terbang cepat."

**Shot 2 · 6 detik · Kamera: follow**
- **Gambar:** `[STYLE] [SUPERGLEN] Superglen flying in the sky above the city, cape-like costume fluttering, determined face.`
- **Gerak:** `Superglen flies forward, camera follows him, the wind rushes past.`
- **Narasi (Superglen):** "Elang Belang, ayo kita terbang bersama!"

**Shot 3 · 6 detik · Kamera: medium, gerakan cepat**
- **Gambar:** `[STYLE] [ELANG] [SUPERGLEN] Superglen and Elang Belang flying close, a soft rainbow ribbon wrapping gently around Elang Belang's wings.`
- **Gerak:** `The rainbow ribbon swirls, Elang Belang's wings slow down, his feathers fluff up softly.`
- **Narasi (Superglen):** "Pelan-pelan saja, ya."

**Shot 4 · 6 detik · Kamera: close-up, akhir**
- **Gambar:** `[STYLE] [ELANG] Elang Belang landing softly on a tree branch, both wings folded, looking calm and happy, sparkles around him.`
- **Gerak:** `He folds his wings, shakes his feathers, and chirps happily.`
- **Narasi (Elang Belang):** "Terima kasih sudah mengajakku terbang!"

### Ch8: Gorilla Gembira di hutan (4 shot, sekitar 24 detik)

**Shot 1 · 6 detik · Kamera: wide, hutan**
- **Gambar:** `[STYLE] A forest on the edge of the city, a few dry blackened tree trunks, a thin wisp of smoke, a small patch of sad empty ground, no big flames.`
- **Gerak:** `Camera slowly moves over the forest, the thin smoke drifts away, a leaf falls.`
- **Narasi (Narator):** "Di hutan, ada hutan yang sedih karena terbakar."

**Shot 2 · 6 detik · Kamera: medium, sedih**
- **Gambar:** `[STYLE] [GORILA] Gorilla Gembira sitting on the ground in the burnt forest, looking sad, head down, small tear-like sparkle, but still gentle and kind.`
- **Gerak:** `He sighs softly, looks up slowly, then sees Superglen coming.`
- **Narasi (Gorila):** "Hutanku sedih sekali..."

**Shot 3 · 6 detik · Kamera: medium, Superglen menolong**
- **Gambar:** `[STYLE] [SUPERGLEN] [GORILA] Superglen spraying a soft cloud of water from a gadget on his glove over small patches of smoke, a gorilla watching nearby.`
- **Gerak:** `The soft water mist spreads, the smoke fades, the gorilla claps his hands.`
- **Narasi (Superglen):** "Tenang, kita bantu bersama-sama!"

**Shot 4 · 6 detik · Kamera: wide, hutan hidup lagi**
- **Gambar:** `[STYLE] [GORILA] [SUPERGLEN] Gorilla Gembira and Superglen standing in a forest with new green sprouts and tiny flowers, bright sunshine, the gorilla smiling widely.`
- **Gerak:** `Little sprouts pop up from the ground, flowers bloom, the gorilla jumps happily, Superglen laughs.`
- **Narasi (Gorila):** "Hore! Hutanku tumbuh lagi!"

### Finale: Pesta kota (5 shot, sekitar 25 detik)

**Shot 1 · 5 detik · Kamera: wide, lapangan kota**
- **Gambar:** `[STYLE] A festive town square in Kota Botanica at sunset, colourful bunting flags, lanterns, families cheering, a stage with a big lion dance costume.`
- **Gerak:** `Camera pans across the crowd, flags flutter, lanterns sway.`
- **Narasi (Narator):** "Kota Botanica mengadakan pesta besar!"

**Shot 2 · 5 detik · Kamera: medium, pertunjukan Barongsai**
- **Gambar:** `[STYLE] A friendly Barongsai lion dance troupe performing on the square, colourful lion costumes, drum and cymbal players, joyful mood.`
- **Gerak:** `The lion costumes dance and bounce, drums beat, the crowd claps.`
- **Narasi (Narator):** "Ada pertunjukan Barongsai yang meriahkan pesta."

**Shot 3 · 5 detik · Kamera: medium, teman-teman**
- **Gambar:** `[STYLE] [GLEN] [AARA] [NINO] [SUPERGLEN] Glen, Aara, Nino, and Superglen standing together on the stage, smiling, waving to the crowd.`
- **Gerak:** `They wave together, Aara holds up her gadget with a sparkle, Nino's light ring glows.`
- **Narasi (Aara):** "Kita semua berhasil!"

**Shot 4 · 5 detik · Kamera: close-up, tim kecil**
- **Gambar:** `[STYLE] [ULAR] [TIKUS] [ELANG] [GORILA] [CURUT] Ular Melar, Tikus Rakus, Elang Belang, Gorilla Gembira, and Curut Cemberut, all friendly and smiling, together at the edge of the crowd.`
- **Gerak:** `The friends wave and dance together, Curut Cemberut gives a small happy smile.`
- **Narasi (Curut Cemberut):** "Hmph... baiklah, aku ikut senang."

**Shot 5 · 5 detik · Kamera: tarik mundur, langit malam kembang api**
- **Gambar:** `[STYLE] Wide night view of Kota Botanica, colourful lanterns and fireworks in the sky, the Barongsai temple on the hill glowing softly.`
- **Gerak:** `Fireworks burst slowly in the sky, the camera pulls back over the city.`
- **Narasi (Narator):** "Malam itu, Kota Botanica bersinar."

### Teaser Superglen 2: Sosok Misterius (3 shot, sekitar 18 detik)

*Catatan: hanya sinematik ini yang menampilkan Sosok Misterius. Pastikan tidak menakutkan: suasana hangat dan lembut, tanpa bayangan gelap yang mencekam.*

**Shot 1 · 6 detik · Kamera: wide, ruangan gelap hangat**
- **Gambar:** `[STYLE] A quiet dim room with soft purple-blue light, a large screen showing a glowing map of Kota Botanica with a few small glowing pins.`
- **Gerak:** `Camera slowly moves toward the screen, the pins blink softly.`
- **Narasi (Narator):** "Ada yang sedang memperhatikan Kota Botanica..."

**Shot 2 · 6 detik · Kamera: medium, silhouette**
- **Gambar:** `[STYLE] [SOSOK] The mysterious silhouette stands in front of the glowing screen, face hidden in soft shadow, a small tech light glows in his hand.`
- **Gerak:** `The silhouette turns slowly toward the screen, the small light blinks once.`
- **Narasi (Sosok Misterius):** "Superglen... kamu akan segera tahu siapa aku."

**Shot 3 · 6 detik · Kamera: close-up, layar, tanda tanya**
- **Gambar:** `[STYLE] Close-up of the glowing screen, one bright pin on the old Barongsai temple on the hill, a small question mark drawn as a picture (no text), soft glow.`
- **Gerak:** `The pin pulses softly, the screen fades to a gentle golden light.`
- **Narasi (Narator):** "Bersambung di Superglen 2."

---

## Bagian 4: Tips praktis

1. **Rasio dan resolusi:** pakai **16:9**. Resolusi **1280x720** sudah cukup untuk game dan lebih ringan untuk iPhone. Tidak perlu 4K.
2. **Durasi per klip:** maksimal **8 detik** per klip. Pilih 5 atau 6 detik jika tersedia, lebih hemat kredit dan lebih mudah diatur.
3. **Nama file:** pakai pola berikut dan simpan semua hasil dengan nama ini.
   - Pembuka: `cin_open_01.mp4` sampai `cin_open_09.mp4`
   - Bab: `cin_ch1_01.mp4` sampai `cin_ch8_04.mp4` (Ch1 punya 3 shot, sisanya 4)
   - Finale: `cin_finale_01.mp4` sampai `cin_finale_05.mp4`
   - Teaser: `cin_teaser_01.mp4` sampai `cin_teaser_03.mp4`
4. **Cara mengirim:** kirim semua file video ke chat. Video akan dikompresi, lalu ditempatkan di folder game.
5. **Alur kredit paling hemat:**
   - **Langkah 1:** buat gambar diam (still) dulu untuk tiap shot. Gambar lebih murah dari video. Coba 2 sampai 3 variasi per shot.
   - **Langkah 2:** pilih gambar terbaik yang paling mirip dengan referensi karakter.
   - **Langkah 3:** baru animasikan (image-to-video) hanya gambar yang sudah dipilih. Jangan animasikan semua variasi.
   - **Langkah 4:** jika satu shot gagal, perbaiki gambarnya dulu, baru animasikan ulang.
6. **Konsistensi:** selalu pakai gambar referensi dari `art/reference/` dan `art/reference/enemies/`. Jika Glen atau Nino terlihat berbeda antar shot, pakai gambar diam yang sudah berhasil sebagai referensi untuk shot lain.
7. **Narasi:** teks narasi **tidak** dibakar ke video. Narasi akan dibuat sebagai audio terpisah (ElevenLabs), sesuai `audio/dialog.json`.

---

## Bagian 5: Hal yang perlu dicek pemilik proyek

- Jumlah kredit Higgsfield untuk 48 shot: periksa estimasi sebelum mulai. Gunakan alur di Tips nomor 5.
- Sinematik pembuka dan Ch1 sama-sama membahas Glen dan pintu gedung. Putuskan apakah sinematik Ch1 diputar setelah pembuka atau dilewati.
- Sosok Misterius hanya muncul di teaser. Pastikan tampilannya tetap ramah untuk anak 5 sampai 6 tahun.
- Barongsai adalah tarian tradisi Tionghoa. Pastikan kostum dan pertunjukannya dihormati saat memilih gambar.
- Narasi dan dialog Bahasa Indonesia perlu diperiksa dengan `audio/dialog.json` agar sama.
