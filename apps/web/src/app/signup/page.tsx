import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../auth/auth-form";
import { createClient } from "@/lib/supabase/server";
import { getConfirmationUrl } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function Signup() {
  const client = await createClient();
  if (!client) redirect("/");
  const { data } = await client.auth.getClaims();
  if (data?.claims?.sub) redirect("/app");
  return <main className="auth-layout"><section className="auth-card"><p className="eyebrow">KEDEAWAK</p><h1>Daftar sebagai pemilik</h1><p className="muted">Gunakan email dan kata sandi. Nomor WhatsApp belum digunakan untuk masuk.</p>{getConfirmationUrl() ? <AuthForm mode="signup" /> : <p className="auth-notice" role="status">Pendaftaran belum tersedia. Atur APP_BASE_URL ke alamat publik HTTPS aplikasi (atau localhost untuk pengembangan) dan izinkan URL /auth/callback di Supabase Auth.</p>}<p className="auth-footnote"><Link href="/">Kembali ke beranda</Link></p></section></main>;
}
