# Model karakter

Sumber (dari pemilik, Tripo + Mixamo): `art/models/source/*.glb`.
Versi web: `public/models/*.glb`, dibuat ulang dengan `npm run models` (script `scripts/build-models.mjs`).

## Hasil inspeksi sumber

| | glen | superglen | nino | aara |
|---|---|---|---|---|
| Ukuran file | 7.90 MB | 7.81 MB | 7.62 MB | 6.33 MB |
| Node / skin / joint | 67 / 1 / 65 | 67 / 1 / 65 | 67 / 1 / 65 | 67 / 1 / 65 |
| Mesh / material | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 |
| Segitiga | 93.885 | 92.910 | 89.380 | 92.132 |
| Tekstur | 3x 1024^2 (2 JPEG + 1 PNG metal/rough) | sama | sama | sama |
| Tinggi (pose bind, m) | 0.98 | 1.00 | 1.00 | 1.00 |
| Sumbu | Y atas, menghadap +Z, kaki di Y=0, skala 1 = 1 m | sama | sama | sama |
| Rig | Mixamo (`mixamorig:Hips` dst.), root `Armature` skala 1 | sama | sama | sama |

Catatan: tinggi sekitar 1 m (chibi); skala di game cukup ditetapkan lewat satu konstanta.
Sumber memuat root motion Mixamo (Hips bergeser di Z: walk 1 m, run 2 m, ride 5 m).

## Hasil web

| | glen | superglen | nino | aara |
|---|---|---|---|---|
| Ukuran | 0.84 MB | 1.15 MB | 0.92 MB | 0.79 MB |
| Segitiga | 16.000 | 16.000 | 16.000 | 16.000 |
| Tekstur | 3x 512^2 WebP | sama | sama | sama |

Proses: weld, simplify meshoptimizer (ke 16k, sumber > 20k), tekstur 512 WebP (q85), resample animasi (toleransi 0.0005), kunci Hips X/Z ke frame 0 (animasi "di tempat", Y tetap), dedup, prune, quantize, `EXT_meshopt_compression` + `EXT_texture_webp` (keduanya dipahami `GLTFLoader` Three.js; set `loader.setMeshoptDecoder(MeshoptDecoder)`). Dicek di Chrome: orientasi, tekstur, skala benar.
Segitiga 16k sedikit di atas target "di bawah 15 ribu" pada CLAUDE.md pemilik; ubah `TARGET_TRIS` di script jika perlu (tekstur dan ukuran file tetap kecil).

## Pemetaan nama klip (asli -> baru)

| Asli | Baru | glen | superglen | nino | aara |
|---|---|---|---|---|---|
| idle.001 (15.4 s) | idle | ya | ya | ya | ya |
| walk.001 (2.4 s) | walk | ya | ya | ya | ya |
| run.001 (1.3 s) | run | ya | ya | ya | ya |
| fall.001 (3.0 s) | fall | - | ya | - | - |
| landing from jumping.001 (5 s) | land | - | ya | - | - |
| front flip mid-air 360.001 (5 s) | jump | - | ya | - | - |
| floating in the air.001 (5 s) | fly | - | ya | ya | - |
| riding a bike.001 (5 s) | ride | ya | - | - | - |
| shoot.001 (9.1 s) | shoot | - | ya | - | - |
| blocking using holographic shield.001 (5 s) | shield | - | ya | - | - |
| hit_to_body_01.001 (1.3 s) | hit | - | ya | - | - |
| jump_rope_01.001 (9.7 s) | skip | - | ya | - | - |
| cheer.001 (12.1 s) | cheer | ya | - | ya | ya |
| wave_goodbye_02.001 (5.9 s) | wave | ya | ya | ya | ya |
| talking.001 (5 s) | talk | - | - | ya | ya |

Catatan: `jump` di superglen sebenarnya front flip (5 s, perlu dipotong/dimainkan sebagian); `land`, `fall`, dan `shoot` juga panjang, mainkan sebagian atau percepat (`timeScale`). Idle 15 s dan cheer 12 s adalah klip panjang, loop saja.

## Klip yang belum ada

- glen: jump, fall, land, hit (hanya idle, walk, run, ride, wave, cheer). Kalau perlu, pakai klip superglen via retarget (rig sama, nama tulang sama: bisa dipakai langsung antar model).
- superglen: ride (tak perlu, Superglen terbang), cheer, talk.
- nino: talk ada; tidak ada shoot/hit/jump (cukup untuk penolong).
- aara: fly, jump, fall, hit, ride.
- Semua: tidak ada klip "kena hit / dijinakkan / menangis" khusus selain `hit` di superglen.
Karena semua model memakai rig Mixamo identik (65 joint, nama sama), klip bisa dipinjam antar karakter dengan `AnimationMixer` karena track bernama sama.
