# Progres Pengembangan KedeAwak

- **Diperbarui:** 28 September 2026
- **Acuan:** `PRD.md`, `SRS.md`, `DESIGN_SYSTEM.md`, `AGENT.md`
- **Baseline kode:** `517a535` pada branch `chore/project-bootstrap`

Dokumen ini mencatat implementasi yang tersedia di repositori, bukan rencana yang dianggap sudah selesai. Perbarui status, bukti file, dan tanggal setiap kali sebuah unit kerja selesai. Prioritaskan kebutuhan P0 di `SRS.md` sebelum P1/P2.

**Arti status:** **Selesai** = tersedia dan telah divalidasi sesuai cakupan yang tertulis; **Sebagian** = baru fondasi atau belum terintegrasi end-to-end; **Belum** = belum ada implementasi. Status modul demo tidak berarti fitur produksi sudah selesai.

## Ringkasan per fase

| Fase | Status | Hasil saat ini | Pekerjaan berikutnya |
|---|---|---|---|
| 1. Monorepo dan fondasi | Sebagian | Git, pnpm workspace, Next.js, TypeScript strict, Tailwind dengan token desain, struktur paket, serta perintah lint/typecheck/test/build tersedia. | PWA belum disiapkan; paket tools, multimodal, dan forecasting masih kerangka. |
| 2. Database dan autentikasi | Sebagian | Migrasi RLS dan pembatasan satu akun–satu warung disiapkan; alur email/kata sandi, callback, serta onboarding awal tersedia. | Hubungkan project Supabase cloud, terapkan dan uji migrasi/RLS, lalu uji daftar–konfirmasi–masuk–onboarding secara nyata. |
| 3. Fitur inti P0 | Sebagian | Pustaka webhook demo, adapter DeepSeek, Context Lock in-memory, dan preview dashboard interaktif tersedia. | Buat endpoint webhook, penyimpanan/antrean persisten, orchestrator, Tool Layer, dan dashboard yang membaca data nyata. |
| 4. Integrasi dan penyempurnaan | Belum | Belum ada alur bisnis terintegrasi. | Tambahkan multimodal, laporan, alert stok, PO dengan persetujuan, serta balasan pelanggan setelah fondasi P0 aman. |

## Pelacakan kebutuhan P0

| Area dan ID SRS | Status | Bukti yang sudah ada | Agar dapat dinyatakan selesai |
|---|---|---|---|
| Auth dan profil warung (`FR-AUTH-01`, `02`, `04`) | Sebagian | `/signup`, `/login`, `/auth/callback`, `/onboarding`, dan `/app` memakai Supabase SSR, `getClaims()`, RLS, serta RPC `create_shop`; migrasi `20260928000001_harden_shop_registration.sql` membatasi satu warung per akun. | Migrasi dan alur end-to-end cloud belum diuji; jam buka, alamat, WA bisnis, OTP WA, dan verifikasi nomor pemilik belum ada. Nomor tidak boleh dipakai untuk otorisasi WA sebelum diverifikasi. |
| Database, RLS, rupiah integer (`NFR-SEC-02`, `FR-FIN-05`) | Sebagian | Tiga migrasi di `supabase/migrations/` dan `packages/db/src/types.ts`. Dua migrasi pertama sudah diterapkan ke project Supabase cloud development; migrasi kolom keterangan penjualan belum diterapkan. | Terapkan migrasi terbaru, tambah uji lintas-`shop_id`, dan gunakan transaksi DB untuk operasi multi-tabel. |
| WhatsApp (`FR-WA-01`–`06`, `10`) | Sebagian | `packages/whatsapp/src/`, tes webhook, dan `scripts/simulate-whatsapp-webhook.mjs` mendukung verifikasi signature, parsing teks/media, dan deduplikasi in-memory. | Endpoint HTTP, verifikasi Meta, penyimpanan sebelum respons 200, antrean/worker persisten, unduh media, dan pengiriman WA belum dibuat. Deduplikasi memori hanya untuk demo. |
| AI dan keamanan peran (`FR-AI-01`–`07`, `09`) | Sebagian | `packages/agent/src/deepseek-client.ts` memvalidasi respons dan tidak mengeksekusi tool secara otomatis. | Pemilihan prompt/tool menurut peran, orchestrator, RAG, batas kuota, dan `agent_logs` belum terintegrasi. |
| Context Lock dan HITL (`FR-HITL-01`–`05`) | Sebagian | `packages/agent/src/context-lock.ts` dengan TTL, konsumsi persetujuan sekali, dan tes per warung. | Hubungkan sesi tepercaya, balasan WA/dashboard, penyimpanan Redis, notifikasi kedaluwarsa, audit persisten, dan eksekusi PO yang hanya terjadi setelah persetujuan. |
| Input multimodal (`FR-MM-01`–`04`) | Belum | Paket `packages/multimodal/` masih kerangka. | STT Bahasa Indonesia, OCR terstruktur, ambang keyakinan, dan konfirmasi sebelum pencatatan. |
| Pesanan, penjualan, pembayaran (`FR-ORD-01`–`03`, `05`–`06`; `FR-PAY-01`–`03`, `05`) | Belum | Tabel pesanan, penjualan, dan bukti bayar baru ada dalam migrasi. | Tool transaksional dan idempoten, alur status, pemeriksaan bukti indikatif, serta tes. |
| Inventaris dan alert (`FR-INV-01`–`03`) | Belum | Tabel produk dan stok baru ada dalam migrasi. | CRUD produk, pengurangan stok atomik, notifikasi ambang minimum. |
| Pengeluaran dan laporan (`FR-FIN-01`; `FR-RPT-01`, `02`, `05`) | Sebagian | Dashboard `/app` mencatat uang masuk (`sales`) dan uang keluar (`expenses`) memakai `shop_id` dari keanggotaan tepercaya, validasi server, dan nominal integer rupiah; ringkasan harian serta riwayat memakai zona waktu Asia/Jakarta. | Belum ada kategori pengeluaran, filter periode selain hari ini, agregasi SQL, ekspor laporan, dan uji RLS langsung. |
| Supplier dan PO (`FR-PO-01`–`04`, `06`) | Belum | Tabel supplier/PO tersedia; penulisan PO langsung dari klien diblokir dalam RLS. | Kelola supplier, buat draft, validasi persetujuan di backend, kirim ke supplier, uji tolak/ubah/kedaluwarsa. |
| Balasan pelanggan (`FR-CS-01`, `02`) | Belum | Belum ada balasan otomatis atau pengambilalihan. | Jawaban hanya dari data warung, kendali pemilik, dan pembatasan tool pelanggan. |
| Dashboard dan kuota (`FR-DASH-01`–`05`; `FR-QUOTA-01`, `02`) | Sebagian | `/app` menampilkan ringkasan kas hari ini dan riwayat dari database warung; `/demo` tetap menjadi preview sintetis. | Pesanan, produk/stok, notifikasi, dan kuota belum terhubung; PWA belum tersedia. |

## Validasi yang sudah dilakukan

Pada baseline `bb8b334`, perintah `pnpm lint`, `pnpm typecheck`, `pnpm test` (24 tes) dan `pnpm build` lulus. Setelah alur auth ditambahkan, keempat perintah dijalankan ulang dan 36 tes lulus. Setelah pencatatan kas ditambahkan, keempat perintah kembali lulus dengan **53 tes**, termasuk validasi nominal, rentang hari Asia/Jakarta, pemetaan ke tabel yang benar, penolakan peran non-pemilik, dan pengabaian `shop_id` dari formulir. Alur auth sudah dicoba manual oleh pemilik pada project Supabase cloud (daftar, konfirmasi email, masuk, keluar, onboarding). Belum ada tes otomatis lintas-`shop_id` (RLS) maupun E2E skenario S1–S5.

## Urutan kerja berikutnya

1. Tinjau dan terapkan migrasi `20260928000002_add_sale_description.sql` ke project Supabase cloud setelah memeriksa dengan `--dry-run`; tambah uji RLS antarwarung. Konfirmasi penyedia serta dimensi embedding sebelum membuat indeks vektor.
2. Verifikasi nomor pemilik sebelum dipakai sebagai identitas WhatsApp; kemudian koneksikan webhook ke penyimpanan dan antrean yang persisten sebelum memberikan respons sukses.
3. Implementasikan Tool Layer minimal dengan skema Zod, transaksi atomik, idempotensi, pembatasan peran, dan log audit; baru hubungkan ke adapter DeepSeek.
4. Bangun alur demo P0 S1–S5 dan dashboard dengan data nyata. Sambungkan Context Lock ke persetujuan PO; jangan mengirim ke supplier sebelum persetujuan eksplisit.
5. Setelah alur teks stabil, lanjutkan STT/OCR dan fitur P0 lainnya. Redis dan Meta Cloud API menggantikan komponen in-memory/simulator sebelum penggunaan produksi.

**Batasan saat ini:** `/demo` tetap memakai transaksi, produk, dan pesanan sintetis; pencatatan baru hilang saat halaman dimuat ulang. `/app` hanya menampilkan profil warung jika Supabase terhubung, bukan dashboard operasional. Jangan memakai modul in-memory untuk data atau persetujuan produksi. API key DeepSeek hanya boleh disediakan lewat environment server. `.env.example` masih merupakan berkas lokal yang belum di-commit; periksa isinya sebelum memutuskan untuk melacaknya di Git.
