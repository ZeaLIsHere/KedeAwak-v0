import Link from "next/link";
import { formatRupiah } from "@/lib/ledger";
import { formatQtyMilli } from "@/lib/orders";
import { formatReportDay, periodKindToParam, PERIOD_KINDS, periodLabel, periodKindFromParam } from "@/lib/reports";
import { loadShopContext } from "../context";
import { AppShell, RoleNotice, ShopErrorCard } from "../shell";
import { getReport } from "./data";
import styles from "./laporan.module.css";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ periode?: string | string[] }> }) {
  const context = await loadShopContext();
  if (!context) return <AppShell shopName="KedeAwak" active="laporan"><ShopErrorCard /></AppShell>;
  const { client, shopId, shopName, role } = context;

  if (role !== "owner") {
    return (
      <AppShell shopName={shopName} active="laporan">
        <RoleNotice feature="Laporan" />
      </AppShell>
    );
  }

  const { periode } = await searchParams;
  const kind = periodKindFromParam(periode);
  const { report, error } = await getReport(client, shopId, kind, new Date());
  if (error || !report) return <AppShell shopName={shopName} active="laporan"><ShopErrorCard /></AppShell>;
  const { period, summary, buckets, topProducts } = report;

  return (
    <AppShell shopName={shopName} active="laporan">
      <div className="content-stack">
        <div className="page-intro">
          <div><p className="eyebrow">LAPORAN</p><h1>Laporan keuangan</h1></div>
          <span className="date-chip">{period.label}</span>
        </div>

        <nav className={styles.periodNav} aria-label="Pilih periode laporan">
          {PERIOD_KINDS.map((item) => (
            <Link
              key={item}
              className={styles.periodLink}
              href={{ pathname: "/app/laporan", query: { periode: periodKindToParam(item) } }}
              aria-current={item === kind ? "page" : undefined}
            >
              {periodLabel(item)}
            </Link>
          ))}
        </nav>

        <section className={`stats-grid ${styles.summaryGrid}`} aria-label="Ringkasan kas periode">
          <div className="stat-card">
            <span className="stat-label">Uang masuk</span>
            <strong className="income-text">{formatRupiah(summary.income)}</strong>
            <span className="stat-hint">Total penjualan tercatat</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Uang keluar</span>
            <strong className="expense-text">{formatRupiah(summary.expense)}</strong>
            <span className="stat-hint">Total pengeluaran tercatat</span>
          </div>
          <div className="stat-card featured-stat">
            <span className="stat-label">Selisih kas</span>
            <strong>{formatRupiah(summary.difference)}</strong>
            <span className="stat-hint">Uang masuk − uang keluar. Bukan laba.</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Jumlah catatan</span>
            <strong>{summary.count}</strong>
            <span className="stat-hint">Uang masuk dan uang keluar digabung</span>
          </div>
        </section>
        <p className={styles.summaryNote}>
          Selisih kas bukan laba karena harga pokok barang belum dicatat sistem. Angka ini dihitung oleh kode dari catatan kas Anda, bukan oleh AI.
        </p>

        <section className="panel" aria-labelledby="daily-chart-title">
          <div className="section-heading">
            <div><p className="eyebrow">ARUS KAS HARIAN</p><h2 id="daily-chart-title">Uang masuk dan keluar</h2></div>
            <span className="subtle-tag">Asia/Jakarta</span>
          </div>
          <p className={styles.legend}>
            <span className={styles.legendItem}><span className={`${styles.swatch} ${styles.incomeBar}`} aria-hidden="true" />Uang masuk</span>
            <span className={styles.legendItem}><span className={`${styles.swatch} ${styles.expenseBar}`} aria-hidden="true" />Uang keluar</span>
          </p>
          {summary.count === 0
            ? <p className="empty-state">Belum ada catatan kas pada periode ini. Angka grafik akan muncul setelah Anda mencatat uang masuk atau uang keluar.</p>
            : (
              <ul className={styles.chart}>
                {buckets.map((bucket) => (
                  <li
                    className={styles.chartRow}
                    key={bucket.day}
                    aria-label={`${formatReportDay(bucket.day)}: uang masuk ${formatRupiah(bucket.income)}, uang keluar ${formatRupiah(bucket.expense)}`}
                  >
                    <span className={styles.chartDay} aria-hidden="true">{formatReportDay(bucket.day)}</span>
                    <span className={styles.chartBars} aria-hidden="true">
                      <span className={styles.barTrack}><span className={`${styles.bar} ${styles.incomeBar}`} style={{ width: `${bucket.incomePercent}%` }} /></span>
                      <span className={styles.barTrack}><span className={`${styles.bar} ${styles.expenseBar}`} style={{ width: `${bucket.expensePercent}%` }} /></span>
                    </span>
                    <span className={styles.chartValue} aria-hidden="true">
                      <span className="income-text">{formatRupiah(bucket.income)}</span>
                      <span className="expense-text">{formatRupiah(bucket.expense)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section className="panel" aria-labelledby="top-product-title">
          <div className="section-heading">
            <div><p className="eyebrow">PENJUALAN</p><h2 id="top-product-title">Produk terlaris</h2></div>
            <span className="subtle-tag">5 teratas</span>
          </div>
          {topProducts.length === 0
            ? <p className="empty-state">Belum ada penjualan selesai pada periode ini. Daftar produk terlaris terisi setelah pesanan berstatus selesai atau pembayaran terindikasi.</p>
            : (
              <ul className="data-list">
                {topProducts.map((product) => (
                  <li className="data-row" key={product.productId}>
                    <div>
                      <strong>{product.name}</strong>
                      <span>Terjual {formatQtyMilli(product.qtyMilli)} unit</span>
                    </div>
                    <div className="row-end"><strong>{formatRupiah(product.revenue)}</strong></div>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <p className="field-hint">Ekspor laporan ke PDF atau XLSX belum tersedia. Fitur ini direncanakan pada tahap berikutnya (FR-RPT-03, prioritas P2).</p>
        <Link className="secondary-button" href="/app">Kembali ke ringkasan</Link>
      </div>
    </AppShell>
  );
}
