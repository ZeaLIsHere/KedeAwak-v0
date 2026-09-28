import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "../auth/auth-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ confirmation?: string }> }) {
  const client = await createClient();
  if (!client) redirect("/");
  const { data } = await client.auth.getClaims();
  if (data?.claims?.sub) redirect("/app");
  const { confirmation } = await searchParams;
  return <main className="auth-layout"><section className="auth-card"><p className="eyebrow">KEDEAWAK</p><h1>Masuk ke akun</h1>{confirmation === "failed" && <p className="auth-notice" role="alert">Konfirmasi tidak berhasil. Coba lagi atau masuk jika akun sudah aktif.</p>}<AuthForm mode="login" /><p className="auth-footnote"><Link href="/">Kembali ke beranda</Link></p></section></main>;
}
