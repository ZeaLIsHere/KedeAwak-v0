# Progres Pengembangan KedeAwak

- **Diperbarui:** 28 September 2026
- **Acuan:** `PRD.md`, `SRS.md`, `DESIGN_SYSTEM.md`, `AGENT.md`
- **Baseline kode:** `bb8b334` pada branch `chore/project-bootstrap`

Dokumen ini mencatat implementasi yang tersedia di repositori, bukan rencana yang dianggap sudah selesai. Perbarui status, bukti file, dan tanggal setiap kali sebuah unit kerja selesai. Prioritaskan kebutuhan P0 di `SRS.md` sebelum P1/P2.

**Arti status:** **Selesai** = tersedia dan telah divalidasi sesuai cakupan yang tertulis; **Sebagian** = baru fondasi atau belum terintegrasi end-to-end; **Belum** = belum ada implementasi. Status modul demo tidak berarti fitur produksi sudah selesai.

## Ringkasan per fase

| Fase | Status | Hasil saat ini | Pekerjaan berikutnya |
|---|---|---|---|
| 1. Monorepo dan fondasi | Sebagian | Git, pnpm workspace, Next.js, TypeScript strict, Tailwind dengan token desain, struktur paket, serta perintah lint/typecheck/test/build tersedia. | PWA belum disiapkan; paket tools, multimodal, dan forecasting masih kerangka. |
| 2. Database dan autentikasi | Sebagian | Migrasi awal berisi tabel SRS dan RLS per warung; tipe data awal tersedia. | Jalankan dan uji migrasi di Supabase lokal, uji isolasi tenant, buat auth dan onboarding pemilik. |
| 3. Fitur inti P0 | Sebagian | Pustaka webhook demo, adapter DeepSeek, Context Lock in-memory, dan halaman awal tersedia. | Buat endpoint webhook, penyimpanan/antrean persisten, orchestrator, Tool Layer, dan dashboard yang membaca data nyata. |
| 4. Integrasi dan penyempurnaan | Belum | Belum ada alur bisnis terintegrasi. | Tambahkan multimodal, laporan, alert stok, PO dengan persetujuan, serta balasan pelanggan setelah fondasi P0 aman. |

## Pelacakan kebutuhan P0

| Area dan ID SRS | Status | Bukti yang sudah ada | Agar dapat dinyatakan selesai |
|---|---|---|---|
| Auth dan profil warung (`FR-AUTH-01`, `02`, `04`) | Sebagian | Tabel `shops` dan `users` dalam `supabase/migrations/20260928000000_initial_schema.sql`. | Auth, pendaftaran/profil, dan pemetaan nomor pengirim tepercaya belum dibuat. |
| Database, RLS, rupiah integer (`NFR-SEC-02`, `FR-FIN-05`) | Sebagian | Migrasi awal dan `packages/db/src/types.ts`. | Migrasi belum diterapkan; uji lintas-`shop_id` serta transaksi DB belum ada. |
| WhatsApp (`FR-WA-01`–`06`, `10`) | Sebagian | `packages/whatsapp/src/`, tes webhook, dan `scripts/simulate-whatsapp-webhook.mjs` mendukung verifikasi signature, parsing teks/media, dan deduplikasi in-memory. | Endpoint HTTP, verifikasi Meta, penyimpanan sebelum respons 200, antrean/worker persisten, unduh media, dan pengiriman WA belum dibuat. Deduplikasi memori hanya untuk demo. |
| AI dan keamanan peran (`FR-AI-01`–`07`, `09`) | Sebagian | `packages/agent/src/deepseek-client.ts` memvalidasi respons dan tidak mengeksekusi tool secara otomatis. | Pemilihan prompt/tool menurut peran, orchestrator, RAG, batas kuota, dan `agent_logs` belum terintegrasi. |
| Context Lock dan HITL (`FR-HITL-01`–`05`) | Sebagian | `packages/agent/src/context-lock.ts` dengan TTL, konsumsi persetujuan sekali, dan tes per warung. | Hubungkan sesi tepercaya, balasan WA/dashboard, penyimpanan Redis, notifikasi kedaluwarsa, audit persisten, dan eksekusi PO yang hanya terjadi setelah persetujuan. |
| Input multimodal (`FR-MM-01`–`04`) | Belum | Paket `packages/multimodal/` masih kerangka. | STT Bahasa Indonesia, OCR terstruktur, ambang keyakinan, dan konfirmasi sebelum pencatatan. |
| Pesanan, penjualan, pembayaran (`FR-ORD-01`–`03`, `05`–`06`; `FR-PAY-01`–`03`, `05`) | Belum | Tabel pesanan, penjualan, dan bukti bayar baru ada dalam migrasi. | Tool transaksional dan idempoten, alur status, pemeriksaan bukti indikatif, serta tes. |
| Inventaris dan alert (`FR-INV-01`–`03`) | Belum | Tabel produk dan stok baru ada dalam migrasi. | CRUD produk, pengurangan stok atomik, notifikasi ambang minimum. |
| Pengeluaran dan laporan (`FR-FIN-01`; `FR-RPT-01`, `02`, `05`) | Belum | Tabel pengeluaran dan penjualan baru ada dalam migrasi. | Tool pengeluaran dan agregasi laporan deterministik dari data warung. |
| Supplier dan PO (`FR-PO-01`–`04`, `06`) | Belum | Tabel supplier/PO tersedia; penulisan PO langsung dari klien diblokir dalam RLS. | Kelola supplier, buat draft, validasi persetujuan di backend, kirim ke supplier, uji tolak/ubah/kedaluwarsa. |
| Balasan pelanggan (`FR-CS-01`, `02`) | Belum | Belum ada balasan otomatis atau pengambilalihan. | Jawaban hanya dari data warung, kendali pemilik, dan pembatasan tool pelanggan. |
| Dashboard dan kuota (`FR-DASH-01`–`05`; `FR-QUOTA-01`, `02`) | Sebagian | `apps/web/src/app/` berisi halaman awal responsif tanpa angka bisnis rekaan. | Auth, halaman dan data nyata, notifikasi, kuota harian; PWA belum tersedia. |

## Validasi yang sudah dilakukan

Pada baseline `bb8b334`, perintah `pnpm lint`, `pnpm typecheck`, `pnpm test` (**24 tes lulus**) dan `pnpm build` lulus. Tes yang ada hanya mencakup pustaka webhook, Context Lock, dan klien DeepSeek dengan respons tiruan. Belum ada tes integrasi, E2E skenario S1–S5, atau uji RLS langsung di PostgreSQL. Migrasi belum dijalankan karena Supabase CLI tidak tersedia di lingkungan pengembangan saat itu.

## Urutan kerja berikutnya

1. Siapkan Supabase lokal dan jalankan migrasi; tambah uji RLS untuk anggota, pemilik, dan akses lintas warung. Konfirmasi penyedia serta dimensi embedding sebelum membuat indeks vektor.
2. Implementasikan auth dan identitas warung/nomor WA tepercaya, lalu koneksikan webhook ke penyimpanan dan antrean yang persisten sebelum memberikan respons sukses.
3. Implementasikan Tool Layer minimal dengan skema Zod, transaksi atomik, idempotensi, pembatasan peran, dan log audit; baru hubungkan ke adapter DeepSeek.
4. Bangun alur demo P0 S1–S5 dan dashboard dengan data nyata. Sambungkan Context Lock ke persetujuan PO; jangan mengirim ke supplier sebelum persetujuan eksplisit.
5. Setelah alur teks stabil, lanjutkan STT/OCR dan fitur P0 lainnya. Redis dan Meta Cloud API menggantikan komponen in-memory/simulator sebelum penggunaan produksi.

**Batasan saat ini:** Jangan memakai modul in-memory untuk data atau persetujuan produksi. API key DeepSeek hanya boleh disediakan lewat environment server. `.env.example` masih merupakan berkas lokal yang belum di-commit; periksa isinya sebelum memutuskan untuk melacaknya di Git.
