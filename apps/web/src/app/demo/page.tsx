"use client";

import { useState, type FormEvent } from "react";
import { DEMO_DATE, sampleOrders, sampleProducts, sampleTransactions } from "@/lib/demo-data";
import { formatRupiah, summarize, validateAmount, validateTitle, type Transaction } from "@/lib/finance";

type View = "Ringkasan" | "Riwayat" | "Produk/Stok" | "Pesanan" | "Asisten";
type EntryType = Transaction["type"];
type Errors = { amount?: string; title?: string };

const views: readonly View[] = ["Ringkasan", "Riwayat", "Produk/Stok", "Pesanan", "Asisten"];

function TransactionList({ transactions }: { transactions: readonly Transaction[] }) {
  return (
    <ul className="transaction-list">
      {transactions.map((transaction) => (
        <li className="transaction-row" key={transaction.id}>
          <span className={`transaction-mark ${transaction.type}`} aria-hidden="true">
            {transaction.type === "income" ? "+" : "−"}
          </span>
          <span className="transaction-detail">
            <strong>{transaction.title}</strong>
            <span>{transaction.date} · {transaction.type === "income" ? "Uang masuk" : "Uang keluar"}</span>
          </span>
          <strong className={`transaction-amount ${transaction.type}`}>
            {transaction.type === "income" ? "+" : "−"}{formatRupiah(transaction.amount)}
          </strong>
        </li>
      ))}
    </ul>
  );
}

function QuickEntry({ onAdd }: { onAdd: (entry: Transaction) => void }) {
  const [type, setType] = useState<EntryType | null>(null);
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  function closeForm() {
    setType(null);
    setAmount("");
    setTitle("");
    setErrors({});
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = { amount: validateAmount(amount), title: validateTitle(title) };
    setErrors({ amount: nextErrors.amount ?? undefined, title: nextErrors.title ?? undefined });
    if (nextErrors.amount || nextErrors.title || !type) return;

    onAdd({ id: `local-${crypto.randomUUID()}`, title: title.trim(), type, amount: Number(amount), date: "Sesi ini · Baru dicatat" });
    closeForm();
  }

  return (
    <section className="panel quick-entry" aria-labelledby="quick-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">CATAT CEPAT</p>
          <h2 id="quick-title">Tambah catatan</h2>
        </div>
        <span className="subtle-tag">Hanya sesi ini</span>
      </div>
      <p className="muted">Coba alur pencatatan. Data baru hilang saat halaman dimuat ulang.</p>
      <div className="quick-actions">
        <button type="button" className="quick-button income-button" aria-expanded={type === "income"} onClick={() => { closeForm(); setType("income"); }}>+ Uang masuk</button>
        <button type="button" className="quick-button expense-button" aria-expanded={type === "expense"} onClick={() => { closeForm(); setType("expense"); }}>− Uang keluar</button>
      </div>
      {type && (
        <form className="entry-form" onSubmit={submit} noValidate>
          <h3>Catat {type === "income" ? "uang masuk" : "uang keluar"}</h3>
          <div className="field">
            <label htmlFor="entry-amount">Nominal (rupiah)</label>
            <input id="entry-amount" name="amount" type="text" inputMode="numeric" autoComplete="off" placeholder="Contoh: 25000" value={amount} aria-invalid={Boolean(errors.amount)} aria-describedby={errors.amount ? "amount-error" : undefined} onChange={(event) => { setAmount(event.target.value); setErrors((current) => ({ ...current, amount: undefined })); }} />
            {errors.amount && <p className="field-error" id="amount-error">{errors.amount}</p>}
          </div>
          <div className="field">
            <label htmlFor="entry-title">Keterangan</label>
            <input id="entry-title" name="title" type="text" maxLength={61} autoComplete="off" placeholder="Contoh: Belanja sayur" value={title} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "title-error" : undefined} onChange={(event) => { setTitle(event.target.value); setErrors((current) => ({ ...current, title: undefined })); }} />
            {errors.title && <p className="field-error" id="title-error">{errors.title}</p>}
          </div>
          <div className="form-actions">
            <button className="primary-button" type="submit">Tambahkan ke contoh</button>
            <button className="secondary-button" type="button" onClick={closeForm}>Batal</button>
          </div>
        </form>
      )}
    </section>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("Ringkasan");
  const [added, setAdded] = useState<Transaction[]>([]);
  const [message, setMessage] = useState("");
  const transactions = [...added.slice().reverse(), ...sampleTransactions];
  const totals = summarize(transactions);
  const lowStock = sampleProducts.filter((product) => product.stock <= product.minimum);
  const pendingOrders = sampleOrders.filter((order) => order.status === "Menunggu pembayaran");

  function addEntry(entry: Transaction) {
    setAdded((current) => [...current, entry]);
    setMessage(`${entry.type === "income" ? "Uang masuk" : "Uang keluar"} ${formatRupiah(entry.amount)} ditambahkan sementara. Tidak tersimpan.`);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="brand-symbol" aria-hidden="true">K</span><span>KedeAwak<small>Ruang usaha Anda</small></span></div>
          <div className="demo-label"><strong>Mode demo · data contoh</strong><span>Tidak disimpan atau terhubung ke layanan apa pun.</span></div>
        </div>
      </header>
      <div className="app-layout">
        <nav className="navigation" aria-label="Navigasi utama">
          <p className="nav-caption">JELAJAHI PREVIEW</p>
          <div className="nav-items">
            {views.map((item) => (
              <button key={item} type="button" className={`nav-item ${view === item ? "active" : ""}`} aria-current={view === item ? "page" : undefined} onClick={() => { setView(item); setMessage(""); }}>
                {item}
              </button>
            ))}
          </div>
          <div className="nav-footnote">Semua angka dan status di sini adalah contoh tetap. Tidak ada akun yang masuk.</div>
        </nav>
        <main className="main-content" id="content">
          <div className="page-intro">
            <div><p className="eyebrow">WARUNG CONTOH / {DEMO_DATE.toUpperCase()}</p><h1>{view}</h1></div>
            <span className="date-chip">Periode contoh · {DEMO_DATE}</span>
          </div>
          {message && <p className="notice" role="status">{message}</p>}

          {view === "Ringkasan" && (
            <div className="content-stack">
              <section className="welcome-card" aria-label="Pengantar ringkasan">
                <div><p className="eyebrow">DATA CONTOH</p><h2>Usaha lebih jelas, tanpa tebak-tebakan.</h2><p>Gambaran data contoh untuk mencoba tampilan KedeAwak. Arus kas dihitung dari catatan di bawah dan tambahan sesi ini.</p></div>
                <div className="welcome-count"><strong>{sampleOrders.length}</strong><span>pesanan contoh</span></div>
              </section>
              <section aria-label="Ringkasan arus kas contoh" className="stats-grid">
                <div className="stat-card"><span className="stat-label">Uang masuk</span><strong className="income-text">{formatRupiah(totals.income)}</strong><span className="stat-hint">Dari catatan contoh dan tambahan sesi</span></div>
                <div className="stat-card"><span className="stat-label">Uang keluar</span><strong className="expense-text">{formatRupiah(totals.expense)}</strong><span className="stat-hint">Dari catatan contoh dan tambahan sesi</span></div>
                <div className="stat-card featured-stat"><span className="stat-label">Selisih kas</span><strong>{formatRupiah(totals.cashDifference)}</strong><span className="stat-hint">Uang masuk − uang keluar; bukan laba</span></div>
              </section>
              <div className="dashboard-grid">
                <div className="content-stack">
                  <QuickEntry onAdd={addEntry} />
                  <section className="panel" aria-labelledby="recent-title">
                    <div className="section-heading"><div><p className="eyebrow">AKTIVITAS</p><h2 id="recent-title">Riwayat terbaru</h2></div><span className="subtle-tag">Maks. 5</span></div>
                    <TransactionList transactions={transactions.slice(0, 5)} />
                    <button type="button" className="full-history-button" onClick={() => { setView("Riwayat"); setMessage(""); }}>Lihat semua riwayat</button>
                  </section>
                </div>
                <section className="panel alerts-panel" aria-labelledby="alerts-title">
                  <div className="section-heading"><div><p className="eyebrow">PERLU DILIHAT</p><h2 id="alerts-title">Perhatian pada contoh</h2></div><span className="count-pill">{lowStock.length + pendingOrders.length}</span></div>
                  <ul className="alert-list">
                    <li><span className="alert-accent" aria-hidden="true" /><div><strong>{lowStock.length} produk stok menipis</strong><p>{lowStock.map((product) => product.name).join(" dan ")} berada di batas minimum atau di bawahnya.</p><button type="button" className="text-button" onClick={() => setView("Produk/Stok")}>Lihat produk dan stok</button></div></li>
                    <li><span className="alert-accent blue" aria-hidden="true" /><div><strong>{pendingOrders.length} pesanan menunggu pembayaran</strong><p>Status ini hanya ilustrasi. Tidak ada pembayaran yang diverifikasi.</p><button type="button" className="text-button" onClick={() => setView("Pesanan")}>Lihat pesanan</button></div></li>
                  </ul>
                </section>
              </div>
            </div>
          )}

          {view === "Riwayat" && (
            <section className="panel" aria-labelledby="history-title"><div className="section-heading"><div><p className="eyebrow">CATATAN KAS / {DEMO_DATE.toUpperCase()}</p><h2 id="history-title">Semua riwayat</h2></div><span className="subtle-tag">{transactions.length} catatan</span></div><p className="muted">Transaksi contoh dan catatan yang Anda tambah selama sesi ini. Muat ulang untuk kembali ke data awal.</p><TransactionList transactions={transactions} /></section>
          )}

          {view === "Produk/Stok" && (
            <div className="content-stack"><section className="panel" aria-labelledby="products-title"><div className="section-heading"><div><p className="eyebrow">INVENTARIS CONTOH</p><h2 id="products-title">Produk dan stok</h2></div><span className="subtle-tag">{sampleProducts.length} produk</span></div><p className="muted">Stok tidak berubah saat mencoba catat kas. Belum tersambung ke inventaris sungguhan.</p><ul className="data-list">{sampleProducts.map((product) => <li key={product.name} className="data-row"><div><strong>{product.name}</strong><span>Batas minimum {product.minimum} {product.unit}</span></div><div className="row-end"><strong>{product.stock} {product.unit}</strong><span className={`status-pill ${product.stock <= product.minimum ? "warning" : "good"}`}>{product.stock <= product.minimum ? "Stok menipis" : "Stok cukup"}</span></div></li>)}</ul></section></div>
          )}

          {view === "Pesanan" && (
            <section className="panel" aria-labelledby="orders-title"><div className="section-heading"><div><p className="eyebrow">DAFTAR CONTOH</p><h2 id="orders-title">Pesanan</h2></div><span className="subtle-tag">{sampleOrders.length} pesanan</span></div><p className="muted">Status pesanan bersifat contoh. Tidak ada WhatsApp atau pembayaran yang terhubung.</p><ul className="data-list">{sampleOrders.map((order) => <li key={order.id} className="data-row"><div><strong>{order.id} · {order.items}</strong><span>{DEMO_DATE} · {order.time}</span></div><div className="row-end"><strong>{formatRupiah(order.amount)}</strong><span className={`status-pill ${order.status === "Selesai" ? "good" : "warning"}`}>{order.status}</span></div></li>)}</ul></section>
          )}

          {view === "Asisten" && (
            <div className="content-stack"><section className="panel assistant-panel" aria-labelledby="assistant-title"><p className="eyebrow">STATUS LAYANAN</p><h2 id="assistant-title">Asisten belum tersedia di mode demo</h2><p>Chat AI, pesan suara, unggah foto, dan balasan WhatsApp belum terhubung. Preview ini tidak mengirim pesan dan tidak membuat jawaban AI palsu.</p><div className="connection-status"><strong>WhatsApp: Tidak terhubung</strong><span>Riwayat chat pelanggan dan balasan otomatis belum tersedia.</span></div><button type="button" className="secondary-button" onClick={() => setView("Ringkasan")}>Kembali ke ringkasan</button></section></div>
          )}
          <footer className="footer-note">KedeAwak · Preview lokal saja · Tidak ada data yang disimpan atau dikirim.</footer>
        </main>
      </div>
    </div>
  );
}
