import { loadShopContext } from "../context";
import { AppShell, RoleNotice, ShopErrorCard } from "../shell";
import { getSuppliers } from "./data";
import { SupplierForm } from "./supplier-form";
import { SupplierList } from "./supplier-list";
import styles from "./supplier.module.css";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const context = await loadShopContext();
  if (!context) return <AppShell shopName="KedeAwak" active="supplier"><ShopErrorCard /></AppShell>;
  const { client, shopId, shopName, role } = context;

  if (role !== "owner") {
    return (
      <AppShell shopName={shopName} active="supplier">
        <RoleNotice feature="Data supplier" />
      </AppShell>
    );
  }

  const { suppliers, error } = await getSuppliers(client, shopId);
  if (error || !suppliers) return <AppShell shopName={shopName} active="supplier"><ShopErrorCard /></AppShell>;

  return (
    <AppShell shopName={shopName} active="supplier">
      <div className="content-stack">
        <div className="page-intro">
          <div><p className="eyebrow">SUPPLIER</p><h1>Data supplier</h1></div>
          <span className="date-chip">{suppliers.length} supplier</span>
        </div>

        <section className={`panel ${styles.noticeBox}`} aria-labelledby="supplier-status-title">
          <div className="section-heading">
            <div><p className="eyebrow">STATUS FITUR</p><h2 id="supplier-status-title">Belum bisa membuat pesanan pembelian</h2></div>
          </div>
          <p className="muted">
            Anda dapat menyimpan nama, nomor WhatsApp, dan catatan produk supplier di halaman ini. Pembuatan draf pesanan pembelian
            (PO) dan pengiriman pesan ke supplier belum tersedia di aplikasi.
          </p>
          <p className="field-hint">
            Fitur tersebut menunggu alur persetujuan pemilik (FR-PO-01 sampai FR-PO-04) agar tidak ada pesan yang terkirim ke pihak
            ketiga tanpa persetujuan Anda. Nomor supplier di halaman ini belum dipakai untuk mengirim pesan apa pun.
          </p>
        </section>

        <SupplierForm />

        <section className="panel" aria-labelledby="supplier-list-title">
          <div className="section-heading">
            <div><p className="eyebrow">DAFTAR SUPPLIER</p><h2 id="supplier-list-title">Supplier warung</h2></div>
            <span className="subtle-tag">Urut nama</span>
          </div>
          <SupplierList suppliers={suppliers} />
        </section>
      </div>
    </AppShell>
  );
}
