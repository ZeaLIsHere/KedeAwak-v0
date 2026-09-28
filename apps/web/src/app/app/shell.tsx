import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "../auth/actions";

export function AppShell({ shopName, active, children }: { shopName: string; active: "ringkasan" | "riwayat"; children: ReactNode }) {
  return (
    <div className="dash-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-symbol" aria-hidden="true">K</span>
            <span>{shopName}<small>KedeAwak · catatan kas</small></span>
          </div>
          <form action={signOut}><button className="secondary-button" type="submit">Keluar</button></form>
        </div>
      </header>
      <nav className="dash-nav" aria-label="Navigasi kas">
        <div className="dash-nav-inner">
          <Link className="dash-nav-link" href="/app" aria-current={active === "ringkasan" ? "page" : undefined}>Ringkasan</Link>
          <Link className="dash-nav-link" href="/app/riwayat" aria-current={active === "riwayat" ? "page" : undefined}>Riwayat</Link>
        </div>
      </nav>
      <main className="dash-main">{children}</main>
    </div>
  );
}

export function ShopErrorCard() {
  return (
    <section className="panel" aria-labelledby="shop-error-title">
      <h1 id="shop-error-title">Data warung belum dapat dimuat</h1>
      <p className="muted">Coba muat ulang halaman. Jika masalah berlanjut, keluar lalu masuk kembali.</p>
    </section>
  );
}
