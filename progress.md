# Progres Pengembangan KedeAwak

- **Diperbarui:** 28 September 2026
- **Acuan:** `PRD.md`, `SRS.md`, `DESIGN_SYSTEM.md`, `AGENT.md`
- **Baseline kode:** `9b9821c` pada branch `chore/project-bootstrap`

Dokumen ini mencatat implementasi yang tersedia di repositori, bukan rencana yang dianggap sudah selesai. Perbarui status, bukti file, dan tanggal setiap kali sebuah unit kerja selesai. Prioritaskan kebutuhan P0 di `SRS.md` sebelum P1/P2.

**Arti status:** **Selesai** = tersedia dan telah divalidasi sesuai cakupan yang tertulis; **Sebagian** = baru fondasi atau belum terintegrasi end-to-end; **Belum** = belum ada implementasi. Status modul demo tidak berarti fitur produksi sudah selesai.

## Ringkasan per fase

| Fase | Status | Hasil saat ini | Pekerjaan berikutnya |
|---|---|---|---|
| 1. Monorepo dan fondasi | Sebagian | Git, pnpm workspace, Next.js, TypeScript strict, Tailwind dengan token desain, perintah lint/typecheck/test/build, dan PWA dasar belum ada. | PWA/manifest, CI, dan paket `tools` serta `multimodal`/`forecasting` masih kerangka. |
| 2. Database dan autentikasi | Sebagian | Lima migrasi tersedia; auth email/kata sandi, konfirmasi, onboarding, dan RLS sudah dipakai pada project cloud development. | Terapkan migrasi `00003` dan `00004`, tambah uji RLS otomatis, verifikasi nomor pemilik. |
| 3. Fitur inti P0 | Sebagian | Dashboard operasional, produk/stok, pesanan, transaksi, laporan, utang, supplier, pengaturan, webhook WhatsApp masuk, dan asisten baca-saja tersedia. | Balasan otomatis, PO dengan HITL, multimodal, kuota, dan notifikasi realtime. |
| 4. Integrasi dan penyempurnaan | Belum | Belum ada alur end-to-end WhatsApp → pesanan → pembayaran. | Sambungkan pesan masuk ke pesanan, verifikasi bukti bayar, dan alur PO. |

## Halaman aplikasi

| Halaman | Status | Catatan |
|---|---|---|
| `/` pintu masuk, `/signup`, `/login`, `/auth/callback`, `/onboarding` | Sebagian | Sudah dicoba pemilik pada project Supabase cloud. Belum ada OTP WhatsApp dan reset kata sandi. |
| `/app` ringkasan | Sebagian | Ringkasan kas hari ini, peringatan stok menipis, pencatatan cepat, riwayat terbaru. Belum ada notifikasi realtime dan ringkasan periode lain. |
| `/app/transaksi` (rute `/app/riwayat`) | Sebagian | Filter periode, total per rentang, batas 200 baris. Belum ada paginasi dan ekspor. |
| `/app/produk` | Sebagian | CRUD produk, stok opname dengan alasan ke `audit_logs`, ambang minimum, hapus dengan konfirmasi. Prediksi restok (FR-INV-06) belum ada. |
| `/app/pesanan` | Sebagian | Buat pesanan, ubah status lewat RPC, penyelesaian mencatat penjualan dan mengurangi stok secara atomik. Belum ada bukti bayar/OCR. |
| `/app/laporan` | Sebagian | Periode hari/7/30/bulan, ringkasan, grafik sederhana, produk terlaris. Ekspor PDF/XLSX (P2) belum ada. |
| `/app/utang` | Sebagian | Catat utang, pelunasan sebagian/penuh, status otomatis. Pelunasan belum atomik dan jejak audit belum tertulis. |
| `/app/supplier` | Sebagian | CRUD supplier. PO dan pengiriman ke supplier belum tersedia karena penulisan PO diblokir RLS. |
| `/app/pengaturan` | Sebagian | Ubah profil warung dan balasan otomatis. Koneksi WhatsApp belum aktif. |
| `/app/whatsapp` | Sebagian | Status koneksi, daftar percakapan, isi pesan masuk. Belum ada balasan otomatis dan kirim pesan keluar. |
| `/app/asisten` | Sebagian | Chat dengan tool baca-saja (`check_stock`, `get_report`). Butuh `LLM_API_KEY`; belum ada `agent_logs`, kuota, dan aksi tulis. |
| `/demo` | Selesai | Preview sintetis untuk memperlihatkan tampilan tanpa akun. |

## Pelacakan kebutuhan P0

| Area dan ID SRS | Status | Bukti yang sudah ada | Agar dapat dinyatakan selesai |
|---|---|---|---|
| Auth (`FR-AUTH-01`, `02`) | Sebagian | Alur email/kata sandi, konfirmasi email, onboarding, RPC `create_shop`, dan pembatasan satu warung per akun; sudah dicoba manual di cloud. | OTP WhatsApp, pemulihan kata sandi, dan pengujian otomatis alur auth. |
| Peran dan nomor WA (`FR-AUTH-03`, `04`) | Sebagian | Peran `owner`/`staff` dibatasi di UI dan aksi server; nomor pemilik disimpan tetapi belum diverifikasi. | Verifikasi nomor sebelum dipakai mengenali instruksi WhatsApp; dukungan karyawan penuh. |
| WhatsApp masuk (`FR-WA-01`–`05`, `09`, `10`) | Sebagian | `packages/whatsapp`, `apps/web/src/app/api/whatsapp/webhook/route.ts`, dan `/app/whatsapp`; verifikasi tanda tangan, idempotensi, dan penyimpanan pesan. | Unduh media via Graph API, status pengiriman, dan pengujian dengan Meta sungguhan. |
| WhatsApp keluar (`FR-WA-06`–`08`) | Belum | Belum ada pengiriman pesan dan template. | Kirim pesan keluar, template di luar jendela 24 jam, catat status. |
| AI dan keamanan peran (`FR-AI-01`–`09`) | Sebagian | `apps/web/src/lib/assistant.ts` dan `/app/asisten` memakai adapter DeepSeek dengan tool baca-saja, validasi Zod, dan pesan setup bila kunci belum ada. | `agent_logs`, batas kuota, pemilihan prompt per peran, dan larangan tool tulis sudah sebagian; percakapan multi-giliran belum ada. |
| Context Lock dan HITL (`FR-HITL-01`–`05`) | Sebagian | `packages/agent/src/context-lock.ts` diuji untuk setuju/tolak/ubah/kedaluwarsa. | Hubungkan ke Redis dan balasan WhatsApp/dashboard; belum ada aksi berisiko yang dieksekusi. |
| Input multimodal (`FR-MM-01`–`04`) | Belum | Paket `packages/multimodal/` masih kerangka. | STT Bahasa Indonesia, OCR terstruktur, ambang keyakinan, konfirmasi pengguna. |
| Pesanan dan penjualan (`FR-ORD-01`–`06`) | Sebagian | `/app/pesanan` membuat pesanan, mengubah status, dan menyelesaikan lewat `complete_order` yang mencatat penjualan serta stok. | Notifikasi pesanan baru, ubah/batal dari chat, dan pesanan otomatis dari pesan pelanggan. |
| Verifikasi pembayaran (`FR-PAY-01`–`05`) | Belum | Baru berupa penandaan indikatif di `/app/pesanan`; belum ada unggah/ekstraksi bukti dan deteksi duplikat. | Ekstraksi bukti bayar dan pencocokan nominal. |
| Inventaris (`FR-INV-01`–`05`, `07`) | Sebagian | CRUD produk, stok opname dengan alasan, ambang minimum, peringatan stok menipis di `/app`. | Pencocokan alias/embedding dan prediksi restok (FR-INV-06). |
| Pengeluaran dan laporan (`FR-FIN-01`, `FR-RPT-01`, `02`, `05`) | Sebagian | Pencatatan uang masuk/keluar, `/app/laporan` dengan periode dan produk terlaris, semua nominal integer rupiah dan dihitung kode. | Kategori pengeluaran, agregasi SQL untuk volume besar, ekspor laporan. |
| Hutang (`FR-FIN-02`–`04`) | Sebagian | `/app/utang` mencatat utang dan pelunasan dengan status otomatis. | Pelunasan atomik dan jejak audit yang benar-benar tertulis. |
| Supplier dan PO (`FR-PO-01`–`06`) | Belum | CRUD supplier ada; penulisan PO tetap diblokir karena alur persetujuan belum dibangun. | Draft PO, HITL, pengiriman, dan konfirmasi barang diterima. |
| Balasan otomatis pelanggan (`FR-CS-01`–`05`) | Belum | Belum ada. | Jawaban dari data warung, kendali pemilik, eskalasi. |
| Dashboard (`FR-DASH-01`–`06`) | Sebagian | Ringkasan, stok menipis, dan seluruh halaman operasional tersedia. | Pusat notifikasi, realtime, dan grafik ringkasan periode lain. |
| Kuota (`FR-QUOTA-01`, `02`) | Belum | Hanya penghitung pemakaian harian yang ditampilkan; pembatasan belum aktif. | Rate limit di Redis dan pemberitahuan kuota habis. |

## Migrasi database

| Migrasi | Status penerapan |
|---|---|
| `20260928000000_initial_schema.sql` | Diterapkan pada project cloud development. |
| `20260928000001_harden_shop_registration.sql` | Diterapkan pada project cloud development. |
| `20260928000002_add_sale_description.sql` | Diterapkan pada project cloud development. |
| `20260928000003_order_completion.sql` | **Belum diterapkan.** Berisi RPC `set_order_status` dan `complete_order` serta pencabutan UPDATE langsung pada `orders`. |
| `20260928000004_audit_log_insert_policy.sql` | **Belum diterapkan.** Kebijakan INSERT jejak audit untuk pemilik. |

Tanpa `00003`, halaman pesanan akan gagal menyimpan perubahan status dan penyelesaian pesanan. Tanpa `00004`, stok opname produk menolak ditulis karena jejak audit gagal disimpan.

## Validasi yang sudah dilakukan

`pnpm lint`, `pnpm typecheck`, `pnpm test`, dan `pnpm build` lulus. Total **242 tes** (218 web, 8 WhatsApp, 16 agent) mencakup validasi nominal, zona waktu Asia/Jakarta, pemetaan tabel yang benar, penolakan peran non-pemilik, pengabaian `shop_id` dari formulir, perhitungan total pesanan, saldo utang, dan verifikasi tanda tangan webhook. Pemilik sudah mencoba manual di project cloud: daftar, konfirmasi email, masuk, keluar, onboarding, pencatatan kas, dan halaman produk. Belum ada tes otomatis lintas-`shop_id` (RLS) terhadap database nyata, pengujian webhook dengan Meta, atau E2E skenario S1–S5.

## Urutan kerja berikutnya

1. Terapkan migrasi `00003` dan `00004` setelah ditinjau, lalu uji pesanan, stok opname, dan isolasi RLS antarwarung.
2. Sambungkan pesan WhatsApp masuk menjadi pesanan dan verifikasi bukti bayar, termasuk unduh media.
3. Bangun alur PO dengan Context Lock di Redis sebagai aksi berisiko pertama dengan persetujuan pemilik.
4. Tambahkan balasan otomatis pelanggan dengan batas peran dan kendali pemilik.
5. Setelah alur teks stabil, kerjakan multimodal (STT/OCR), kuota, notifikasi realtime, dan PWA.

## Batasan saat ini

- Halaman pesanan dan jejak audit belum berfungsi sampai migrasi `00003` dan `00004` diterapkan.
- Webhook WhatsApp memerlukan `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID`, `SUPABASE_URL`, dan `SUPABASE_SERVICE_ROLE_KEY`; unduh media belum ada, dan balasan otomatis belum aktif.
- Asisten memerlukan `LLM_API_KEY` dan `LLM_MODEL` di `apps/web/.env.local` (tanpa awalan `NEXT_PUBLIC_`). Tanpa kunci itu, halaman hanya menampilkan panduan setup.
- Beberapa total laporan memakai pembacaan PostgREST dengan batas 1000 baris; volume besar perlu agregasi SQL.
- Pelunasan utang dan pembuatan pesanan belum atomik, dan percakapan tidak memiliki batasan unik per pelanggan.
- `/demo` tetap memakai data sintetis; jangan memakai modul in-memory untuk produksi.
- `.env.example` masih berupa berkas lokal yang belum di-commit; jangan isi kunci nyata ke berkas yang dilacak Git.
