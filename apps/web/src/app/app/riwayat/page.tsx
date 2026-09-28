import Link from "next/link";
import { loadShopContext } from "../context";
import { getTransactions } from "../data";
import { CashList } from "../cash-list";
import { AppShell, ShopErrorCard } from "../shell";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 200;

export default async function HistoryPage() {
  const context = await loadShopContext();
  if (!context) return <AppShell shopName="KedeAwak" active="riwayat"><ShopErrorCard /></AppShell>;
  const { client, shopId, shopName, role } = context;

  if (role !== "owner") {
    return (
      <AppShell shopName={shopName} active="riwayat">
        <section className="panel" aria-labelledby="role-title">
          <h1 id="role-title">Hanya pemilik warung</h1>
          <p className="muted">Riwayat kas hanya dapat dilihat oleh pemilik warung.</p>
        </section>
      </AppShell>
    );
  }

  const { transactions, error } = await getTransactions(client, shopId, HISTORY_LIMIT);
  if (error) return <AppShell shopName={shopName} active="riwayat"><ShopErrorCard /></AppShell>;

  return (
    <AppShell shopName={shopName} active="riwayat">
      <div className="content-stack">
        <div className="page-intro">
          <div><p className="eyebrow">CATATAN KAS</p><h1>Semua riwayat</h1></div>
          <span className="date-chip">{transactions.length} catatan</span>
        </div>
        <p className="muted">Menampilkan hingga {HISTORY_LIMIT} catatan terbaru. Waktu ditampilkan dalam zona Asia/Jakarta.</p>
        {transactions.length === 0
          ? <p className="empty-state">Belum ada transaksi tercatat.</p>
          : <section className="panel" aria-label="Daftar riwayat transaksi"><CashList transactions={transactions} /></section>}
        <Link className="secondary-button" href="/app">Kembali ke ringkasan</Link>
      </div>
    </AppShell>
  );
}
