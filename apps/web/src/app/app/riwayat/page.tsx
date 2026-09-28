import Link from "next/link";
import { formatRupiah } from "@/lib/ledger";
import { loadShopContext } from "../context";
import { CashList } from "../cash-list";
import { AppShell, RoleNotice, ShopErrorCard } from "../shell";
import {
  getHistory,
  historyFilterFromParam,
  historyFilterLabel,
  historyFilterToParam,
  HISTORY_FILTERS,
  HISTORY_LIMIT,
} from "./data";
import styles from "./riwayat.module.css";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ periode?: string | string[] }> }) {
  const context = await loadShopContext();
  if (!context) return <AppShell shopName="KedeAwak" active="riwayat"><ShopErrorCard /></AppShell>;
  const { client, shopId, shopName, role } = context;

  if (role !== "owner") {
    return (
      <AppShell shopName={shopName} active="riwayat">
        <RoleNotice feature="Riwayat kas" />
      </AppShell>
    );
  }

  const { periode } = await searchParams;
  const filter = historyFilterFromParam(periode);
  const { history, error } = await getHistory(client, shopId, filter, new Date());
  if (error || !history) return <AppShell shopName={shopName} active="riwayat"><ShopErrorCard /></AppShell>;
  const { summary, transactions, capped } = history;

  return (
    <AppShell shopName={shopName} active="riwayat">
      <div className="content-stack">
        <div className="page-intro">
          <div><p className="eyebrow">CATATAN KAS</p><h1>Transaksi</h1></div>
          <span className="date-chip">{historyFilterLabel(filter)}</span>
        </div>

        <nav className={styles.periodNav} aria-label="Pilih periode transaksi">
          {HISTORY_FILTERS.map((item) => (
            <Link
              key={item}
              className={styles.periodLink}
              href={{ pathname: "/app/riwayat", query: { periode: historyFilterToParam(item) } }}
              aria-current={item === filter ? "page" : undefined}
            >
              {historyFilterLabel(item)}
            </Link>
          ))}
        </nav>

        <section className="stats-grid" aria-label="Ringkasan transaksi periode">
          <div className="stat-card">
            <span className="stat-label">Uang masuk</span>
            <strong className="income-text">{formatRupiah(summary.income)}</strong>
            <span className="stat-hint">Total tercatat pada periode ini</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Uang keluar</span>
            <strong className="expense-text">{formatRupiah(summary.expense)}</strong>
            <span className="stat-hint">Total tercatat pada periode ini</span>
          </div>
          <div className="stat-card featured-stat">
            <span className="stat-label">Selisih kas</span>
            <strong>{formatRupiah(summary.difference)}</strong>
            <span className="stat-hint">Uang masuk − uang keluar. Bukan laba.</span>
          </div>
        </section>

        <p className={styles.summaryNote}>
          {summary.count} catatan pada periode ini. Daftar menampilkan hingga {HISTORY_LIMIT} transaksi terbaru
          {capped ? " dan masih ada catatan lain di luar daftar" : ""}. Waktu ditampilkan dalam zona Asia/Jakarta.
        </p>

        {transactions.length === 0
          ? <p className="empty-state">Belum ada transaksi tercatat pada periode ini.</p>
          : <section className="panel" aria-label="Daftar riwayat transaksi"><CashList transactions={transactions} /></section>}
        <Link className="secondary-button" href="/app">Kembali ke ringkasan</Link>
      </div>
    </AppShell>
  );
}
