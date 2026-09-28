import { redirect } from "next/navigation";
import { signOut } from "../auth/actions";
import { getIdentity, getMembership } from "@/lib/membership";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const { client, authId } = await getIdentity();
  const { membership, error } = await getMembership(client, authId);
  if (error) return <main className="auth-layout"><section className="auth-card"><h1>Profil belum dapat dimuat</h1><p>Coba lagi nanti.</p><form action={signOut}><button className="secondary-button">Keluar</button></form></section></main>;
  if (!membership) redirect("/onboarding");
  const { data: shop, error: shopError } = await client.from("shops").select("name, business_type").eq("id", membership.shop_id).single();
  if (shopError || !shop) return <main className="auth-layout"><section className="auth-card"><h1>Profil belum dapat dimuat</h1><p>Coba lagi nanti.</p><form action={signOut}><button className="secondary-button">Keluar</button></form></section></main>;
  return (
    <main className="auth-layout"><section className="auth-card">
      <p className="eyebrow">PROFIL USAHA</p><h1>{shop.name}</h1><p className="muted">Jenis usaha: {shop.business_type}</p>
      <p className="auth-notice">Profil warung tersimpan. Dashboard transaksi dan integrasi WhatsApp belum tersedia. Nomor pemilik yang diisi saat pendaftaran belum terverifikasi dan tidak dapat dipakai untuk otorisasi WhatsApp.</p>
      <form action={signOut}><button className="secondary-button" type="submit">Keluar</button></form>
    </section></main>
  );
}
