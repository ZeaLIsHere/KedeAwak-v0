"use client";

import { useActionState, useRef, useState, useTransition, type FormEvent } from "react";
import { createDebtSchema, DEBT_PARTY_NAME_MAX_LENGTH } from "@/lib/debts";
import { collectFieldErrors } from "@/lib/ledger";
import { createDebt, type DebtActionState } from "./actions";
import styles from "./utang.module.css";

const initialState: DebtActionState = { status: "idle", message: "" };

type FormValues = { party_type: string; party_name: string; amount: string; due_date: string };

function readForm(form: HTMLFormElement): FormValues {
  const formData = new FormData(form);
  return {
    party_type: String(formData.get("party_type") ?? ""),
    party_name: String(formData.get("party_name") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    due_date: String(formData.get("due_date") ?? ""),
  };
}

type DebtCreateFieldsProps = {
  serverFieldErrors?: Record<string, string>;
  busy: boolean;
  dispatch: (formData: FormData) => void;
};

function DebtCreateFields({ serverFieldErrors, busy, dispatch }: DebtCreateFieldsProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const fieldErrors = { ...serverFieldErrors, ...clientErrors };

  function clearError(field: string) {
    setClientErrors((current) => ({ ...current, [field]: "" }));
  }

  function goToSecondStep() {
    if (!formRef.current) return;
    const parsed = createDebtSchema.safeParse(readForm(formRef.current));
    const errors = parsed.success ? {} : collectFieldErrors(parsed.error);
    setClientErrors(errors);
    if (!errors.party_type && !errors.party_name) setStep(2);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = createDebtSchema.safeParse(readForm(form));
    if (!parsed.success) {
      const errors = collectFieldErrors(parsed.error);
      setClientErrors(errors);
      setStep(errors.party_type || errors.party_name ? 1 : 2);
      return;
    }
    setClientErrors({});
    dispatch(new FormData(form));
  }

  return (
    <form ref={formRef} className="entry-form" onSubmit={handleSubmit} noValidate>
      <div className={styles.formStep} hidden={step !== 1}>
        <div className="field">
          <label htmlFor="debt-party-type">Pihak</label>
          <select
            id="debt-party-type"
            name="party_type"
            defaultValue=""
            aria-invalid={Boolean(fieldErrors.party_type)}
            aria-describedby={fieldErrors.party_type ? "debt-party-type-error" : undefined}
            onChange={() => clearError("party_type")}
          >
            <option value="">Pilih pihak</option>
            <option value="customer">Pelanggan (hutang ke warung)</option>
            <option value="supplier">Pemasok (hutang warung)</option>
          </select>
          {fieldErrors.party_type && <p className="field-error" id="debt-party-type-error" role="alert">{fieldErrors.party_type}</p>}
        </div>
        <div className="field">
          <label htmlFor="debt-party-name">Nama pihak</label>
          <input
            id="debt-party-name"
            name="party_name"
            type="text"
            autoComplete="off"
            maxLength={DEBT_PARTY_NAME_MAX_LENGTH}
            placeholder="Contoh: Bu Sari"
            aria-invalid={Boolean(fieldErrors.party_name)}
            aria-describedby={fieldErrors.party_name ? "debt-party-name-error" : undefined}
            onChange={() => clearError("party_name")}
          />
          {fieldErrors.party_name && <p className="field-error" id="debt-party-name-error" role="alert">{fieldErrors.party_name}</p>}
        </div>
      </div>

      <div className={styles.formStep} hidden={step !== 2}>
        <div className={styles.fieldRow}>
          <div className="field">
            <label htmlFor="debt-amount">Nominal hutang (rupiah)</label>
            <input
              id="debt-amount"
              name="amount"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Contoh: 50000"
              aria-invalid={Boolean(fieldErrors.amount)}
              aria-describedby={fieldErrors.amount ? "debt-amount-error" : undefined}
              onChange={() => clearError("amount")}
            />
            {fieldErrors.amount && <p className="field-error" id="debt-amount-error" role="alert">{fieldErrors.amount}</p>}
          </div>
          <div className="field">
            <label htmlFor="debt-due-date">Jatuh tempo (opsional)</label>
            <input
              id="debt-due-date"
              name="due_date"
              type="date"
              aria-invalid={Boolean(fieldErrors.due_date)}
              aria-describedby={fieldErrors.due_date ? "debt-due-date-error" : undefined}
              onChange={() => clearError("due_date")}
            />
            {fieldErrors.due_date && <p className="field-error" id="debt-due-date-error" role="alert">{fieldErrors.due_date}</p>}
          </div>
        </div>
        <p className="field-hint">Nominal memakai angka rupiah bulat. Sisa hutang selalu dihitung oleh sistem, tidak pernah diisi manual.</p>
      </div>

      <div className={styles.formActions}>
        {step === 2 && <button className="secondary-button" type="button" onClick={() => setStep(1)}>Kembali</button>}
        {step === 1
          ? <button className="primary-button" type="button" onClick={goToSecondStep}>Lanjut</button>
          : <button className="primary-button" type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan hutang"}</button>}
      </div>
    </form>
  );
}

export function DebtForm() {
  const [state, formAction, pending] = useActionState(createDebt, initialState);
  const [dispatching, startDispatch] = useTransition();
  const busy = pending || dispatching;

  return (
    <section className="panel" aria-labelledby="debt-form-title">
      <div className="section-heading">
        <div><p className="eyebrow">CATAT HUTANG</p><h2 id="debt-form-title">Hutang baru</h2></div>
        <span className="subtle-tag">Dua langkah</span>
      </div>

      {state.status === "success" && <p className="notice" role="status">{state.message}</p>}
      {state.status === "error" && !Object.keys(state.fieldErrors ?? {}).length && <p className="auth-notice" role="alert">{state.message}</p>}

      <DebtCreateFields
        key={state.status === "success" ? state.nonce ?? "saved" : "entry"}
        serverFieldErrors={state.fieldErrors}
        busy={busy}
        dispatch={(formData) => startDispatch(() => formAction(formData))}
      />
    </section>
  );
}
