"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { collectFieldErrors, expenseInputSchema, incomeInputSchema } from "@/lib/ledger";
import { recordCashEntry, type CashEntryState } from "./actions";

type Kind = "income" | "expense";

const initialState: CashEntryState = { status: "idle", message: "" };
const schemas = { income: incomeInputSchema, expense: expenseInputSchema } as const;

export function QuickAddForm({ today }: { today: string }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [state, formAction, pending] = useActionState(recordCashEntry, initialState);
  const [dispatching, startDispatch] = useTransition();

  const fieldErrors = { ...state.fieldErrors, ...clientErrors };
  const busy = pending || dispatching;

  function clearError(field: string) {
    setClientErrors((current) => ({ ...current, [field]: "" }));
  }

  function closeForm() {
    setKind(null);
    setClientErrors({});
  }

  function selectKind(next: Kind) {
    setKind(next);
    setClientErrors({});
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind) return;
    const formData = new FormData(event.currentTarget);
    const parsed = schemas[kind].safeParse({
      amount: String(formData.get("amount") ?? ""),
      description: String(formData.get("description") ?? ""),
      occurred_on: String(formData.get("occurred_on") ?? ""),
    });
    if (!parsed.success) {
      setClientErrors(collectFieldErrors(parsed.error));
      return;
    }
    setClientErrors({});
    formData.set("kind", kind);
    startDispatch(() => formAction(formData));
  }

  return (
    <section className="panel" aria-labelledby="quick-add-title">
      <div className="section-heading">
        <div><p className="eyebrow">CATAT CEPAT</p><h2 id="quick-add-title">Tambah uang masuk atau keluar</h2></div>
      </div>
      <div className="quick-actions">
        <button type="button" className="quick-button income-button" aria-pressed={kind === "income"} onClick={() => selectKind("income")}>Uang masuk</button>
        <button type="button" className="quick-button expense-button" aria-pressed={kind === "expense"} onClick={() => selectKind("expense")}>Uang keluar</button>
      </div>

      {state.status === "success" && <p className="notice" role="status">{state.message}</p>}
      {state.status === "error" && !Object.keys(state.fieldErrors ?? {}).length && <p className="auth-notice" role="alert">{state.message}</p>}

      {kind && (
        <form
          key={state.status === "success" ? state.nonce ?? "saved" : "entry"}
          className="entry-form"
          onSubmit={handleSubmit}
          noValidate
        >
          <h3>Catat {kind === "income" ? "uang masuk" : "uang keluar"}</h3>
          <div className="field">
            <label htmlFor="cash-amount">Nominal (rupiah)</label>
            <input
              id="cash-amount"
              name="amount"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Contoh: 25000"
              aria-invalid={Boolean(fieldErrors.amount)}
              aria-describedby={fieldErrors.amount ? "cash-amount-error" : undefined}
              onChange={() => clearError("amount")}
            />
            {fieldErrors.amount && <p className="field-error" id="cash-amount-error" role="alert">{fieldErrors.amount}</p>}
          </div>
          <div className="field">
            <label htmlFor="cash-description">{kind === "expense" ? "Keterangan" : "Keterangan (opsional)"}</label>
            <input
              id="cash-description"
              name="description"
              type="text"
              autoComplete="off"
              maxLength={120}
              placeholder={kind === "expense" ? "Contoh: Belanja sayur" : "Contoh: Jualan pagi"}
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={fieldErrors.description ? "cash-description-error" : undefined}
              onChange={() => clearError("description")}
            />
            {fieldErrors.description && <p className="field-error" id="cash-description-error" role="alert">{fieldErrors.description}</p>}
          </div>
          <div className="field">
            <label htmlFor="cash-date">Tanggal (opsional)</label>
            <input id="cash-date" name="occurred_on" type="date" max={today} aria-describedby="cash-date-hint" />
            <p id="cash-date-hint" className="field-hint">Kosongkan untuk mencatat waktu sekarang. Zona waktu Asia/Jakarta.</p>
            {fieldErrors.occurred_on && <p className="field-error" id="cash-date-error" role="alert">{fieldErrors.occurred_on}</p>}
          </div>
          <div className="entry-actions">
            <button className="primary-button" type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan"}</button>
            <button className="secondary-button" type="button" onClick={closeForm}>Batal</button>
          </div>
        </form>
      )}
    </section>
  );
}
