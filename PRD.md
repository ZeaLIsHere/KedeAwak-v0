# PRD — Product Requirements Document

**Produk:** KedeAwak
**Tagline:** Asisten bisnis AI untuk warung, langsung dari WhatsApp.
**Versi:** 0.1 (Draft Hackathon)
**Repositori:** https://github.com/ZeaLIsHere/KedeAwak-v0.git
**Dokumen terkait:** `SRS.md` (spesifikasi teknis rinci), `AGENT.md` (panduan kerja agen dan aturan commit)

---

## 1. Ringkasan Eksekutif

Sebagian besar pemilik warung dan UMKM ultra-mikro di Indonesia sudah menjalankan bisnis lewat WhatsApp, tetapi pencatatannya masih manual: baca chat satu per satu, lalu salin ke buku. Akibatnya laporan keuangan tidak ada, stok sering kosong tanpa disadari, dan akses kredit tertutup.

**KedeAwak** menyambungkan WhatsApp warung ke satu aplikasi terpusat. Pesan pelanggan, pesanan, dan bukti pembayaran otomatis tercatat dan dianalisis oleh AI agent. Pemilik cukup bicara, mengetik, atau memotret struk; AI mencatat, mengingatkan, membalas pelanggan, dan menyiapkan aksi seperti pesanan ke supplier, dengan persetujuan pemilik sebelum aksi berisiko dijalankan.

---

## 2. Latar Belakang dan Masalah

Data yang dirujuk proposal:

| Fakta | Nilai |
|---|---|
| Pelaku UMKM di Indonesia | ± 64,2 juta |
| Kontribusi UMKM terhadap PDB | ± 61% (Rp8.573,89 triliun) |
| Penyerapan tenaga kerja | ± 117 juta orang (97%) |
| UMKM yang belum memanfaatkan AI secara optimal | > 90% |
| UMKM dengan laporan keuangan memadai | 3,51% (OJK) |
| UMKM belum bisa akses kredit bank (Mei 2025) | ± 69,5% |
| Porsi kredit UMKM dari total kredit perbankan (2025) | 19,4% (target pemerintah 30%) |

Akar masalah dari sudut pandang pemilik warung:

1. **Kewalahan membalas chat** dan mencatat pesanan sambil melayani pembeli.
2. **Tidak ada pencatatan keuangan** yang layak, sehingga tidak tahu untung-rugi sebenarnya.
3. **Stok habis atau menumpuk** karena tidak ada peringatan dan prediksi.
4. **Aplikasi kasir/akuntansi terlalu rumit** dan butuh pelatihan.
5. **Sulit dapat pembiayaan** karena tidak punya data keuangan yang kredibel.

---

## 3. Visi, Tujuan, dan Sasaran

**Visi:** Setiap warung di Indonesia punya asisten bisnis AI yang sederhana seperti chat WhatsApp.

**Tujuan produk**
1. Menghilangkan kerja salin-tempel dari WhatsApp ke buku.
2. Membuat pencatatan transaksi semudah mengirim voice note.
3. Mencegah kehilangan penjualan akibat stok habis atau chat tidak terbalas.
4. Menghasilkan data keuangan rapi yang dapat menjadi dasar akses kredit.

**Tujuan hackathon (demo)**
- Menunjukkan alur end-to-end: pesan WA masuk → tercatat di dashboard → AI membalas → alert stok → draft PO disetujui → terkirim ke supplier.
- Menunjukkan input multimodal (teks, suara, foto) dan laporan on-demand.

---

## 4. Target Pengguna

### 4.1 Persona

**Persona 1 — Bu Rina, pemilik warung makan (utama)**
- 42 tahun, warung nasi di pinggir jalan, dibantu satu karyawan.
- Pakai WhatsApp setiap hari; ponsel Android kelas menengah bawah; tidak nyaman dengan dashboard rumit.
- Kebutuhan: pesanan langganan tidak terlewat, tahu untung harian, ingat kapan belanja bahan.
- Frustrasi: menyalin pesanan dari chat ke buku setelah tutup warung.

**Persona 2 — Bang Doni, toko kelontong**
- 35 tahun, ratusan jenis barang, sering "stok kosong baru sadar".
- Kebutuhan: alert stok, rekomendasi restok, catat hutang pelanggan.

**Persona 3 — Sari, online seller kecil**
- 27 tahun, jualan lewat WhatsApp/Instagram, banyak chat tanya harga berulang.
- Kebutuhan: balasan otomatis 24 jam, verifikasi bukti transfer cepat.

**Persona sekunder:** karyawan warung (input cepat lewat suara), pelanggan (pesan mudah via WA), lembaga pembiayaan dan pemerintah (pengguna data pada fase lanjutan).

### 4.2 Jobs To Be Done
- "Saat pesanan masuk lewat WA, saya ingin langsung tercatat tanpa saya ketik ulang."
- "Saat tutup warung, saya ingin tahu untung hari ini dengan sekali tanya."
- "Saat barang hampir habis, saya ingin diingatkan dan dibantu memesan."
- "Saat saya sibuk, saya ingin pelanggan tetap dibalas dengan benar."

---

## 5. Prinsip Produk

1. **Chat-first.** Semua fungsi utama bisa dijalankan lewat percakapan.
2. **Nol pelatihan.** Bahasa sehari-hari, tanpa istilah akuntansi.
3. **AI bertindak, manusia memutuskan.** AI mengerjakan; aksi berisiko menunggu persetujuan pemilik.
4. **Angka tidak boleh salah.** Perhitungan oleh kode, bukan tebakan AI. Jika ragu, AI bertanya.
5. **Terjangkau.** Freemium dengan kuota harian yang cukup untuk warung kecil.
6. **Data milik pemilik.** Privasi dan kontrol ada pada pemilik warung.

---

## 6. Ruang Lingkup

### 6.1 Fitur Inti (dari proposal)

| Fitur | Ringkas | Prioritas |
|---|---|---|
| Integrasi WhatsApp → Aplikasi | Pesan, pesanan, bukti bayar otomatis masuk dan tercatat | P0 |
| Ekstraksi Data Multimodal | Teks, voice note, foto struk menjadi catatan terstruktur | P0 |
| Respons Otomatis ke Pelanggan | Jawab harga, stok, jam buka 24 jam | P0 |
| Verifikasi Bukti Pembayaran | Cocokkan nominal bukti transfer dengan pesanan | P0 |
| Laporan Keuangan on-demand | "Laporan hari ini" → ringkasan | P0 |
| Alert Stok Menipis | Notifikasi proaktif di bawah ambang | P0 |
| Agentic Action (PO) | Draft PO → persetujuan → kirim ke supplier | P0 |
| Prediksi Stok | Moving Average + Safety Stock | P1 |
| Catat Hutang | Hutang pelanggan/pemasok dan pelunasan | P1 |
| Strategi Bisnis | Rekomendasi berbasis data | P2 |
| Ekspor Laporan (PDF/XLSX) | Untuk pengajuan kredit | P2 |

### 6.2 Di Luar Lingkup Versi Ini
Integrasi marketplace, rekonsiliasi bank, credit scoring AI, aplikasi mobile native, dasbor agregat untuk pemerintah/lembaga keuangan, pembayaran in-app.

---

## 7. User Stories dan Kriteria Terima

Format: *Sebagai [peran], saya ingin [aksi], agar [manfaat].*

### Epik A — WhatsApp ke Aplikasi
- **A1.** Sebagai pemilik, saya ingin pesan pelanggan otomatis tercatat di aplikasi, agar tidak perlu menyalin manual.
  - Terima: pesan WA muncul di dashboard ≤ 5 detik; tidak ada duplikasi jika webhook terkirim ulang.
- **A2.** Sebagai pemilik, saya ingin melihat riwayat chat per pelanggan, agar tahu konteks pesanan.
- **A3.** Sebagai pemilik, saya ingin menghubungkan WhatsApp lewat panduan singkat, agar bisa mulai tanpa bantuan teknis.

### Epik B — Pencatatan Multimodal
- **B1.** Sebagai pemilik, saya ingin mengirim voice note "jual 2 nasi goreng dan 1 es teh", agar penjualan tercatat tanpa mengetik.
  - Terima: transaksi terstruktur muncul dengan ringkasan konfirmasi ≤ 10 detik.
- **B2.** Sebagai pemilik, saya ingin memotret nota belanja, agar tercatat sebagai pengeluaran.
  - Terima: nominal, tanggal, item terekstrak; bila tidak pasti, AI meminta konfirmasi.
- **B3.** Sebagai karyawan, saya ingin mencatat lewat chat, agar tidak perlu belajar menu.

### Epik C — Pesanan dan Pembayaran
- **C1.** Sebagai pelanggan, saya ingin memesan lewat WhatsApp seperti biasa, agar mudah.
- **C2.** Sebagai pemilik, saya ingin pesanan otomatis tersusun dengan total dan status, agar tidak salah hitung.
- **C3.** Sebagai pemilik, saya ingin bukti transfer diperiksa otomatis, agar tidak membuka gambar satu per satu.
  - Terima: nominal cocok → status lunas; tidak cocok/tidak terbaca → ditandai untuk ditinjau pemilik.

### Epik D — Stok dan Restok
- **D1.** Sebagai pemilik, saya ingin diingatkan saat stok menipis, agar tidak kehabisan barang.
- **D2.** Sebagai pemilik, saya ingin AI menyiapkan draft PO ke supplier, agar belanja lebih cepat.
  - Terima: PO terkirim ke supplier hanya setelah saya setuju; balasan "ya" tidak dicatat sebagai transaksi baru.
- **D3.** Sebagai pemilik, saya ingin rekomendasi jumlah restok, agar tidak menumpuk stok.

### Epik E — Layanan Pelanggan Otomatis
- **E1.** Sebagai pelanggan, saya ingin pertanyaan harga/jam buka dijawab kapan saja, agar tidak menunggu.
- **E2.** Sebagai pemilik, saya ingin bisa mengambil alih percakapan dan mematikan balasan otomatis, agar tetap memegang kendali.
- **E3.** Sebagai pemilik, saya ingin AI tidak mengarang harga atau janji, agar tidak merugikan.

### Epik F — Laporan dan Insight
- **F1.** Sebagai pemilik, saya ingin mengetik "Laporan hari ini", agar tahu penjualan, pengeluaran, dan laba.
- **F2.** Sebagai pemilik, saya ingin melihat grafik sederhana, agar paham tren.
- **F3.** Sebagai pemilik, saya ingin mengekspor laporan rapi, agar dapat dipakai untuk pengajuan kredit (P2).

---

## 8. Alur Pengguna Utama

1. **Onboarding (target ≤ 5 menit):** daftar → isi profil warung → sambungkan WhatsApp → unggah/ketik daftar produk awal (bisa lewat chat: "tambah produk gula, beli 14 ribu, jual 16 ribu, stok 10 kg") → selesai.
2. **Harian:** pesanan masuk WA → notifikasi → pemilik melihat/menyetujui → penjualan tercatat otomatis.
3. **Akhir hari:** "Laporan hari ini" → ringkasan.
4. **Restok:** alert stok → "Buat PO?" → persetujuan → PO terkirim ke supplier.

---

## 9. Persyaratan Produk (Ringkas, rinci di SRS)

- **Performa:** pencatatan teks ≤ 10 detik; webhook cepat dan asinkron.
- **Keandalan:** pesan tidak boleh hilang; kegagalan AI tidak menghilangkan data.
- **Keamanan:** RLS per warung, rahasia di env, mitigasi prompt injection, sesuai UU PDP.
- **Kegunaan:** dapat dipakai tanpa pelatihan, responsif di layar 360 px.
- **Akurasi:** perhitungan angka deterministik; konfirmasi bila ekstraksi tidak pasti.
- **Bahasa:** Bahasa Indonesia sebagai default.

---

## 10. Model Bisnis

| Paket | Isi | Catatan |
|---|---|---|
| Gratis | Fitur dasar dengan kuota AI harian | Menarik adopsi awal |
| Berjenjang (Pro, dst.) | Kuota lebih besar, laporan ekspor, dukungan prioritas | Langganan |
| Pay-as-you-go | Biaya per pemakaian tambahan | Opsional |
| Kemitraan | Lembaga pembiayaan, koperasi, BUMN | Aliran pendapatan tambahan |
| Komisi transaksi | Opsional | Fase lanjutan |

Struktur biaya utama: API (LLM, WhatsApp, STT, OCR), cloud hosting, tim, edukasi/pemasaran.

---

## 11. Metrik Keberhasilan

| Kategori | Metrik | Target awal (usulan) |
|---|---|---|
| Efisiensi | Waktu catat 1 transaksi | Dari ~5 menit menjadi ~10 detik |
| Aktivasi | Pemilik yang mencatat transaksi pertama ≤ 5 menit setelah daftar | ≥ 70% |
| Retensi | Warung aktif mingguan setelah 4 minggu | ≥ 40% |
| Kualitas AI | Akurasi ekstraksi nominal struk/bukti transfer | ≥ 90% |
| Kualitas AI | Intent tercatat benar tanpa koreksi | ≥ 85% |
| Layanan pelanggan | Pesan pelanggan yang dijawab otomatis tanpa eskalasi | ≥ 60% |
| Bisnis | Warung dengan laporan keuangan lengkap ≥ 30 hari | Ukuran dampak pilot |
| Biaya | Biaya AI per warung per hari | Di bawah ambang paket gratis |

Angka target adalah usulan awal dan perlu divalidasi lewat pilot 1–2 kota.

---

## 12. Rencana Rilis

### Fase 0 — Hackathon (MVP demo)
- Gateway WA (bisa dengan simulator webhook sebagai cadangan demo).
- Orchestrator + Tool Layer inti: `check_stock`, `create_sale`, `create_expense`, `get_report`, `send_whatsapp`, `create_purchase_order`, `verify_payment`.
- Multimodal: teks, voice note, foto struk.
- Context Lock untuk persetujuan PO.
- Dashboard: ringkasan, chat AI, integrasi WA, pesanan, stok.
- Alert stok menipis dan auto-reply pelanggan.

### Fase 1 — Pilot (1–2 kota)
- Hutang, prediksi stok, karyawan/peran, kuota freemium, onboarding tersempurnakan, PWA.

### Fase 2 — Skala
- Ekspor laporan kredit, strategi bisnis, integrasi marketplace, rekonsiliasi bank, credit scoring, kemitraan lembaga pembiayaan.

---

## 12b. Saran Pembagian Kerja Tim (2 orang)

| Area | Fokus |
|---|---|
| Backend & AI | Webhook WA, antrean, Orchestrator, Tool Layer, Redis Context Lock, STT/OCR |
| Frontend & Data | Dashboard, chat UI, skema Supabase + RLS, laporan/grafik, demo script |
| Bersama | Pengujian skenario S1–S5, deck presentasi, video demo |

---

## 13. Risiko dan Mitigasi

| Risiko | Mitigasi |
|---|---|
| Verifikasi bisnis Meta/WhatsApp lambat | Nomor uji Cloud API sejak awal + simulator webhook |
| STT/OCR salah baca | Konfirmasi hasil, alias produk, koreksi pengguna dicatat |
| Halusinasi AI | Angka dihitung kode; AI hanya merangkai bahasa; ragu → bertanya |
| Prompt injection lewat chat pelanggan | Tool dibatasi per peran; pesan pelanggan diperlakukan sebagai data |
| Biaya API | Kuota harian, cache, model ringan untuk klasifikasi |
| Adopsi rendah pada pengguna kurang melek digital | Chat-first, onboarding ≤ 5 menit, contoh perintah siap pakai |
| Kepercayaan terhadap otomasi | HITL untuk aksi berisiko, jejak audit terlihat |

---

## 14. Dependensi

WhatsApp Business Cloud API (Meta), penyedia LLM dengan function calling, layanan STT dan OCR/Vision, Supabase (PostgreSQL + pgvector), Redis, hosting cloud.

---

## 15. Pertanyaan Terbuka
1. Kredit/kuota gratis LLM, STT, dan OCR apa yang tersedia untuk hackathon?
2. PWA cukup atau perlu aplikasi mobile untuk penilaian juri?
3. Apakah pemilik memberi instruksi lewat aplikasi saja, atau juga lewat WhatsApp dari nomor terdaftar? (Default draft: keduanya, nomor terdaftar dikenali sebagai pemilik.)
4. Nama dan alur perizinan data pelanggan (persetujuan chat direkam) untuk kepatuhan UU PDP.
5. Data awal produk: impor dari foto daftar harga atau input via chat?

---

## 16. Lampiran: Glosarium Singkat
Lihat bagian 1.3 pada `SRS.md`.
