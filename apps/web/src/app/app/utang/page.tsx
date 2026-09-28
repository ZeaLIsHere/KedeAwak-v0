import { countUnpaidDebts, totalRemaining } from "@/lib/debts";
import { formatRupiah, todayInJakarta } from "@/lib/ledger";
import { loadShopContext } from "../context";
import { AppShell, RoleNotice, ShopErrorCard } from "../shell";
import { getDebts } from "./data";
import { DebtForm } from "./debt-form";
import { DebtList } from "./debt-list";
import styles from "./utang.module.css";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const context = await loadShopContext();
  if (!context) return <AppShell shopName="KedeAwak" active="utang"><ShopErrorCard /></AppShell>;
  const { client, shopId, shopName, role } = context;

  if (role !== "owner") {
    return (
      <AppShell shopName={shopName} active="utang">
        <RoleNotice feature="Catatan hutang" />
      </AppShell>
    );
  }

  const { debts, error } = await getDebts(client, shopId);
  if (error || !debts) return <AppShell shopName={shopName} active="utang"><ShopErrorCard /></AppShell>;

  const remaining = totalRemaining(debts);
  const unpaidCount = countUnpaidDebts(debts);
  const todayKey = todayInJakarta(new Date());

  return (
    <AppShell shopName={shopName} active="utang">
      <div className="content-stack">
        <div className="page-intro">
          <div><p className="eyebrow">HUTANG</p><h1>Hutang pelanggan dan pemasok</h1></div>
          <span className="date-chip">{debts.length} catatan</span>
        </div>

        <section className={`panel ${styles.summaryBox}`} aria-label="Ringkasan hutang">
          <div>
            <span className="stat-label">Sisa hutang belum lunas</span>
            <strong>{formatRupiah(remaining)}</strong>
            <span className="stat-hint">{unpaidCount} catatan belum lunas</span>
          </div>
          <p className="field-hint">
            Sisa dihitung otomatis oleh sistem dari nominal hutang dikurangi total pelunasan. Angka ini tidak dapat diisi manual.
          </p>
        </section>

        <DebtForm />

        <section className="panel" aria-labelledby="debt-list-title">
          <div className="section-heading">
            <div><p className="eyebrow">DAFTAR HUTANG</p><h2 id="debt-list-title">Catatan hutang</h2></div>
            <span className="subtle-tag">Terbaru lebih dahulu</span>
          </div>
          <DebtList debts={debts} todayKey={todayKey} />
        </section>

        <p className="field-hint">
          Riwayat audit perubahan hutang (FR-FIN-04) belum tersimpan otomatis dari aplikasi dan menjadi pekerjaan lanjutan.
        </p>
      </div>
    </AppShell>
  );
}
