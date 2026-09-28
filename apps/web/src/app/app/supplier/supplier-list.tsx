"use client";

import { useActionState, useEffect, useState, useTransition, type FormEvent } from "react";
import { collectFieldErrors } from "@/lib/ledger";
import {
  deleteSupplierSchema,
  formatProductsNote,
  updateSupplierSchema,
  SUPPLIER_NAME_MAX_LENGTH,
  SUPPLIER_PHONE_MAX_LENGTH,
  SUPPLIER_PRODUCTS_NOTE_MAX_LENGTH,
  type Supplier,
} from "@/lib/suppliers";
import { deleteSupplier, updateSupplier, type SupplierActionState } from "./actions";
import styles from "./supplier.module.css";

const initialState: SupplierActionState = { status: "idle", message: "" };

type RowMode = "view" | "edit" | "delete";

export function SupplierList({ suppliers }: { suppliers: Supplier[] }) {
  if (suppliers.length === 0) {
    return <p className="empty-state">Belum ada supplier tercatat. Tambahkan supplier lewat formulir di atas.</p>;
  }

  return (
    <ul className="data-list">
      {suppliers.map((supplier) => <SupplierItem key={supplier.id} supplier={supplier} />)}
    </ul>
  );
}

function SupplierItem({ supplier }: { supplier: Supplier }) {
  const [mode, setMode] = useState<RowMode>("view");
  const close = () => setMode("view");
  const toggle = (next: RowMode) => setMode(mode === next ? "view" : next);

  return (
    <li className={styles.supplierItem}>
      <div className="data-row">
        <div>
          <strong>{supplier.name}</strong>
          <span>WhatsApp {supplier.waPhone}</span>
          <span>{supplier.products.length > 0 ? `Produk: ${supplier.products.join(", ")}` : "Produk belum dicatat"}</span>
        </div>
        <div className="row-end">
          <span className="status-pill warning">Belum bisa PO</span>
        </div>
      </div>

      <div className={styles.rowActions}>
        <button type="button" className="secondary-button" aria-expanded={mode === "edit"} onClick={() => toggle("edit")}>Ubah</button>
        <button type="button" className={`secondary-button ${styles.dangerButton}`} aria-expanded={mode === "delete"} onClick={() => toggle("delete")}>Hapus</button>
      </div>

      {mode === "edit" && <EditSupplierForm supplier={supplier} onClose={close} />}
      {mode === "delete" && <DeleteSupplierForm supplier={supplier} onClose={close} />}
    </li>
  );
}

function EditSupplierForm({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(updateSupplier, initialState);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [dispatching, startDispatch] = useTransition();
  const fieldErrors = { ...state.fieldErrors, ...clientErrors };
  const busy = pending || dispatching;

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state.status, state.nonce, onClose]);

  function clearError(field: string) {
    setClientErrors((current) => ({ ...current, [field]: "" }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = updateSupplierSchema.safeParse({
      supplier_id: formData.get("supplier_id") ?? "",
      name: formData.get("name") ?? "",
      wa_phone: formData.get("wa_phone") ?? "",
      products: formData.get("products") ?? "",
    });
    if (!parsed.success) {
      setClientErrors(collectFieldErrors(parsed.error));
      return;
    }
    setClientErrors({});
    startDispatch(() => formAction(formData));
  }

  return (
    <form className="entry-form" onSubmit={handleSubmit} noValidate>
      <h3>Ubah {supplier.name}</h3>
      {state.status === "error" && !Object.keys(state.fieldErrors ?? {}).length && <p className="auth-notice" role="alert">{state.message}</p>}
      <input type="hidden" name="supplier_id" value={supplier.id} />
      <div className="field">
        <label htmlFor={`supplier-name-${supplier.id}`}>Nama supplier</label>
        <input
          id={`supplier-name-${supplier.id}`}
          name="name"
          type="text"
          autoComplete="off"
          maxLength={SUPPLIER_NAME_MAX_LENGTH}
          defaultValue={supplier.name}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? `supplier-name-error-${supplier.id}` : undefined}
          onChange={() => clearError("name")}
        />
        {fieldErrors.name && <p className="field-error" id={`supplier-name-error-${supplier.id}`} role="alert">{fieldErrors.name}</p>}
      </div>
      <div className="field">
        <label htmlFor={`supplier-phone-${supplier.id}`}>Nomor WhatsApp</label>
        <input
          id={`supplier-phone-${supplier.id}`}
          name="wa_phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          maxLength={SUPPLIER_PHONE_MAX_LENGTH}
          defaultValue={supplier.waPhone}
          aria-invalid={Boolean(fieldErrors.wa_phone)}
          aria-describedby={fieldErrors.wa_phone ? `supplier-phone-error-${supplier.id}` : undefined}
          onChange={() => clearError("wa_phone")}
        />
        {fieldErrors.wa_phone && <p className="field-error" id={`supplier-phone-error-${supplier.id}`} role="alert">{fieldErrors.wa_phone}</p>}
      </div>
      <div className="field">
        <label htmlFor={`supplier-products-${supplier.id}`}>Produk yang disuplai (opsional)</label>
        <input
          id={`supplier-products-${supplier.id}`}
          name="products"
          type="text"
          autoComplete="off"
          maxLength={SUPPLIER_PRODUCTS_NOTE_MAX_LENGTH}
          defaultValue={formatProductsNote(supplier.products)}
          aria-invalid={Boolean(fieldErrors.products)}
          aria-describedby={fieldErrors.products ? `supplier-products-error-${supplier.id}` : undefined}
          onChange={() => clearError("products")}
        />
        {fieldErrors.products && <p className="field-error" id={`supplier-products-error-${supplier.id}`} role="alert">{fieldErrors.products}</p>}
      </div>
      <div className="entry-actions">
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan perubahan"}</button>
        <button className="secondary-button" type="button" onClick={onClose}>Batal</button>
      </div>
    </form>
  );
}

function DeleteSupplierForm({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(deleteSupplier, initialState);
  const [dispatching, startDispatch] = useTransition();
  const busy = pending || dispatching;

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state.status, state.nonce, onClose]);

  function handleDelete() {
    const parsed = deleteSupplierSchema.safeParse({ supplier_id: supplier.id });
    if (!parsed.success) return;
    const formData = new FormData();
    formData.set("supplier_id", supplier.id);
    startDispatch(() => formAction(formData));
  }

  return (
    <div className={styles.confirmBox} role="group" aria-label="Konfirmasi hapus supplier">
      <p className="muted">Hapus supplier <strong>{supplier.name}</strong>? Tindakan ini tidak dapat dibatalkan.</p>
      {state.status === "error" && <p className="auth-notice" role="alert">{state.message}</p>}
      <div className="entry-actions">
        <button className={`primary-button ${styles.dangerButtonSolid}`} type="button" disabled={busy} onClick={handleDelete}>
          {busy ? "Menghapus..." : "Hapus supplier"}
        </button>
        <button className="secondary-button" type="button" onClick={onClose}>Batal</button>
      </div>
    </div>
  );
}
