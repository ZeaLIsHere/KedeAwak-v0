"use client";

import { useActionState, useRef, useState, useTransition, type FormEvent } from "react";
import { collectFieldErrors } from "@/lib/ledger";
import {
  shopProfileSchema,
  SHOP_NAME_MAX_LENGTH,
  BUSINESS_TYPE_MAX_LENGTH,
  OPENING_HOURS_MAX_LENGTH,
  ADDRESS_MAX_LENGTH,
  type ShopProfile,
} from "@/lib/shop-profile";
import { toggleAutoReply, updateShopProfile, type ShopProfileActionState } from "./actions";
import styles from "./pengaturan.module.css";

const initialState: ShopProfileActionState = { status: "idle", message: "" };
const STEP_ONE_FIELDS = new Set(["name", "business_type"]);

type FormValues = { name: string; business_type: string; opening_hours: string; address: string };

function readForm(form: HTMLFormElement): FormValues {
  const formData = new FormData(form);
  return {
    name: String(formData.get("name") ?? ""),
    business_type: String(formData.get("business_type") ?? ""),
    opening_hours: String(formData.get("opening_hours") ?? ""),
    address: String(formData.get("address") ?? ""),
  };
}

type ProfileFieldsProps = {
  profile: ShopProfile;
  serverFieldErrors?: Record<string, string>;
  busy: boolean;
  dispatch: (formData: FormData) => void;
};

function ProfileFields({ profile, serverFieldErrors, busy, dispatch }: ProfileFieldsProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const fieldErrors = { ...serverFieldErrors, ...clientErrors };

  function clearError(field: string) {
    setClientErrors((current) => ({ ...current, [field]: "" }));
  }

  function goToSecondStep() {
    if (!formRef.current) return;
    const parsed = shopProfileSchema.safeParse(readForm(formRef.current));
    const errors = parsed.success ? {} : collectFieldErrors(parsed.error);
    setClientErrors(errors);
    if (!Object.keys(errors).some((key) => STEP_ONE_FIELDS.has(key))) setStep(2);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = shopProfileSchema.safeParse(readForm(form));
    if (!parsed.success) {
      const errors = collectFieldErrors(parsed.error);
      setClientErrors(errors);
      setStep(Object.keys(errors).some((key) => STEP_ONE_FIELDS.has(key)) ? 1 : 2);
      return;
    }
    setClientErrors({});
    dispatch(new FormData(form));
  }

  return (
    <form ref={formRef} className="entry-form" onSubmit={handleSubmit} noValidate>
      <div className={styles.formStep} hidden={step !== 1}>
        <div className="field">
          <label htmlFor="shop-name">Nama warung</label>
          <input
            id="shop-name"
            name="name"
            type="text"
            autoComplete="organization"
            maxLength={SHOP_NAME_MAX_LENGTH}
            defaultValue={profile.name}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "shop-name-error" : undefined}
            onChange={() => clearError("name")}
          />
          {fieldErrors.name && <p className="field-error" id="shop-name-error" role="alert">{fieldErrors.name}</p>}
        </div>
        <div className="field">
          <label htmlFor="shop-business-type">Jenis usaha</label>
          <input
            id="shop-business-type"
            name="business_type"
            type="text"
            autoComplete="off"
            maxLength={BUSINESS_TYPE_MAX_LENGTH}
            defaultValue={profile.businessType}
            placeholder="Contoh: Warung makan"
            aria-invalid={Boolean(fieldErrors.business_type)}
            aria-describedby={fieldErrors.business_type ? "shop-business-type-error" : undefined}
            onChange={() => clearError("business_type")}
          />
          {fieldErrors.business_type && <p className="field-error" id="shop-business-type-error" role="alert">{fieldErrors.business_type}</p>}
        </div>
      </div>

      <div className={styles.formStep} hidden={step !== 2}>
        <div className="field">
          <label htmlFor="shop-opening-hours">Jam buka (opsional)</label>
          <input
            id="shop-opening-hours"
            name="opening_hours"
            type="text"
            autoComplete="off"
            maxLength={OPENING_HOURS_MAX_LENGTH}
            defaultValue={profile.openingHours ?? ""}
            placeholder="Contoh: 07.00 - 21.00"
            aria-invalid={Boolean(fieldErrors.opening_hours)}
            aria-describedby={fieldErrors.opening_hours ? "shop-opening-hours-error" : undefined}
            onChange={() => clearError("opening_hours")}
          />
          {fieldErrors.opening_hours && <p className="field-error" id="shop-opening-hours-error" role="alert">{fieldErrors.opening_hours}</p>}
        </div>
        <div className="field">
          <label htmlFor="shop-address">Alamat (opsional)</label>
          <input
            id="shop-address"
            name="address"
            type="text"
            autoComplete="street-address"
            maxLength={ADDRESS_MAX_LENGTH}
            defaultValue={profile.address ?? ""}
            placeholder="Contoh: Jl. Melati 3"
            aria-invalid={Boolean(fieldErrors.address)}
            aria-describedby={fieldErrors.address ? "shop-address-error" : undefined}
            onChange={() => clearError("address")}
          />
          {fieldErrors.address && <p className="field-error" id="shop-address-error" role="alert">{fieldErrors.address}</p>}
        </div>
        <p className="field-hint">Jam buka dan alamat bebas ditulis. Keduanya dipakai AI untuk menjawab pertanyaan pelanggan pada tahap berikutnya.</p>
      </div>

      <div className={styles.formActions}>
        {step === 2 && <button className="secondary-button" type="button" onClick={() => setStep(1)}>Kembali</button>}
        {step === 1
          ? <button className="primary-button" type="button" onClick={goToSecondStep}>Lanjut</button>
          : <button className="primary-button" type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan profil"}</button>}
      </div>
    </form>
  );
}

export function ShopProfileForm({ profile }: { profile: ShopProfile }) {
  const [state, formAction, pending] = useActionState(updateShopProfile, initialState);
  const [dispatching, startDispatch] = useTransition();
  const busy = pending || dispatching;

  return (
    <section className="panel" aria-labelledby="shop-profile-form-title">
      <div className="section-heading">
        <div><p className="eyebrow">PROFIL WARUNG</p><h2 id="shop-profile-form-title">Ubah profil</h2></div>
        <span className="subtle-tag">Dua langkah</span>
      </div>

      {state.status === "success" && <p className="notice" role="status">{state.message}</p>}
      {state.status === "error" && !Object.keys(state.fieldErrors ?? {}).length && <p className="auth-notice" role="alert">{state.message}</p>}

      <ProfileFields
        key={state.status === "success" ? state.nonce ?? "saved" : "entry"}
        profile={profile}
        serverFieldErrors={state.fieldErrors}
        busy={busy}
        dispatch={(formData) => startDispatch(() => formAction(formData))}
      />
    </section>
  );
}

export function AutoReplyForm({ enabled }: { enabled: boolean }) {
  const [state, formAction, pending] = useActionState(toggleAutoReply, initialState);
  const [dispatching, startDispatch] = useTransition();
  const busy = pending || dispatching;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startDispatch(() => formAction(formData));
  }

  return (
    <form
      key={state.status === "success" ? state.nonce ?? "saved" : "entry"}
      className={styles.switchForm}
      onSubmit={handleSubmit}
      noValidate
    >
      {state.status === "success" && <p className="notice" role="status">{state.message}</p>}
      {state.status === "error" && <p className="auth-notice" role="alert">{state.message}</p>}

      <label className={styles.switchRow} htmlFor="auto-reply-enabled">
        <input id="auto-reply-enabled" name="enabled" type="checkbox" defaultChecked={enabled} />
        <span>
          <strong>Balasan otomatis ke pelanggan</strong>
          <span>Simpan pilihan sekarang. Pengiriman balasan otomatis belum aktif pada versi ini.</span>
        </span>
      </label>

      <div className={styles.formActions}>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan pilihan"}</button>
      </div>
    </form>
  );
}
