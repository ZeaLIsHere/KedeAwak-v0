"use client";

import { useActionState, useState } from "react";
import { createShop } from "./actions";

export function OnboardingForm() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [state, action, pending] = useActionState(createShop, { message: "" });
  return (
    <form action={action} className="auth-form">
      {step === 1 ? <div className="auth-form"><p className="muted">Langkah 1 dari 2: identitas usaha</p>
        <div className="field"><label htmlFor="shop-name">Nama warung</label><input id="shop-name" name="shop_name" maxLength={100} required value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div className="field"><label htmlFor="business-type">Jenis usaha</label><input id="business-type" name="shop_business_type" maxLength={80} required value={businessType} onChange={(event) => setBusinessType(event.target.value)} placeholder="Contoh: Warung makan" /></div>
        <button className="primary-button" type="button" disabled={!name.trim() || !businessType.trim()} onClick={() => setStep(2)}>Lanjut</button>
      </div> : <div className="auth-form"><p className="muted">Langkah 2 dari 2: kontak pemilik</p>
        <input type="hidden" name="shop_name" value={name} /><input type="hidden" name="shop_business_type" value={businessType} />
        <div className="field"><label htmlFor="owner-name">Nama pemilik</label><input id="owner-name" name="owner_name" maxLength={100} autoComplete="name" required /></div>
        <div className="field"><label htmlFor="owner-phone">Nomor telepon pemilik</label><input id="owner-phone" name="owner_phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+6281234567890" pattern="\+[1-9][0-9]{7,14}" required aria-describedby="phone-hint" /><p id="phone-hint" className="muted">Gunakan kode negara, misalnya +62. Nomor ini belum diverifikasi dan tidak memberikan akses instruksi WhatsApp.</p></div>
        {state.message && <p className="auth-notice" role="alert">{state.message}</p>}
        <div className="auth-links"><button className="secondary-button" type="button" onClick={() => setStep(1)}>Kembali</button><button className="primary-button" type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan profil"}</button></div>
      </div>}
    </form>
  );
}
