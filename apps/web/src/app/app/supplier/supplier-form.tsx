"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { collectFieldErrors } from "@/lib/ledger";
import {
  createSupplierSchema,
  SUPPLIER_NAME_MAX_LENGTH,
  SUPPLIER_PHONE_MAX_LENGTH,
  SUPPLIER_PRODUCTS_NOTE_MAX_LENGTH,
} from "@/lib/suppliers";
import { createSupplier, type SupplierActionState } from "./actions";
import styles from "./supplier.module.css";

const initialState: SupplierActionState = { status: "idle", message: "" };

type SupplierCreateFieldsProps = {
  serverFieldErrors?: Record<string, string>;
  busy: boolean;
  dispatch: (formData: FormData) => void;
};

function readForm(form: HTMLFormElement) {
  const formData = new FormData(form);
  return {
    name: String(formData.get("name") ?? ""),
    wa_phone: String(formData.get("wa_phone") ?? ""),
    products: String(formData.get("products") ?? ""),
  };
}

function SupplierCreateFields({ serverFieldErrors, busy, dispatch }: SupplierCreateFieldsProps) {
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const fieldErrors = { ...serverFieldErrors, ...clientErrors };

  function clearError(field: string) {
    setClientErrors((current) => ({ ...current, [field]: "" }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = createSupplierSchema.safeParse(readForm(form));
    if (!parsed.success) {
      setClientErrors(collectFieldErrors(parsed.error));
      return;
    }
    setClientErrors({});
    dispatch(new FormData(form));
  }

  return (
    <form className="entry-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="supplier-name">Nama supplier</label>
        <input
          id="supplier-name"
          name="name"
          type="text"
          autoComplete="off"
          maxLength={SUPPLIER_NAME_MAX_LENGTH}
          placeholder="Contoh: Toko Beras Melati"
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? "supplier-name-error" : undefined}
          onChange={() => clearError("name")}
        />
        {fieldErrors.name && <p className="field-error" id="supplier-name-error" role="alert">{fieldErrors.name}</p>}
      </div>

      <div className="field">
        <label htmlFor="supplier-phone">Nomor WhatsApp</label>
        <input
          id="supplier-phone"
          name="wa_phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          maxLength={SUPPLIER_PHONE_MAX_LENGTH}
          placeholder="Contoh: +6281234567890"
          aria-invalid={Boolean(fieldErrors.wa_phone)}
          aria-describedby={fieldErrors.wa_phone ? "supplier-phone-error" : undefined}
          onChange={() => clearError("wa_phone")}
        />
        {fieldErrors.wa_phone && <p className="field-error" id="supplier-phone-error" role="alert">{fieldErrors.wa_phone}</p>}
        <p className="field-hint">Gunakan format internasional +62. Nomor lokal 08... otomatis diubah ke +62.</p>
      </div>

      <div className="field">
        <label htmlFor="supplier-products">Produk yang disuplai (opsional)</label>
        <input
          id="supplier-products"
          name="products"
          type="text"
          autoComplete="off"
          maxLength={SUPPLIER_PRODUCTS_NOTE_MAX_LENGTH}
          placeholder="Contoh: Beras, Gula, Minyak"
          aria-invalid={Boolean(fieldErrors.products)}
          aria-describedby={fieldErrors.products ? "supplier-products-error" : undefined}
          onChange={() => clearError("products")}
        />
        {fieldErrors.products && <p className="field-error" id="supplier-products-error" role="alert">{fieldErrors.products}</p>}
        <p className="field-hint">Pisahkan dengan koma. Catatan ini hanya untuk pengingat, belum dipakai untuk membuat pesanan.</p>
      </div>

      <div className={styles.formActions}>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan supplier"}</button>
      </div>
    </form>
  );
}

export function SupplierForm() {
  const [state, formAction, pending] = useActionState(createSupplier, initialState);
  const [dispatching, startDispatch] = useTransition();
  const busy = pending || dispatching;

  return (
    <section className="panel" aria-labelledby="supplier-form-title">
      <div className="section-heading">
        <div><p className="eyebrow">TAMBAH SUPPLIER</p><h2 id="supplier-form-title">Supplier baru</h2></div>
        <span className="subtle-tag">Tiga isian</span>
      </div>

      {state.status === "success" && <p className="notice" role="status">{state.message}</p>}
      {state.status === "error" && !Object.keys(state.fieldErrors ?? {}).length && <p className="auth-notice" role="alert">{state.message}</p>}

      <SupplierCreateFields
        key={state.status === "success" ? state.nonce ?? "saved" : "entry"}
        serverFieldErrors={state.fieldErrors}
        busy={busy}
        dispatch={(formData) => startDispatch(() => formAction(formData))}
      />
    </section>
  );
}
