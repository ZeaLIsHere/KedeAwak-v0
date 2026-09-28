import { loadShopContext } from "../context";
import { AppShell, RoleNotice, ShopErrorCard } from "../shell";
import { getProducts } from "./data";
import { ProductForm } from "./product-form";
import { ProductList } from "./product-list";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const context = await loadShopContext();
  if (!context) return <AppShell shopName="KedeAwak" active="produk"><ShopErrorCard /></AppShell>;
  const { client, shopId, shopName, role } = context;

  if (role !== "owner") {
    return (
      <AppShell shopName={shopName} active="produk">
        <RoleNotice feature="Daftar produk" />
      </AppShell>
    );
  }

  const { products, error } = await getProducts(client, shopId);
  if (error) return <AppShell shopName={shopName} active="produk"><ShopErrorCard /></AppShell>;

  return (
    <AppShell shopName={shopName} active="produk">
      <div className="content-stack">
        <div className="page-intro">
          <div><p className="eyebrow">INVENTARIS</p><h1>Daftar produk</h1></div>
          <span className="date-chip">{products.length} produk</span>
        </div>

        <section className="panel" aria-labelledby="product-list-title">
          <div className="section-heading">
            <div><p className="eyebrow">STOK DAN HARGA</p><h2 id="product-list-title">Produk warung</h2></div>
            <span className="subtle-tag">Ambang minimum</span>
          </div>
          <ProductList products={products} />
        </section>

        <ProductForm />
      </div>
    </AppShell>
  );
}
