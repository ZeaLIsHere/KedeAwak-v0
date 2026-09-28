"use client";

import { useActionState, useEffect, useState, useTransition, type FormEvent } from "react";
import {
  debtRemaining,
  debtStatusLabel,
  debtStatusTone,
  deleteDebtSchema,
  formatDueDate,
  isDebtOverdue,
  partyTypeLabel,
  planRepayment,
  recordRepaymentSchema,
  type Debt,
} from "@/lib/debts";
import { collectFieldErrors, formatRupiah } from "@/lib/ledger";
import { deleteDebt, recordDebtRepayment, type DebtActionState } from "./actions";
import styles from "./utang.module.css";

const initialState: DebtActionState = { status: "idle", message: "" };

type RowMode = "view" | "repay" | "delete";

export function DebtList({ debts, todayKey }: { debts: Debt[]; todayKey: string }) {
  if (debts.length === 0) {
    return <p className="empty-state">Belum ada hutang tercatat. Tambahkan catatan lewat formulir di atas.</p>;
  }

  return (
    <ul className="data-list">
      {debts.map((debt) => <DebtItem key={debt.id} debt={debt} todayKey={todayKey} />)}
    </ul>
  );
}

function DebtItem({ debt, todayKey }: { debt: Debt; todayKey: string }) {
  const [mode, setMode] = useState<RowMode>("view");
  const remaining = debtRemaining(debt.amount, debt.paidAmount);
  const overdue = debt.status !== "paid" && isDebtOverdue(debt.dueDate, todayKey);
  const close = () => setMode("view");
  const toggle = (next: RowMode) => setMode(mode === next ? "view" : next);

  return (
    <li className={styles.debtItem}>
      <div className="data-row">
        <div>
          <strong>{debt.partyName}</strong>
          <span>{partyTypeLabel(debt.partyType)} · {formatDueDate(debt.dueDate)}</span>
          <span>Hutang {formatRupiah(debt.amount)} · sudah dibayar {formatRupiah(debt.paidAmount)}</span>
          <span>Sisa {formatRupiah(remaining)}</span>
          {overdue && <span className={styles.overdueNote}>Jatuh tempo sudah lewat</span>}
        </div>
        <div className="row-end">
          <span className={`status-pill ${debtStatusTone(debt.status)}`}>{debtStatusLabel(debt.status)}</span>
        </div>
      </div>

      <div className={styles.rowActions}>
        {debt.status !== "paid" && (
          <button type="button" className="secondary-button" aria-expanded={mode === "repay"} onClick={() => toggle("repay")}>Catat pelunasan</button>
        )}
        <button type="button" className={`secondary-button ${styles.dangerButton}`} aria-expanded={mode === "delete"} onClick={() => toggle("delete")}>Hapus</button>
      </div>

      {mode === "repay" && <RepaymentForm debt={debt} remaining={remaining} onClose={close} />}
      {mode === "delete" && <DeleteDebtForm debt={debt} onClose={close} />}
    </li>
  );
}

function RepaymentForm({ debt, remaining, onClose }: { debt: Debt; remaining: number; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(recordDebtRepayment, initialState);
  const [amount, setAmount] = useState("");
  const [clientError, setClientError] = useState("");
  const [dispatching, startDispatch] = useTransition();
  const busy = pending || dispatching;
  const serverError = state.fieldErrors?.amount || (state.status === "error" ? state.message : "");
  const errorMessage = clientError || serverError;

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state.status, state.nonce, onClose]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = recordRepaymentSchema.safeParse({ debt_id: debt.id, amount });
    if (!parsed.success) {
      setClientError(collectFieldErrors(parsed.error).amount ?? "Periksa nominal pelunasan.");
      return;
    }
    const plan = planRepayment(debt.amount, debt.paidAmount, parsed.data.amount);
    if (!plan.ok) {
      setClientError(plan.message);
      return;
    }
    setClientError("");
    const formData = new FormData();
    formData.set("debt_id", debt.id);
    formData.set("amount", amount);
    startDispatch(() => formAction(formData));
  }

  return (
    <form className="entry-form" onSubmit={handleSubmit} noValidate>
      <h3>Pelunasan {debt.partyName}</h3>
      <input type="hidden" name="debt_id" value={debt.id} />
      <p className="field-hint">Sisa hutang saat ini {formatRupiah(remaining)}. Isi sesuai jumlah yang dibayar.</p>
      <div className="field">
        <label htmlFor={`repay-${debt.id}`}>Nominal pelunasan (rupiah)</label>
        <input
          id={`repay-${debt.id}`}
          name="amount"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Contoh: 25000"
          value={amount}
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={errorMessage ? `repay-error-${debt.id}` : undefined}
          onChange={(event) => { setAmount(event.target.value); setClientError(""); }}
        />
        {errorMessage && <p className="field-error" id={`repay-error-${debt.id}`} role="alert">{errorMessage}</p>}
      </div>
      <div className="entry-actions">
        <button className="secondary-button" type="button" onClick={() => { setAmount(String(remaining)); setClientError(""); }}>Lunasi penuh</button>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan pelunasan"}</button>
        <button className="secondary-button" type="button" onClick={onClose}>Batal</button>
      </div>
    </form>
  );
}

function DeleteDebtForm({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(deleteDebt, initialState);
  const [dispatching, startDispatch] = useTransition();
  const busy = pending || dispatching;

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state.status, state.nonce, onClose]);

  function handleDelete() {
    const parsed = deleteDebtSchema.safeParse({ debt_id: debt.id });
    if (!parsed.success) return;
    const formData = new FormData();
    formData.set("debt_id", debt.id);
    startDispatch(() => formAction(formData));
  }

  return (
    <div className={styles.confirmBox} role="group" aria-label="Konfirmasi hapus hutang">
      <p className="muted">Hapus hutang <strong>{debt.partyName}</strong> sebesar {formatRupiah(debt.amount)}? Tindakan ini tidak dapat dibatalkan.</p>
      {state.status === "error" && <p className="auth-notice" role="alert">{state.message}</p>}
      <div className="entry-actions">
        <button className={`primary-button ${styles.dangerButtonSolid}`} type="button" disabled={busy} onClick={handleDelete}>
          {busy ? "Menghapus..." : "Hapus hutang"}
        </button>
        <button className="secondary-button" type="button" onClick={onClose}>Batal</button>
      </div>
    </div>
  );
}
