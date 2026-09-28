import Link from "next/link";
import { formatJakartaDate, formatRupiah, todayInJakarta } from "@/lib/ledger";
import { loadShopContext } from "./context";
import { getTodaySummary, getTransactions } from "./data";
import { CashList } from "./cash-list";
import { QuickAddForm } from "./quick-add-form";
import { AppShell, ShopErrorCard } from "./shell";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const context = await loadShopContext();
  if (!context) return <AppShell shopName="KedeAwak" active="ringkasan"><ShopErrorCard /></AppShell>;
  const { client, shopId, shopName, role } = context;

  if (role !== "owner") {
    return (
      <AppShell shopName={shopName} active="ringkasan">
        <section className="panel" aria-labelledby="role-title">
          <h1 id="role-title">Hanya pemilik warung</h1>
          <p className="muted">Ringkasan kas hanya dapat dilihat oleh pemilik warung.</p>
        </section>
      </AppShell>
    );
  }

  const now = new Date();
  const [summaryResult, recentResult] = await Promise.all([
    getTodaySummary(client, shopId, now),
    getTransactions(client, shopId, 5),
  ]);
  if (summaryResult.error || recentResult.error) return <AppShell shopName={shopName} active="ringkasan"><ShopErrorCard /></AppShell>;
  const summary = summaryResult.summary;
  const transactions = recentResult.transactions;

  return (
    <AppShell shopName={shopName} active="ringkasan">
      <div className="content-stack">
        <div className="page-intro">
          <div><p className="eyebrow">RINGKASAN HARI INI</p><h1>{formatJakartaDate(now)}</h1></div>
          <span className="date-chip">Zona waktu Asia/Jakarta</span>
        </div>

        <section className="stats-grid" aria-label="Ringkasan kas hari ini">
          <div className="stat-card">
            <span className="stat-label">Uang masuk</span>
            <strong className="income-text">{formatRupiah(summary.income)}</strong>
            <span className="stat-hint">Total tercatat hari ini</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Uang keluar</span>
            <strong className="expense-text">{formatRupiah(summary.expense)}</strong>
            <span className="stat-hint">Total tercatat hari ini</span>
          </div>
          <div className="stat-card featured-stat">
            <span className="stat-label">Selisih kas</span>
            <strong>{formatRupiah(summary.difference)}</strong>
            <span className="stat-hint">Uang masuk − uang keluar. Bukan laba.</span>
          </div>
        </section>

        <QuickAddForm today={todayInJakarta(now)} />

        <section className="panel" aria-labelledby="recent-title">
          <div className="section-heading">
            <div><p className="eyebrow">AKTIVITAS</p><h2 id="recent-title">Riwayat terbaru</h2></div>
            <span className="subtle-tag">Maks. 5</span>
          </div>
          {transactions.length === 0
            ? <p className="empty-state">Belum ada transaksi tercatat. Mulai dengan mencatat uang masuk atau uang keluar di atas.</p>
            : <CashList transactions={transactions} />}
          <Link className="full-history-button" href="/app/riwayat">Lihat semua riwayat</Link>
        </section>

        <p className="footer-note">Catatan ini tersimpan untuk warung Anda. Verifikasi pembayaran otomatis belum terhubung ke bank.</p>
      </div>
    </AppShell>
  );
}
