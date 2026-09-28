# KedeAwak

Asisten bisnis AI untuk warung dan UMKM yang dirancang untuk terhubung dengan WhatsApp. Kebutuhan produk ada di `PRD.md`, kebutuhan teknis di `SRS.md`, aturan kerja di `AGENT.md`, dan status implementasi di `progress.md`.

## Status implementasi

- Monorepo pnpm dengan aplikasi Next.js dan paket untuk database, agent, tools, WhatsApp, multimodal, serta forecasting. Turborepo belum dipakai: workspace pnpm cukup untuk paket yang aktif saat ini.
- Preview dashboard responsif memakai token dari `DESIGN_SYSTEM.md`: ringkasan, riwayat, produk/stok, pesanan, dan status asisten. Semua data adalah contoh sintetis, bukan data bisnis nyata.
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

Buka `http://localhost:3000` di browser. Tidak perlu akun Supabase, token WhatsApp, Redis, atau API key DeepSeek untuk preview. Di halaman **Ringkasan**, coba tombol **Uang masuk** atau **Uang keluar**, isi nominal dan keterangan, lalu lihat perubahan ringkasan dan riwayat. Catatan tambahan hanya tersimpan selama halaman masih terbuka; memuat ulang mengembalikan data awal. Angka dan tanggal contoh tidak mewakili data warung sungguhan. Tab **Asisten** menampilkan status integrasi, bukan chat AI aktif.

Perintah pemeriksaan:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm simulate:whatsapp
```

Simulator hanya mencetak body dan header bertanda tangan dengan data sintetis. Lihat `packages/whatsapp/README.md` untuk kontrak modul dan batasan penyimpanan memori.

## Database dan integrasi berikutnya

Migrasi disiapkan untuk Supabase lokal, tetapi membutuhkan Supabase CLI dan Docker sebelum dapat dijalankan dan diuji. Backend produksi harus menyimpan pesan ke database dan antrean persisten sebelum membalas webhook; deduplikasi memori tidak aman untuk restart atau banyak proses. Operasi PO tidak boleh dijalankan langsung dari klien, melainkan melalui backend yang memverifikasi persetujuan pemilik.

Adapter DeepSeek menggunakan endpoint chat completions dan menerima API key serta nama model dari pemanggil di server. Gunakan variabel `LLM_API_KEY` dan `LLM_MODEL` yang dijelaskan di `AGENT.md`, tanpa memasukkan nilai rahasia ke repositori. Panggilan ini dapat berbiaya; adapter belum mengatur kuota ataupun menjalankan tool. Penyedia embedding untuk pencarian vektor belum dipilih, sehingga kolom `embedding` belum diberi dimensi maupun indeks vektor.
