# Robotgen

Kendali robot untuk anak usia 5–6 tahun. Kumpulkan semua bintang di taman
bermain — tanpa timer, tanpa nyawa, tanpa kalah.

Dibangun dengan [Three.js](https://threejs.org/) + [Rapier](https://rapier.rs/)
(fisika rigid-body), berjalan di desktop (keyboard + stick PlayStation) maupun
tablet/HP (kontrol sentuh).

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc --noEmit && vite build -> dist/
npm run preview  # cek hasil build
```

Tambahkan `?debug` pada URL untuk panel tuning (`lil-gui`) dan garis fisika
Rapier.

## Kontrol

Tidak ada mouse sama sekali: kamera mengikuti robot dengan sendirinya, jadi anak
hanya perlu menekan arah.

| Aksi | Keyboard | PlayStation | Sentuh |
| --- | --- | --- | --- |
| Jalan / lari | `W A S D` atau `↑ ← ↓ →` | Stick kiri | Joystick mengambang di separuh kiri layar |
| Lompat | `Space` | ✕ | Tombol besar kanan bawah |
| Putar kamera | `Q` / `E` | Stick kanan | Seret di separuh kanan layar |
| Berhenti sebentar | `Esc` / `P` | Options | Tombol ⏸ kanan atas |

Dorong stick penuh untuk lari. Keyboard, controller, dan sentuh bisa dipakai
bergantian tanpa restart — game mendeteksi perangkat yang terakhir digunakan.

## Cara kerjanya

```
src/
├── core/      loop fixed-timestep, renderer, tingkat kualitas, deteksi perangkat
├── physics/   wrapper Rapier + helper raycast
├── robot/     rig, gait prosedural, IK kaki, character controller
├── input/     keyboard, gamepad PS, sentuh -> satu InputState
├── camera/    kamera follow tanpa mouse
├── game/      bintang, mainan, konfeti
├── world/     taman bermain, pencahayaan, snapping bayangan, factory bentuk
├── audio/     efek suara WebAudio (disintesis, tanpa file aset)
└── ui/        start screen, HUD, pause, panel debug
```

Beberapa keputusan yang perlu diketahui sebelum mengubah kode:

- **Robot tidak bisa roboh.** Ia memakai `KinematicCharacterController` Rapier:
  autostep 0.35 m, snap-to-ground, bisa naik lereng 50°. Robot tidak bisa
  didorong hingga jatuh dan tidak bisa tersangkut. Untuk anak 6 tahun ini
  disengaja — frustrasi adalah musuh terbesar.
- **Mainan tetap fisika penuh.** Balok, bola, dan jungkat-jungkit adalah rigid
  body sungguhan yang bisa ditabrak, ditumpuk, dan digulingkan
  (`setApplyImpulsesToDynamicBodies`). Di sinilah sensasi "fisika nyata" datang.
- **Autostep sengaja tidak menginjak body dinamis**
  (`enableAutostep(0.35, 0.2, false)`), supaya robot **mendorong** mainan
  alih-alih menaikinya.
- **IK diselesaikan di fase render**, bukan di dalam fixed step. Kalau dihitung
  per tick lalu diinterpolasi, kaki akan bergetar.
- **Kaki yang menapak dipaku di koordinat dunia**, jadi tidak ada foot sliding
  saat berjalan. `dragIntoReach()` di `robot/Gait.ts` hanya menyeret kaki
  kembali ketika badan sudah keluar dari jangkauan (mulai jalan dari diam,
  berhenti mendadak, atau balik arah) — lebih baik daripada kaki teregang lurus.
- **Rapier dimuat malas** (`await import()` setelah tombol MULAI). Chunk-nya
  besar (~830 KB gzip karena WASM di-inline base64), dan halaman pertama harus
  tetap ringan.
- **Prop statis di-batch jadi `InstancedMesh` per jenis bentuk.** Efek sampingnya:
  roughness jadi seragam per jenis (kotak 0.7, bola 0.95), jadi perosotan tidak
  lagi lebih licin dari batu. Pada gaya kartun ini tidak terlihat.
- **Semua konstanta tuning ada di `src/core/Config.ts`,** dan tingkat kualitas di
  `src/core/DeviceProfile.ts`.

## Performa

Targetnya PC entry-level: Intel HD/UHD dengan 2 core. Anggaran ukuran:

| Bagian | Ukuran |
| --- | --- |
| CSS + HTML + UI | ~26 KB gzip |
| three.js (dimuat awal) | ~134 KB gzip |
| Rapier (malas, saat MULAI) | ~830 KB gzip |

Biaya render ditahan dengan empat hal:

1. **Bayangan mengikuti robot dengan extent kecil.** Kamera bayangan hanya
   selebar 7–18 m mengelilingi robot, bukan seluruh taman. Ini **sekaligus**
   menaikkan kualitas *dan* memangkas biaya: tier `Rendah` memberi 36 texel/m,
   sedangkan peta seluruh taman sebelumnya hanya 13 texel/m. Targetnya di-snap
   ke kisi texel di basis cahaya supaya tepi bayangan tidak merayap
   (`src/world/shadowSnap.ts`).
2. **MSAA hanya di tier `Tinggi`.** `antialias` tidak bisa diubah setelah
   context WebGL dibuat, jadi nilainya ditentukan saat `WebGLRenderer` dibuat.
3. **Semua prop statis di-batch.** Taman berisi ~105 collider tapi hanya
   **8 draw call** (tanah 1, kotak/silinder/bola instanced 3, pohon 2, bunga 2) —
   sebelumnya 89 mesh terpisah. Collider tetap satu per prop.
4. **Matrix statis dibekukan.** Mesh dan bagian robot yang tidak pernah bergerak
   memakai `matrixAutoUpdate = false`.

### Tingkat kualitas

Pilihannya ada di menu pause (untuk orang tua, bukan anak) dan disimpan di
`localStorage`:

| Tingkat | Pixel ratio | MSAA | Bayangan | Extent bayangan |
| --- | --- | --- | --- | --- |
| Sangat Rendah | 0.65 | tidak | mati | — |
| Rendah | 0.85 | tidak | 512 | 7 m |
| Sedang | 1.0 | tidak | 1024 | 14 m |
| Tinggi | 1.3 | ya | 1024 PCFSoft | 18 m |

Default-nya **Otomatis**: tingkat awal ditebak dari string GPU
(`WEBGL_debug_renderer_info`) plus jumlah core dan RAM, lalu FPS diukur tiap
detik dan tingkatnya naik/turun sendiri. Naik satu tingkat butuh 6 detik stabil
di atas 57 FPS; turun butuh 2 detik di bawah 40 FPS. Kalau sebuah kenaikan gagal
bertahan, tingkat itu diblokir untuk sesi itu supaya tidak bolak-balik.

Kalau masih kurang lancar, buka menu pause dan pilih **Sangat Rendah**.
Nyalakan juga **Statistik** untuk melihat `fps · ms · draw · triangle · tingkat`
di kiri bawah.

### Mengukur

Tambahkan `?debug` untuk panel tuning `lil-gui` dan garis fisika Rapier. Untuk
memeriksa beban render, pakai baris Statistik di menu pause — angka `draw` adalah
jumlah draw call per frame termasuk pass bayangan.

## Deploy ke Cloudflare Pages

Sambungkan repo GitHub ini di dashboard Cloudflare:

1. **Workers & Pages → Create → Pages → Connect to Git**
2. Pilih repo `teguh-santoso/robotgen`, branch produksi `main`
3. Framework preset **Vite**, lalu:
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Node version diambil dari `.nvmrc` (22)

Tidak perlu secret atau GitHub Actions: setiap push ke `main` memicu build dan
deploy otomatis, dan branch lain mendapat preview URL.

`public/_headers` sudah mengatur cache `immutable` untuk `/assets/*` sehingga
chunk Rapier dan three.js yang ber-hash tidak diunduh ulang.

WASM Rapier di-inline sebagai base64 di dalam bundle JS, jadi tidak ada MIME
type `application/wasm` yang perlu dikonfigurasi di server.

## Lisensi

Apache-2.0 — lihat [LICENSE](LICENSE).
