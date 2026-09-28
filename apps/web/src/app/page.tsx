import Link from "next/link";
import { connection } from "next/server";
import { getConfirmationUrl, getSupabaseConfig } from "@/lib/supabase/config";

export default async function Home() {
  await connection();
  const configured = Boolean(getSupabaseConfig());
  const confirmationConfigured = Boolean(getConfirmationUrl());
  return (
    <main className="auth-layout">
      <section className="auth-card" aria-labelledby="home-title">
        <p className="eyebrow">KEDEAWAK</p>
        <h1 id="home-title">Mulai dari warung Anda</h1>
        <p className="muted">Daftar dan siapkan profil warung. Pencatatan usaha dan WhatsApp belum terhubung pada fitur ini.</p>
        {!configured && <p className="auth-notice" role="status">Autentikasi belum tersedia. Atur NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY di lingkungan aplikasi web, lalu konfigurasikan Supabase Auth dan URL konfirmasi email.</p>}
        {configured && !confirmationConfigured && <p className="auth-notice" role="status">Pendaftaran dan konfirmasi email belum tersedia. Atur APP_BASE_URL ke alamat publik HTTPS aplikasi (atau localhost untuk pengembangan) dan izinkan URL /auth/callback di Supabase Auth.</p>}
        {configured && <div className="auth-links">{confirmationConfigured && <Link className="primary-button" href="/signup">Daftar</Link>}<Link className="secondary-button" href="/login">Masuk</Link></div>}
        <p className="auth-footnote">Ingin melihat tampilan contoh? <Link href="/demo">Buka demo publik</Link>.</p>
      </section>
    </main>
  );
}
