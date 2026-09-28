"use client";

import { useActionState, useEffect, useState, useTransition, type FormEvent } from "react";
import { collectFieldErrors, formatRupiah } from "@/lib/ledger";
import {
  adjustStockSchema,
  deleteProductSchema,
  formatStockQty,
  listLowStockProducts,
  stockStatus,
  stockStatusLabel,
  toStockInputValue,
  updateMinStockSchema,
  type Product,
} from "@/lib/inventory";
import { adjustStock, deleteProduct, updateMinStock, type ProductActionState } from "./actions";
import styles from "./produk.module.css";

const initialState: ProductActionState = { status: "idle", message: "" };

type RowMode = "view" | "adjust" | "min" | "delete";

export function ProductList({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return <p className="empty-state">Belum ada produk tercatat. Tambahkan produk baru lewat formulir di bawah.</p>;
  }
  const lowStockCount = listLowStockProducts(products).length;

  return (
    <>
      {lowStockCount > 0 && (
        <p className={styles.stockSummary}>{lowStockCount} produk perlu restok (stok sampai dengan ambang minimum).</p>
      )}
      <ul className="data-list">
        {products.map((product) => <ProductRow key={product.id} product={product} />)}
      </ul>
    </>
  );
}

function ProductRow({ product }: { product: Product }) {
  const [mode, setMode] = useState<RowMode>("view");
  const status = stockStatus(product.stockQty, product.minStock);
  const close = () => setMode("view");
  const toggle = (next: RowMode) => setMode(mode === next ? "view" : next);

  return (
    <li className={styles.productItem}>
      <div className="data-row">
        <div>
          <strong>{product.name}</strong>
          <span>Satuan: {product.unit}</span>
          <span>Stok {formatStockQty(product.stockQty)} {product.unit} · ambang {formatStockQty(product.minStock)}</span>
          <span>Harga jual {formatRupiah(product.sellPrice)} · harga beli {formatRupiah(product.buyPrice)}</span>
        </div>
        <div className="row-end">
          <span className={`status-pill ${status === "low" ? "warning" : "good"}`}>{stockStatusLabel(status)}</span>
        </div>
      </div>

      <div className={styles.rowActions}>
        <button type="button" className="secondary-button" aria-expanded={mode === "adjust"} onClick={() => toggle("adjust")}>Stok opname</button>
        <button type="button" className="secondary-button" aria-expanded={mode === "min"} onClick={() => toggle("min")}>Ubah ambang</button>
        <button type="button" className={`secondary-button ${styles.dangerButton}`} aria-expanded={mode === "delete"} onClick={() => toggle("delete")}>Hapus</button>
      </div>

      {mode === "adjust" && <StockAdjustmentForm product={product} onClose={close} />}
      {mode === "min" && <MinStockForm product={product} onClose={close} />}
      {mode === "delete" && <DeleteProductForm product={product} onClose={close} />}
    </li>
  );
}

function StockAdjustmentForm({ product, onClose }: { product: Product; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(adjustStock, initialState);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [dispatching, startDispatch] = useTransition();
  const fieldErrors = { ...state.fieldErrors, ...clientErrors };
  const busy = pending || dispatching;

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state.status, state.nonce, onClose]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const parsed = adjustStockSchema.safeParse({
      product_id: formData.get("product_id") ?? "",
      stock_qty: formData.get("stock_qty") ?? "",
      reason: formData.get("reason") ?? "",
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
      <h3>Stok opname {product.name}</h3>
      {state.status === "error" && !Object.keys(state.fieldErrors ?? {}).length && <p className="auth-notice" role="alert">{state.message}</p>}
      <input type="hidden" name="product_id" value={product.id} />
      <div className="field">
        <label htmlFor={`stock-${product.id}`}>Stok fisik sekarang ({product.unit})</label>
        <input
          id={`stock-${product.id}`}
          name="stock_qty"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          defaultValue={toStockInputValue(product.stockQty)}
          aria-invalid={Boolean(fieldErrors.stock_qty)}
          aria-describedby={fieldErrors.stock_qty ? `stock-error-${product.id}` : undefined}
          onChange={() => setClientErrors((current) => ({ ...current, stock_qty: "" }))}
        />
        {fieldErrors.stock_qty && <p className="field-error" id={`stock-error-${product.id}`} role="alert">{fieldErrors.stock_qty}</p>}
      </div>
      <div className="field">
        <label htmlFor={`reason-${product.id}`}>Alasan penyesuaian</label>
        <input
          id={`reason-${product.id}`}
          name="reason"
          type="text"
          autoComplete="off"
          maxLength={120}
          placeholder="Contoh: barang rusak atau selisih hitung"
          aria-invalid={Boolean(fieldErrors.reason)}
          aria-describedby={fieldErrors.reason ? `reason-error-${product.id}` : undefined}
          onChange={() => setClientErrors((current) => ({ ...current, reason: "" }))}
        />
        {fieldErrors.reason && <p className="field-error" id={`reason-error-${product.id}`} role="alert">{fieldErrors.reason}</p>}
      </div>
      <div className="entry-actions">
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan stok"}</button>
        <button className="secondary-button" type="button" onClick={onClose}>Batal</button>
      </div>
    </form>
  );
}

function MinStockForm({ product, onClose }: { product: Product; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(updateMinStock, initialState);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [dispatching, startDispatch] = useTransition();
  const fieldErrors = { ...state.fieldErrors, ...clientErrors };
  const busy = pending || dispatching;

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state.status, state.nonce, onClose]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const parsed = updateMinStockSchema.safeParse({
      product_id: formData.get("product_id") ?? "",
      min_stock: formData.get("min_stock") ?? "",
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
      <h3>Ambang minimum {product.name}</h3>
      {state.status === "error" && !Object.keys(state.fieldErrors ?? {}).length && <p className="auth-notice" role="alert">{state.message}</p>}
      <input type="hidden" name="product_id" value={product.id} />
      <div className="field">
        <label htmlFor={`min-${product.id}`}>Ambang minimum ({product.unit})</label>
        <input
          id={`min-${product.id}`}
          name="min_stock"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          defaultValue={toStockInputValue(product.minStock)}
          aria-invalid={Boolean(fieldErrors.min_stock)}
          aria-describedby={fieldErrors.min_stock ? `min-error-${product.id}` : undefined}
          onChange={() => setClientErrors((current) => ({ ...current, min_stock: "" }))}
        />
        {fieldErrors.min_stock && <p className="field-error" id={`min-error-${product.id}`} role="alert">{fieldErrors.min_stock}</p>}
        <p className="field-hint">Badge stok menipis muncul saat stok sampai dengan angka ini.</p>
      </div>
      <div className="entry-actions">
        <button className="primary-button" type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan ambang"}</button>
        <button className="secondary-button" type="button" onClick={onClose}>Batal</button>
      </div>
    </form>
  );
}

function DeleteProductForm({ product, onClose }: { product: Product; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(deleteProduct, initialState);
  const [dispatching, startDispatch] = useTransition();
  const busy = pending || dispatching;

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state.status, state.nonce, onClose]);

  function handleDelete() {
    const formData = new FormData();
    formData.set("product_id", product.id);
    const parsed = deleteProductSchema.safeParse({ product_id: product.id });
    if (!parsed.success) return;
    startDispatch(() => formAction(formData));
  }

  return (
    <div className={styles.confirmBox} role="group" aria-label="Konfirmasi hapus produk">
      <p className="muted">Hapus produk <strong>{product.name}</strong>? Tindakan ini tidak dapat dibatalkan.</p>
      {state.status === "error" && <p className="auth-notice" role="alert">{state.message}</p>}
      <div className="entry-actions">
        <button className={`primary-button ${styles.dangerButtonSolid}`} type="button" disabled={busy} onClick={handleDelete}>
          {busy ? "Menghapus..." : "Hapus produk"}
        </button>
        <button className="secondary-button" type="button" onClick={onClose}>Batal</button>
      </div>
    </div>
  );
}
