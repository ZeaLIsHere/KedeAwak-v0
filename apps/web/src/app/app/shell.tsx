import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "../auth/actions";

export type AppSection =
  | "ringkasan"
  | "riwayat"
  | "produk"
  | "pesanan"
  | "laporan"
  | "utang"
  | "supplier"
  | "whatsapp"
  | "asisten"
  | "pengaturan";

const navItems: ReadonlyArray<{ key: AppSection; href: string; label: string }> = [
  { key: "ringkasan", href: "/app", label: "Ringkasan" },
  { key: "riwayat", href: "/app/riwayat", label: "Transaksi" },
  { key: "produk", href: "/app/produk", label: "Produk" },
  { key: "pesanan", href: "/app/pesanan", label: "Pesanan" },
  { key: "laporan", href: "/app/laporan", label: "Laporan" },
  { key: "utang", href: "/app/utang", label: "Utang" },
  { key: "supplier", href: "/app/supplier", label: "Supplier" },
  { key: "whatsapp", href: "/app/whatsapp", label: "WhatsApp" },
  { key: "asisten", href: "/app/asisten", label: "Asisten" },
  { key: "pengaturan", href: "/app/pengaturan", label: "Pengaturan" },
];

export function AppShell({ shopName, active, children }: { shopName: string; active: AppSection; children: ReactNode }) {
  return (
    <div className="dash-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-symbol" aria-hidden="true">K</span>
            <span>{shopName}<small>KedeAwak · catatan warung</small></span>
          </div>
          <form action={signOut}><button className="secondary-button" type="submit">Keluar</button></form>
        </div>
      </header>
      <nav className="dash-nav" aria-label="Navigasi utama aplikasi">
        <div className="dash-nav-inner">
          {navItems.map((item) => (
            <Link
              key={item.key}
              className="dash-nav-link"
              href={item.href}
              aria-current={active === item.key ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
      <main className="dash-main">{children}</main>
    </div>
  );
}

export function ShopErrorCard({ message }: { message?: string }) {
  return (
    <section className="panel" aria-labelledby="shop-error-title">
      <h1 id="shop-error-title">Data warung belum dapat dimuat</h1>
      <p className="muted">{message ?? "Coba muat ulang halaman. Jika masalah berlanjut, keluar lalu masuk kembali."}</p>
    </section>
  );
}

export function RoleNotice({ feature }: { feature: string }) {
  return (
    <section className="panel" aria-labelledby="role-title">
      <h1 id="role-title">Hanya pemilik warung</h1>
      <p className="muted">{feature} hanya dapat diakses oleh pemilik warung.</p>
    </section>
  );
}
