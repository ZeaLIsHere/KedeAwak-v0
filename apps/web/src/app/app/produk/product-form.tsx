"use client";

import { useActionState, useRef, useState, useTransition, type FormEvent } from "react";
import { collectFieldErrors } from "@/lib/ledger";
import { createProductSchema, PRODUCT_NAME_MAX_LENGTH, PRODUCT_UNIT_MAX_LENGTH } from "@/lib/inventory";
import { createProduct, type ProductActionState } from "./actions";
import styles from "./produk.module.css";

const initialState: ProductActionState = { status: "idle", message: "" };
const STEP_ONE_FIELDS = new Set(["name", "unit"]);

type FormValues = {
  name: string;
  unit: string;
  sell_price: string;
  buy_price: string;
  stock_qty: string;
  min_stock: string;
};

function readForm(form: HTMLFormElement): FormValues {
  const formData = new FormData(form);
  return {
    name: String(formData.get("name") ?? ""),
    unit: String(formData.get("unit") ?? ""),
    sell_price: String(formData.get("sell_price") ?? ""),
    buy_price: String(formData.get("buy_price") ?? ""),
    stock_qty: String(formData.get("stock_qty") ?? ""),
    min_stock: String(formData.get("min_stock") ?? ""),
  };
}

type ProductCreateFieldsProps = {
  serverFieldErrors?: Record<string, string>;
  busy: boolean;
  dispatch: (formData: FormData) => void;
};

function ProductCreateFields({ serverFieldErrors, busy, dispatch }: ProductCreateFieldsProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const fieldErrors = { ...serverFieldErrors, ...clientErrors };

  function clearError(field: string) {
    setClientErrors((current) => ({ ...current, [field]: "" }));
  }

  function handleNext() {
    if (!formRef.current) return;
    const parsed = createProductSchema.safeParse(readForm(formRef.current));
    const errors = parsed.success ? {} : collectFieldErrors(parsed.error);
    setClientErrors(errors);
    if (!Object.keys(errors).some((key) => STEP_ONE_FIELDS.has(key))) setStep(2);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = createProductSchema.safeParse(readForm(form));
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
          <label htmlFor="product-name">Nama produk</label>
          <input
            id="product-name"
            name="name"
            type="text"
            autoComplete="off"
            maxLength={PRODUCT_NAME_MAX_LENGTH}
            placeholder="Contoh: Gula pasir"
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "product-name-error" : undefined}
            onChange={() => clearError("name")}
          />
          {fieldErrors.name && <p className="field-error" id="product-name-error" role="alert">{fieldErrors.name}</p>}
        </div>
        <div className="field">
          <label htmlFor="product-unit">Satuan</label>
          <input
            id="product-unit"
            name="unit"
            type="text"
            autoComplete="off"
            maxLength={PRODUCT_UNIT_MAX_LENGTH}
            placeholder="Contoh: kg, botol, pcs"
            aria-invalid={Boolean(fieldErrors.unit)}
            aria-describedby={fieldErrors.unit ? "product-unit-error" : undefined}
            onChange={() => clearError("unit")}
          />
          {fieldErrors.unit && <p className="field-error" id="product-unit-error" role="alert">{fieldErrors.unit}</p>}
        </div>
      </div>

      <div className={styles.formStep} hidden={step !== 2}>
        <div className={styles.fieldRow}>
          <div className="field">
            <label htmlFor="product-sell">Harga jual (rupiah)</label>
            <input
              id="product-sell"
              name="sell_price"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Contoh: 15000"
              aria-invalid={Boolean(fieldErrors.sell_price)}
              aria-describedby={fieldErrors.sell_price ? "product-sell-error" : undefined}
              onChange={() => clearError("sell_price")}
            />
            {fieldErrors.sell_price && <p className="field-error" id="product-sell-error" role="alert">{fieldErrors.sell_price}</p>}
          </div>
          <div className="field">
            <label htmlFor="product-buy">Harga beli (rupiah)</label>
            <input
              id="product-buy"
              name="buy_price"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Contoh: 12000"
              aria-invalid={Boolean(fieldErrors.buy_price)}
              aria-describedby={fieldErrors.buy_price ? "product-buy-error" : undefined}
              onChange={() => clearError("buy_price")}
            />
            {fieldErrors.buy_price && <p className="field-error" id="product-buy-error" role="alert">{fieldErrors.buy_price}</p>}
          </div>
        </div>
        <div className={styles.fieldRow}>
          <div className="field">
            <label htmlFor="product-stock">Stok awal</label>
            <input
              id="product-stock"
              name="stock_qty"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Contoh: 10"
              aria-invalid={Boolean(fieldErrors.stock_qty)}
              aria-describedby={fieldErrors.stock_qty ? "product-stock-error" : undefined}
              onChange={() => clearError("stock_qty")}
            />
            {fieldErrors.stock_qty && <p className="field-error" id="product-stock-error" role="alert">{fieldErrors.stock_qty}</p>}
          </div>
          <div className="field">
            <label htmlFor="product-min">Ambang minimum</label>
            <input
              id="product-min"
              name="min_stock"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Contoh: 3"
              aria-invalid={Boolean(fieldErrors.min_stock)}
              aria-describedby={fieldErrors.min_stock ? "product-min-error" : undefined}
              onChange={() => clearError("min_stock")}
            />
            {fieldErrors.min_stock && <p className="field-error" id="product-min-error" role="alert">{fieldErrors.min_stock}</p>}
          </div>
        </div>
        <p className="field-hint">Harga memakai angka rupiah bulat. Stok dan ambang memakai angka; gunakan koma untuk desimal (contoh: 1,5).</p>
      </div>

      <div className={styles.formActions}>
        {step === 2 && <button className="secondary-button" type="button" onClick={() => setStep(1)}>Kembali</button>}
        {step === 1
          ? <button className="primary-button" type="button" onClick={handleNext}>Lanjut</button>
          : <button className="primary-button" type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan produk"}</button>}
      </div>
    </form>
  );
}

export function ProductForm() {
  const [state, formAction, pending] = useActionState(createProduct, initialState);
  const [dispatching, startDispatch] = useTransition();
  const busy = pending || dispatching;

  return (
    <section className="panel" aria-labelledby="product-form-title">
      <div className="section-heading">
        <div><p className="eyebrow">TAMBAH PRODUK</p><h2 id="product-form-title">Produk baru</h2></div>
        <span className="subtle-tag">Dua langkah</span>
      </div>

      {state.status === "success" && <p className="notice" role="status">{state.message}</p>}
      {state.status === "error" && !Object.keys(state.fieldErrors ?? {}).length && <p className="auth-notice" role="alert">{state.message}</p>}

      <ProductCreateFields
        key={state.status === "success" ? state.nonce ?? "saved" : "entry"}
        serverFieldErrors={state.fieldErrors}
        busy={busy}
        dispatch={(formData) => startDispatch(() => formAction(formData))}
      />
    </section>
  );
}
