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
├── core/      loop fixed-timestep, renderer, auto-degrade kualitas, Config
├── physics/   wrapper Rapier + helper raycast
├── robot/     rig, gait prosedural, IK kaki, character controller
├── input/     keyboard, gamepad PS, sentuh -> satu InputState
├── camera/    kamera follow tanpa mouse
├── game/      bintang, mainan, konfeti
├── world/     taman bermain, pencahayaan, factory bentuk
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
- **Semua konstanta tuning ada di `src/core/Config.ts`.** Ubah di situ.

## Anggaran performa

| Bagian | Ukuran |
| --- | --- |
| CSS + HTML + UI | ~24 KB gzip |
| three.js (dimuat awal) | ~134 KB gzip |
| Rapier (malas, saat MULAI) | ~830 KB gzip |

DPR dibatasi 1.5, dan `core/Quality.ts` otomatis menurunkan DPR lalu mematikan
bayangan bila frame rate turun di bawah 45 FPS — anak tidak perlu menemukan menu
grafis.

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
