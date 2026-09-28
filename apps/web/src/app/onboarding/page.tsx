import { redirect } from "next/navigation";
import { signOut } from "../auth/actions";
import { getIdentity, getMembership } from "@/lib/membership";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function Onboarding() {
  const { client, authId } = await getIdentity();
  const { membership, error } = await getMembership(client, authId);
  if (error) return <main className="auth-layout"><section className="auth-card"><h1>Profil belum dapat diperiksa</h1><p>Coba lagi nanti.</p><form action={signOut}><button className="secondary-button">Keluar</button></form></section></main>;
  if (membership) redirect("/app");
  return <main className="auth-layout"><section className="auth-card"><p className="eyebrow">KEDEAWAK</p><h1>Siapkan profil warung</h1><p className="muted">Isi data awal untuk membuat warung Anda. Jam buka, alamat, dan nomor WA bisnis belum diatur pada tahap ini.</p><OnboardingForm /><form action={signOut} className="auth-exit"><button className="secondary-button" type="submit">Keluar</button></form></section></main>;
}
