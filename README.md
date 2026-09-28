# KedeAwak

Asisten bisnis AI untuk warung dan UMKM yang dirancang untuk terhubung dengan WhatsApp. Kebutuhan produk ada di `PRD.md`, kebutuhan teknis di `SRS.md`, aturan kerja di `AGENT.md`, dan status implementasi di `progress.md`.

## Status implementasi

- Monorepo pnpm dengan aplikasi Next.js dan paket untuk database, agent, tools, WhatsApp, multimodal, serta forecasting. Turborepo belum dipakai: workspace pnpm cukup untuk paket yang aktif saat ini.
- Preview dashboard responsif tetap tersedia di `/demo` dengan data sintetis.
- Aplikasi pemilik di `/app` mencakup ringkasan kas, transaksi, produk dan stok, pesanan, laporan, utang, supplier, pengaturan, integrasi WhatsApp masuk, dan asisten baca-saja.
- Pendaftaran/masuk email dan kata sandi, konfirmasi email, keluar, serta onboarding awal warung tersedia di `/` dan `/app`. Alur nyata baru aktif setelah project Supabase cloud dikonfigurasi dan migrasi diterapkan.
- Migrasi awal Supabase untuk tabel SRS, relasi tenant, dan RLS di `supabase/migrations/`. Belum dijalankan pada PostgreSQL lokal.
- Modul verifikasi tanda tangan dan parsing webhook WhatsApp, deduplikasi dan antrean **in-memory khusus demo**, serta simulator payload sintetis. Belum ada route HTTP maupun worker produksi.
- Context Lock **in-memory khusus pengembangan** dengan batas waktu dan tes untuk persetujuan, penolakan, perubahan, dan kedaluwarsa. Belum terhubung ke pengiriman PO.
- Adapter DeepSeek untuk chat dan function calling yang memvalidasi respons, tetapi belum terhubung ke orchestrator, tool bisnis, maupun UI.

## Menjalankan proyek

Butuh Node.js 20+ dan pnpm 12.6.0. Jalankan dari akar repositori:

```sh
pnpm install
pnpm dev
```

Buka `http://localhost:3000` untuk halaman masuk atau `http://localhost:3000/demo` untuk preview publik tanpa akun Supabase. Di demo, tombol **Uang masuk** dan **Uang keluar** mengubah ringkasan dan riwayat hanya selama halaman terbuka; semua angka dan tanggal adalah contoh. Tab **Asisten** menampilkan status integrasi, bukan chat AI aktif.

Perintah pemeriksaan:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm simulate:whatsapp
```

Simulator hanya mencetak body dan header bertanda tangan dengan data sintetis. Lihat `packages/whatsapp/README.md` untuk kontrak modul dan batasan penyimpanan memori, serta `scripts/README.md` untuk mengirim payload sintetis ke endpoint webhook lokal.

## Integrasi opsional

Selain tiga variabel Supabase di atas, integrasi berikut hanya aktif jika variabelnya diisi. Semua nilai ini **tanpa** awalan `NEXT_PUBLIC_` kecuali yang memang publik:

- WhatsApp masuk: `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Atur callback Meta ke `<APP_BASE_URL>/api/whatsapp/webhook`, lalu simpan nomor bisnis pada `shops.wa_phone_number_id`. Balasan otomatis dan kirim pesan keluar belum tersedia.
- Asisten: `LLM_API_KEY` dan `LLM_MODEL`, opsional `APPROVAL_TTL_MINUTES` (default 30) dan `DAILY_AI_QUOTA_FREE` (default 30). Tanpa kunci LLM, halaman `/app/asisten` hanya menampilkan panduan setup dan tidak mengarang jawaban. Asisten hanya membaca stok dan laporan secara langsung; pembuatan pengeluaran atau penjualan selalu menunggu persetujuan pemilik melalui kartu konfirmasi.

## Mengaktifkan akun dan warung nyata (FR-AUTH-01, FR-AUTH-02)

1. Buat project Supabase **cloud** milik Anda. Aktifkan Auth email dan kata sandi serta konfirmasi email. Setelah memasang Supabase CLI, dari akar repositori jalankan `supabase init` (membuat `supabase/config.toml` bila belum ada), `supabase login`, lalu `supabase link --project-ref <project-ref>`. Tinjau daftar migrasi dengan `supabase db push --dry-run` sebelum menjalankan `supabase db push`. **Jangan jalankan push pada database berisi data nyata tanpa peninjauan dan cadangan.** Kredensial dan CLI belum tersedia di lingkungan pengembangan ini; migrasi belum diuji terhadap instance cloud.
2. Di Supabase Auth URL Configuration, atur **Site URL** ke origin aplikasi dan izinkan URL redirect `<origin>/auth/callback`. Untuk mencoba auth dari perangkat lokal, gunakan `http://localhost:3000` sebagai origin; untuk publik gunakan URL HTTPS deployment.
3. Atur variabel berikut di environment aplikasi web (misalnya `apps/web/.env.local` saat development, atau secret settings penyedia hosting saat deployment):

   ```text
   NEXT_PUBLIC_SUPABASE_URL=<Project URL>
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Publishable key>
   APP_BASE_URL=<origin aplikasi yang sudah diizinkan di Supabase Auth>
   ```

   `NEXT_PUBLIC_` berarti URL dan publishable key memang dapat dilihat browser; **jangan** gunakan service role key untuk variabel itu. Jangan commit nilai nyata atau kirim token ke percakapan. Setelah menyetel environment, jalankan ulang `pnpm dev`, daftar dari `/signup`, konfirmasi email, lalu lengkapi profil di `/onboarding`. Nomor telepon yang diisi belum diverifikasi dan belum boleh dipakai untuk mengenali pemilik di WhatsApp.

## Database dan integrasi berikutnya

Migrasi juga dapat diuji dengan Supabase lokal bila Supabase CLI dan Docker sudah tersedia. Backend produksi harus menyimpan pesan ke database dan antrean persisten sebelum membalas webhook; deduplikasi memori tidak aman untuk restart atau banyak proses. Operasi PO tidak boleh dijalankan langsung dari klien, melainkan melalui backend yang memverifikasi persetujuan pemilik.

Adapter DeepSeek menggunakan endpoint chat completions dan menerima API key serta nama model dari pemanggil di server. Gunakan variabel `LLM_API_KEY` dan `LLM_MODEL` yang dijelaskan di `AGENT.md`, tanpa memasukkan nilai rahasia ke repositori. Panggilan ini dapat berbiaya; adapter belum mengatur kuota ataupun menjalankan tool. Penyedia embedding untuk pencarian vektor belum dipilih, sehingga kolom `embedding` belum diberi dimensi maupun indeks vektor.
