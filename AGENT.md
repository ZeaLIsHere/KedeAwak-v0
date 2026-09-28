# AGENT.md — Panduan Kerja untuk Agen AI dan Kontributor

Dokumen ini adalah aturan kerja untuk **setiap agen AI** (Claude Code, Cursor, Copilot, dll.) dan kontributor manusia yang mengubah repositori **KedeAwak**.

- **Repositori:** https://github.com/ZeaLIsHere/KedeAwak-v0.git
- **Spesifikasi:** baca `PRD.md` (apa & mengapa) dan `SRS.md` (kebutuhan rinci, Tool Layer, model data) sebelum mengerjakan fitur apa pun.
- **Bahasa:** dokumen dan komunikasi tim dalam Bahasa Indonesia. Kode, nama variabel, dan pesan commit dalam **Bahasa Inggris**.
- **Emote/Emoji:** **Dilarang keras menggunakan emote/emoji** di seluruh percakapan, pesan commit, dokumentasi, maupun kode/komentar.

---

## 1. Gambaran Proyek

KedeAwak adalah aplikasi AI agent untuk warung/UMKM ultra-mikro yang menyambungkan WhatsApp ke aplikasi terpusat. Pesan pelanggan, pesanan, dan bukti bayar otomatis tercatat; pemilik dapat memberi instruksi lewat teks, suara, atau foto; AI dapat membalas pelanggan, mengingatkan stok, membuat laporan, dan menyusun PO dengan persetujuan pemilik (human-in-the-loop).

### 1.1 Stack (usulan, sesuaikan bila tim mengubahnya)

| Lapisan | Teknologi |
|---|---|
| Web/Dashboard | Next.js + TypeScript, Tailwind CSS (PWA) |
| API & Worker | TypeScript (Next.js route handlers / worker Node.js) |
| Database | PostgreSQL + pgvector via Supabase (RLS aktif) |
| Cache/Sesi | Redis (session, context lock, rate limit) |
| Pesan | WhatsApp Business Cloud API (webhook + Graph API) |
| AI | LLM dengan function calling, Whisper/Google STT, Vision LLM/Textract untuk OCR |
| Validasi | Zod (skema input/output tool) |
| Tes | Vitest/Jest + Playwright (E2E) |

### 1.2 Struktur Direktori (target)

```
.
├── AGENT.md  PRD.md  SRS.md  README.md
├── apps/
│   └── web/                  # Dashboard + API routes
├── packages/
│   ├── agent/                # Orchestrator, prompt, RAG
│   ├── tools/                # Tool Layer (check_stock, create_sale, ...)
│   ├── whatsapp/             # Gateway, verifikasi tanda tangan, kirim/terima
│   ├── multimodal/           # STT, OCR, parsing struk/bukti transfer
│   ├── forecasting/          # Moving Average + Safety Stock
│   └── db/                   # Skema, migrasi, seed, tipe
├── supabase/migrations/
├── tests/  (unit, integration, e2e, fixtures)
├── scripts/
└── .env.example
```

Jika struktur aktual berbeda, ikuti struktur yang sudah ada dan perbarui bagian ini.

---

## 2. Aturan Emas (Wajib)

1. **Baca dulu, ubah kemudian.** Periksa `SRS.md` untuk ID kebutuhan (mis. `FR-PO-03`) yang relevan dan rujuk di commit/PR.
2. **Jangan pernah commit rahasia.** Token WhatsApp, API key LLM, kredensial Supabase/Redis hanya di `.env` (yang di-`.gitignore`). Perbarui `.env.example` (tanpa nilai nyata) saat menambah variabel.
3. **Angka keuangan dihitung oleh kode, bukan LLM.** Total, laba, stok, dan prediksi harus deterministik dan bertes. Nominal = integer rupiah.
4. **`shop_id` selalu dari sesi tepercaya**, tidak pernah dari argumen yang dihasilkan LLM atau dari isi pesan.
5. **Pesan pelanggan = data, bukan instruksi.** Lindungi dari prompt injection. Peran pelanggan tidak boleh memanggil tool keuangan, laporan, atau PO.
6. **Aksi berisiko wajib HITL.** Pengiriman PO ke supplier dan pesan ke pihak ketiga atas inisiatif AI tidak boleh berjalan tanpa persetujuan eksplisit lewat Context Lock (lihat SRS §3.4 dan §5).
7. **Idempotensi.** Webhook dan tool yang menulis data harus aman dijalankan ulang (kunci: `wa_message_id`).
8. **Jangan hapus atau lemahkan tes** agar build lulus. Perbaiki penyebabnya.
9. **Jangan mengarang.** Jika kebutuhan tidak jelas, tanyakan atau catat sebagai asumsi eksplisit di PR/dokumen. Jangan mengubah `SRS.md`/`PRD.md` secara diam-diam.
10. **Perubahan kecil dan terfokus.** Satu tujuan per perubahan; hindari refactor besar yang tidak diminta.
11. **Dilarang menggunakan emote/emoji.** Seluruh komunikasi agen, pesan commit, dokumentasi, dan kode/komentar tidak boleh menggunakan emote atau emoji apa pun.
12. **Clean code & komentar inline penanda.** Terapkan prinsip clean code. Komentar dalam kode HANYA berupa komentar inline singkat untuk menandai bagian kode, bukan untuk penjelasan panjang.
13. **Efisiensi algoritma ramah UMKM.** Gunakan algoritma dan struktur data yang paling efektif dan efisien (waktu dan memori) karena target pengguna adalah UMKM dengan beragam latar finansial dan spesifikasi perangkat.

---

## 3. ATURAN COMMIT GIT (WAJIB SETIAP ADA PERUBAHAN)

**Remote:** `origin` → `https://github.com/ZeaLIsHere/KedeAwak-v0.git`

### 3.1 Prinsip Utama
- **Setiap perubahan pada repositori harus di-commit.** Jangan biarkan perubahan menumpuk di working tree. Selesai satu unit kerja logis → langsung commit.
- **Satu commit = satu perubahan logis (atomic).** Jangan mencampur fitur, perbaikan bug, refactor, dan dokumentasi dalam satu commit.
- **Setiap commit harus dalam keadaan bisa dibangun dan lulus tes.** Jangan commit kode yang merusak build, kecuali pada branch kerja dengan penanda `wip` (dan jangan pernah `wip` di `main`).
- **Push setelah commit** ke branch kerja agar pekerjaan tidak hilang dan bisa ditinjau.

### 3.2 Setup Awal (sekali saja)

```bash
git clone https://github.com/ZeaLIsHere/KedeAwak-v0.git
cd KedeAwak-v0
git config user.name  "<nama>"
git config user.email "<email>"

# Bila repo lokal sudah ada tanpa remote:
git remote add origin https://github.com/ZeaLIsHere/KedeAwak-v0.git
git remote -v            # pastikan origin benar
```

### 3.3 Strategi Branch

| Branch | Fungsi |
|---|---|
| `main` | Selalu stabil dan bisa didemokan. **Tidak boleh commit langsung**; masuk lewat Pull Request. |
| `dev` (opsional) | Integrasi sebelum ke `main`. |
| `feat/<scope>-<deskripsi>` | Fitur baru, mis. `feat/tools-create-purchase-order` |
| `fix/<scope>-<deskripsi>` | Perbaikan bug, mis. `fix/whatsapp-duplicate-webhook` |
| `docs/<deskripsi>` | Dokumentasi |
| `chore/<deskripsi>` `refactor/<deskripsi>` `test/<deskripsi>` | Sesuai jenis |

Aturan: buat branch dari `main` terbaru (`git pull --rebase origin main`), nama huruf kecil dengan tanda hubung, maksimal ± 50 karakter.

### 3.4 Format Pesan Commit — Conventional Commits

```
<type>(<scope>): <subject>

<body — opsional, jelaskan APA dan MENGAPA>

<footer — opsional: referensi kebutuhan, breaking change, issue>
```

**Aturan subject**
- Bahasa Inggris, **mood imperatif** ("add", "fix", bukan "added"/"fixes").
- Huruf kecil di awal, **tanpa titik** di akhir, **maksimal 72 karakter**.
- Jelaskan apa yang berubah, bukan bagaimana.

**Aturan body**
- Pisahkan dari subject dengan satu baris kosong; wrap ± 72 karakter.
- Boleh Bahasa Indonesia atau Inggris, konsisten dalam satu commit.
- Jelaskan alasan dan dampak, terutama untuk perubahan perilaku, skema data, atau keamanan.

**Footer**
- Rujuk kebutuhan: `Refs: FR-PO-03, FR-HITL-02`
- Menutup issue: `Closes #12`
- Perubahan yang mematahkan kompatibilitas: `BREAKING CHANGE: <penjelasan>` (atau `!` setelah scope).

### 3.5 Daftar `type`

| type | Dipakai untuk |
|---|---|
| `feat` | Fitur baru |
| `fix` | Perbaikan bug |
| `docs` | Perubahan dokumentasi (`SRS.md`, `PRD.md`, `AGENT.md`, README) |
| `refactor` | Perubahan struktur kode tanpa mengubah perilaku |
| `perf` | Peningkatan performa |
| `test` | Menambah/memperbaiki tes |
| `build` | Sistem build, dependensi, konfigurasi package |
| `ci` | Pipeline CI/CD, GitHub Actions |
| `chore` | Tugas rutin lain (tooling, .gitignore, bump versi) |
| `style` | Format/whitespace tanpa perubahan logika |
| `revert` | Membatalkan commit sebelumnya |
| `db` | Migrasi/skema database, seed, kebijakan RLS |
| `security` | Perbaikan/penguatan keamanan |

### 3.6 Daftar `scope` yang Disarankan

`whatsapp`, `agent`, `tools`, `hitl`, `multimodal`, `stt`, `ocr`, `orders`, `payments`, `inventory`, `finance`, `reports`, `po`, `customer-service`, `dashboard`, `auth`, `quota`, `db`, `redis`, `forecasting`, `infra`, `docs`, `deps`.

Gunakan satu scope paling relevan. Jika mencakup banyak area, pertimbangkan memecah commit.

### 3.7 Contoh Commit yang Benar

```
feat(tools): add create_purchase_order draft tool

Create a PO in `draft` status from supplier and item list. The PO is not
sent to the supplier until the owner approves via the context lock flow.

Refs: FR-PO-01, FR-PO-02
```

```
fix(whatsapp): ignore duplicate webhook deliveries

Store wa_message_id with a unique index and skip processing when the
message was already handled, preventing double sales on Meta retries.

Refs: FR-WA-03
```

```
db(inventory): add min_stock column to products

Refs: FR-INV-01, FR-INV-03
```

```
docs(srs): clarify PO approval TTL to 30 minutes
```

```
security(agent): restrict customer role to read-only tools

BREAKING CHANGE: customer-role sessions can no longer call get_report.
```

### 3.8 Contoh Commit yang SALAH

| Salah | Alasan |
|---|---|
| `update` / `fix stuff` / `wip` | Tidak informatif |
| `Fixed the bug.` | Bukan imperatif, huruf besar, ada titik, tidak ada type/scope |
| `feat: add sales, fix stock, update docs, refactor db` | Mencampur banyak perubahan |
| Commit yang berisi `.env` atau token | Pelanggaran keamanan (lihat §3.10) |
| Commit berisi `node_modules/`, `.next/`, file besar biner acak | Tidak boleh di-track |

### 3.9 Alur Kerja Setiap Perubahan (Checklist Agen)

Lakukan **setiap kali** ada perubahan:

```bash
# 1. Sinkron
git checkout main && git pull --rebase origin main
git checkout -b feat/<scope>-<deskripsi>

# 2. Kerjakan perubahan kecil dan terfokus

# 3. Verifikasi sebelum commit
npm run lint
npm run typecheck
npm test
# (jalankan build bila perubahan menyentuh konfigurasi/produksi: npm run build)

# 4. Tinjau apa yang akan di-commit
git status
git diff                 # cek tidak ada rahasia/debug/file tak terduga
git add <file-spesifik>  # HINDARI `git add .` tanpa memeriksa isinya
git diff --staged

# 5. Commit dengan format Conventional Commits
git commit -m "feat(scope): subject" -m "body opsional" -m "Refs: FR-XX-NN"

# 6. Push
git push -u origin feat/<scope>-<deskripsi>
```

**Setelah setiap commit, agen wajib:**
1. Memastikan `git status` bersih (tidak ada perubahan tersisa yang seharusnya ikut).
2. Melaporkan ke pengguna: hash commit singkat, pesan commit, dan file yang berubah.
3. Bila perubahan mengubah perilaku terdokumentasi (kebutuhan, skema, Tool Layer), **perbarui `SRS.md`/`PRD.md` di commit `docs(...)` terpisah** dalam PR yang sama.

### 3.10 Larangan Keras
- **Dilarang** `git push --force` ke `main` atau `dev`. Force-push hanya di branch pribadi Anda dan gunakan `--force-with-lease`.
- **Dilarang** commit langsung ke `main`.
- **Dilarang** commit: `.env*` (selain `.env.example`), kunci privat, token, dump database berisi data nyata, data pelanggan/nomor telepon asli, foto struk/bukti transfer asli, `node_modules/`, artefak build.
- **Dilarang** memakai `--no-verify` untuk melewati hook, kecuali disetujui eksplisit pemilik repo.
- **Dilarang** menulis ulang riwayat (`rebase -i`, `amend`) pada commit yang sudah di-push dan dipakai orang lain.
- **Dilarang** menyertakan data nyata pengguna pada fixture/tes. Gunakan data sintetis.

### 3.11 Jika Rahasia Tidak Sengaja Ter-commit
1. **Segera cabut (rotate/revoke)** kunci/token tersebut di penyedia layanannya. Menghapus commit saja tidak cukup.
2. Hapus dari riwayat (mis. `git filter-repo`) hanya setelah berkoordinasi dengan tim.
3. Tambahkan pola ke `.gitignore` dan pertimbangkan pemindai rahasia (mis. gitleaks) di CI.

### 3.12 Pull Request
- Judul PR mengikuti format Conventional Commits.
- Deskripsi memuat: tujuan, ringkasan perubahan, ID kebutuhan (`FR-...`), cara menguji, tangkapan layar (bila UI), catatan risiko/migrasi.
- Sebelum merge: lint, typecheck, tes, dan build lulus; minimal satu reviewer (rekan tim) menyetujui.
- Gunakan **squash merge** dengan judul PR sebagai pesan commit, atau **rebase merge** bila commit sudah bersih dan atomic. Hindari merge commit yang berisik.
- Hapus branch setelah merge.

### 3.13 Tag dan Rilis
- Versi mengikuti SemVer (`v0.1.0` untuk demo hackathon).
- Tandai rilis penting: `git tag -a v0.1.0 -m "Hackathon demo"` lalu `git push origin v0.1.0`.

### 3.14 File `.gitignore` Minimum

```
node_modules/
.next/
dist/
coverage/
.env
.env.*
!.env.example
*.log
.DS_Store
.vscode/
.idea/
/tmp/
*.pem
*.key
```

### 3.15 Ringkasan Cepat (Cheat Sheet)

```
Ada perubahan?  → commit.
Format          → type(scope): imperative subject ≤72 char, tanpa titik
Atomic          → satu tujuan per commit
Verifikasi      → lint + typecheck + test sebelum commit
Rujukan         → Refs: FR-XX-NN di footer
Branch          → feat|fix|docs|chore/<scope>-<deskripsi>, PR ke main
Terlarang       → force-push main, commit rahasia, --no-verify
Setelah commit  → push + laporkan hash & ringkasan
```

---

## 4. Konvensi Kode

### 4.1 Clean Code & Efisiensi Algoritma (Inklusif untuk UMKM)
- **Prinsip Clean Code:** Terapkan modularitas tinggi, fungsi kecil dengan Single Responsibility Principle (SRP), penamaan deskriptif dan self-explanatory, serta hindari duplikasi kode (DRY). Hindari "magic number" (pindahkan ke konstanta konfigurasi, mis. TTL persetujuan 30 menit).
- **Efisiensi Algoritma & Sumber Daya:** Gunakan algoritma dan struktur data yang paling efektif dan efisien dengan kompleksitas waktu (time complexity) dan memori (space complexity) optimal. Target pengguna adalah UMKM dengan variasi latar belakang keuangan dan perangkat (seringkali perangkat entry-level/low-spec dengan bandwidth internet terbatas). Pastikan kode minim overhead, hemat alokasi memori, responsif, dan hemat biaya komputasi/server.
- **TypeScript Strict:** TypeScript `strict: true`; hindari `any`, gunakan tipe eksplisit dan skema Zod pada batas sistem (webhook, tool, respons LLM).
- **Kerapian:** Lint/format otomatis (ESLint + Prettier). Tidak ada `console.log` sisa debug pada commit.
- **Penanganan Error:** Eksplisit; jangan menelan error diam-diam. Pesan ke pengguna sopan dan tidak teknis, detail teknis hanya di log.
- **Zona Waktu:** Simpan UTC, tampilkan `Asia/Jakarta` (atau zona warung) di UI.

### 4.2 Komentar Kode
- **Hanya komentar inline penanda:** Komentar dalam kode HANYA boleh berupa komentar inline singkat untuk menandai/melabeli bagian kode (contoh: `// SECTION: Validation`, `// STEP: Calculate total`, `// MARK: Auth check`).
- **Dilarang penjelasan panjang:** Dilarang menulis komentar panjang atau narasi yang menjelaskan alur kerja kode. Keterbacaan dan pemahaman kode harus berasal dari penamaan yang baik dan struktur clean code yang mandiri (*self-explanatory code*).
- **Dilarang emote/emoji:** Jangan gunakan emote atau emoji apa pun di dalam komentar kode.

### 4.3 Penamaan
- File: `kebab-case.ts`; tipe/kelas: `PascalCase`; fungsi/variabel: `camelCase`; konstanta: `UPPER_SNAKE_CASE`.
- Tool: `snake_case` sesuai SRS (`create_sale`, `check_stock`, ...).
- Tabel/kolom DB: `snake_case`, jamak untuk tabel.

### 4.4 Database
- Semua perubahan skema lewat migrasi di `supabase/migrations/` (jangan ubah lewat dashboard tanpa migrasi).
- Tabel tenant wajib punya `shop_id` dan kebijakan RLS. Tambah indeks untuk kolom yang sering difilter.
- Nominal `bigint`/integer rupiah, bukan float.
- Commit migrasi dengan type `db`.

---

## 5. Pedoman Khusus Agen AI dan Tool Layer

### 5.1 Membangun Tool
- Definisikan skema input/output (Zod) dan deskripsi tool yang jelas untuk LLM.
- Ambil `shop_id` dan peran dari konteks sesi, **bukan** dari argumen.
- Tulis `agent_logs` untuk setiap pemanggilan (nama, argumen, hasil, latensi, error), tanpa membocorkan rahasia/PII berlebih.
- Tandai risiko tool dan terapkan HITL sesuai tabel SRS §5.
- Gunakan transaksi DB untuk operasi yang menyentuh lebih dari satu tabel (penjualan + stok).
- Sertakan tes unit: jalur sukses, input tidak valid, duplikasi (idempotensi), dan akses lintas-`shop_id` (harus gagal).

### 5.2 Prompt dan Perilaku AI
- Bahasa Indonesia, singkat, sopan, gaya chat WhatsApp.
- Jika data tidak ada di database, jawab bahwa akan ditanyakan ke pemilik. **Jangan mengarang** harga/stok/kebijakan.
- Jika keyakinan rendah (nominal buram, produk ambigu), minta konfirmasi sebelum menulis data.
- Prompt disimpan sebagai berkas terversi (`packages/agent/prompts/`), bukan string tersebar. Perubahan prompt dicatat sebagai `feat(agent)` atau `fix(agent)` dengan contoh perilaku sebelum/sesudah pada body commit.
- Pisahkan prompt untuk peran **pemilik/karyawan** dan **pelanggan**; daftar tool berbeda.

### 5.3 Context Lock (HITL)
- Kunci Redis: `session:{shop_id}:{sender_phone}`; simpan `state`, `pending_action`, `expires_at`.
- Saat `AWAITING_APPROVAL`, interpretasikan balasan berikutnya sebagai setuju/tolak/ubah. Jangan diproses sebagai transaksi baru.
- TTL wajib; setelah kedaluwarsa, batalkan aksi dan beri tahu pemilik.
- Tes wajib untuk: setuju, tolak, ubah jumlah, kedaluwarsa, dan pesan tak terkait selama lock.

### 5.4 WhatsApp
- Verifikasi `X-Hub-Signature-256` sebelum memproses.
- Balas HTTP 200 cepat; pemrosesan berat lewat antrean/worker.
- Simpan pesan sebelum diproses. Idempotensi lewat `wa_message_id` unik.
- Patuhi jendela layanan 24 jam; gunakan template di luar jendela.
- Sediakan **simulator webhook** di `scripts/` agar pengembangan dan demo tidak bergantung pada verifikasi Meta.

### 5.5 Multimodal
- STT: bahasa `id`; simpan transkrip di `messages.transcript`.
- OCR: keluaran terstruktur (JSON) dengan skor keyakinan; di bawah ambang → minta konfirmasi.
- Simpan fixture struk/bukti transfer **sintetis** di `tests/fixtures/`, bukan data nyata.

### 5.6 Kuota dan Biaya
- Terapkan rate limit/kuota harian di Redis sebelum memanggil LLM/STT/OCR.
- Kuota habis → tetap simpan pesan, jangan panggil AI, beri tahu pemilik.
- Catat estimasi biaya token per warung untuk observabilitas.

---

## 6. Pengujian

| Jenis | Cakupan wajib |
|---|---|
| Unit | Tool Layer, perhitungan laporan, forecasting (Moving Average + Safety Stock), parser struk, mesin status Context Lock |
| Integrasi | Webhook → antrean → orchestrator (LLM di-mock) → DB; RLS antar-`shop_id` |
| E2E | Skenario S1–S5 dari `SRS.md` §4 (Playwright/simulator) |
| Keamanan | Prompt injection dari peran pelanggan, akses lintas-tenant, tanda tangan webhook tidak valid |

Aturan: tes deterministik (LLM/STT/OCR di-mock, dengan set kecil uji evaluasi terpisah untuk kualitas AI). Perbaikan bug harus disertai tes regresi.

---

## 7. Definition of Done (per Perubahan)

- [ ] Sesuai kebutuhan di `SRS.md`/`PRD.md` (ID kebutuhan dirujuk).
- [ ] Lint, typecheck, dan tes lulus lokal dan di CI.
- [ ] Tes baru/diperbarui untuk perilaku yang berubah.
- [ ] Tidak ada rahasia, PII nyata, atau debug tersisa.
- [ ] Migrasi DB (bila ada) maju dan bisa diulang; RLS diperiksa.
- [ ] Dokumentasi diperbarui bila perilaku/skema/tool berubah.
- [ ] Commit mengikuti §3 dan sudah di-push; PR dibuat bila siap ditinjau.
- [ ] Skenario demo terkait masih berjalan (S1–S5).

---

## 8. Variabel Lingkungan (Template `.env.example`)

```
# WhatsApp Cloud API
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=

# AI
LLM_API_KEY=
LLM_MODEL=
STT_API_KEY=
OCR_API_KEY=

# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Redis
REDIS_URL=

# App
APP_BASE_URL=
DEFAULT_TIMEZONE=Asia/Jakarta
APPROVAL_TTL_MINUTES=30
DAILY_AI_QUOTA_FREE=
```
Jangan pernah mengisi nilai nyata di berkas yang di-commit.

---

## 9. Cara Berkomunikasi (untuk Agen)

- **Dilarang Menggunakan Emote/Emoji:** Agen AI DILARANG KERAS menggunakan emote maupun emoji apa pun dalam setiap jawaban, respon chat, laporan commit, catatan dokumentasi, maupun penjelasan ke pengguna.
- Jelaskan singkat apa yang akan/telah diubah dan alasannya.
- Bila ada ambiguitas pada kebutuhan, ajukan **satu-lima** pertanyaan paling penting atau nyatakan asumsi yang dipakai.
- Setelah tiap commit, laporkan: `<hash> <type(scope): subject>` + daftar file.
- Jangan mengklaim tes/build lulus tanpa benar-benar menjalankannya; sebutkan bila tidak bisa dijalankan.
- Jika menemukan konflik antara dokumen (mis. SRS vs PRD), hentikan dan laporkan sebelum melanjutkan.

---

## 10. Catatan Proyek yang Perlu Diketahui

- Nama produk yang benar adalah **KedeAwak** (proposal sempat menyebut "AgenUMKM" pada satu bagian; gunakan KedeAwak).
- Verifikasi pembayaran bersifat **indikatif** pada MVP (belum terhubung ke bank). Jangan menyatakan uang "pasti masuk" dalam teks AI/UI.
- Target performa demo: pencatatan transaksi teks ≤ 10 detik.
- Prioritas hackathon: P0 di `SRS.md` lebih dulu; P1/P2 hanya bila P0 stabil dan bisa didemokan.
