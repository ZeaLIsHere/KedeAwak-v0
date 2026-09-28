import { loadShopContext } from "../context";
import { AppShell, RoleNotice, ShopErrorCard } from "../shell";
import { getOrderProducts, getOrders } from "./data";
import { OrderForm } from "./order-form";
import { OrderList } from "./order-list";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const context = await loadShopContext();
  if (!context) return <AppShell shopName="KedeAwak" active="pesanan"><ShopErrorCard /></AppShell>;
  const { client, shopId, shopName, role } = context;

  if (role !== "owner") {
    return (
      <AppShell shopName={shopName} active="pesanan">
        <RoleNotice feature="Pesanan" />
      </AppShell>
    );
  }

  const [ordersResult, productsResult] = await Promise.all([
    getOrders(client, shopId),
    getOrderProducts(client, shopId),
  ]);
  if (ordersResult.error || productsResult.error) {
    return <AppShell shopName={shopName} active="pesanan"><ShopErrorCard /></AppShell>;
  }

  return (
    <AppShell shopName={shopName} active="pesanan">
      <div className="content-stack">
        <div className="page-intro">
          <div><p className="eyebrow">PESANAN</p><h1>Pesanan warung</h1></div>
          <span className="date-chip">{ordersResult.orders.length} pesanan terbaru</span>
        </div>

        <section className="panel" aria-labelledby="order-flow-title">
          <div className="section-heading">
            <div><p className="eyebrow">ALUR STATUS</p><h2 id="order-flow-title">Cara kerja pesanan</h2></div>
          </div>
          <p className="muted">
            Pesanan baru berstatus draft, lalu menunggu pembayaran, diproses, dan selesai. Pesanan yang belum selesai juga dapat dibatalkan.
          </p>
          <p className="muted">
            Menekan Selesaikan dan catat penjualan akan mencatat penjualan sebesar total pesanan dan mengurangi stok produk. Tindakan ini tidak dapat dibatalkan.
          </p>
          <p className="field-hint">
            Verifikasi pembayaran bersifat indikatif. Sistem belum terhubung ke rekening bank dan tidak dapat membuktikan uang sudah masuk.
          </p>
        </section>

        <OrderForm products={productsResult.products} />

        <section className="panel" aria-labelledby="order-list-title">
          <div className="section-heading">
            <div><p className="eyebrow">DAFTAR PESANAN</p><h2 id="order-list-title">Pesanan terbaru</h2></div>
            <span className="subtle-tag">Waktu Asia/Jakarta</span>
          </div>
          <OrderList orders={ordersResult.orders} />
        </section>
      </div>
    </AppShell>
  );
}
