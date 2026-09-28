"use client";

import { useActionState, useMemo, useState, useTransition, type FormEvent } from "react";
import { formatStockQty, type Product } from "@/lib/inventory";
import { collectFieldErrors, formatRupiah } from "@/lib/ledger";
import {
  createOrderItemSchema,
  formatQtyMilli,
  MAX_ORDER_ITEMS,
  MAX_QTY_MILLI,
  orderTotal,
  qtyMilliToDecimal,
  type OrderLine,
} from "@/lib/orders";
import { createOrder, type OrderActionState } from "./actions";
import styles from "./pesanan.module.css";

const initialState: OrderActionState = { status: "idle", message: "" };

type OrderDraftFieldsProps = {
  products: readonly Product[];
  busy: boolean;
  dispatch: (formData: FormData) => void;
};

function OrderDraftFields({ products, busy, dispatch }: OrderDraftFieldsProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [qty, setQty] = useState("");
  const [lineError, setLineError] = useState("");
  const [formError, setFormError] = useState("");

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const selected = selectedId ? productById.get(selectedId) : undefined;
  const total = orderTotal(lines);

  function addLine() {
    if (!selected) {
      setLineError("Pilih produk terlebih dahulu.");
      return;
    }
    const parsed = createOrderItemSchema.safeParse({ product_id: selected.id, qty });
    if (!parsed.success) {
      setLineError(collectFieldErrors(parsed.error).qty ?? "Periksa jumlah terlebih dahulu.");
      return;
    }
    const isNewLine = !lines.some((line) => line.productId === selected.id);
    if (isNewLine && lines.length >= MAX_ORDER_ITEMS) {
      setLineError(`Maksimal ${MAX_ORDER_ITEMS} baris dalam satu pesanan.`);
      return;
    }
    const incoming = parsed.data.qty;
    setLines((current) => {
      const index = current.findIndex((line) => line.productId === selected.id);
      if (index === -1) {
        return [...current, {
          productId: selected.id,
          productName: selected.name,
          unit: selected.unit,
          qtyMilli: incoming,
          unitPrice: selected.sellPrice,
        }];
      }
      const next = current.slice();
      next[index] = { ...next[index], qtyMilli: Math.min(next[index].qtyMilli + incoming, MAX_QTY_MILLI) };
      return next;
    });
    setSelectedId("");
    setQty("");
    setLineError("");
  }

  function removeLine(productId: string) {
    setLines((current) => current.filter((line) => line.productId !== productId));
  }

  function goToReview() {
    if (lines.length === 0) {
      setFormError("Tambahkan minimal satu produk terlebih dahulu.");
      return;
    }
    setFormError("");
    setStep(2);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lines.length === 0) {
      setFormError("Tambahkan minimal satu produk terlebih dahulu.");
      setStep(1);
      return;
    }
    const formData = new FormData();
    formData.set("items", JSON.stringify(lines.map((line) => ({ product_id: line.productId, qty: qtyMilliToDecimal(line.qtyMilli) }))));
    setFormError("");
    dispatch(formData);
  }

  if (products.length === 0) {
    return <p className="empty-state">Belum ada produk. Tambahkan produk lebih dahulu di halaman Produk sebelum membuat pesanan.</p>;
  }

  return (
    <form className="entry-form" onSubmit={handleSubmit} noValidate>
      {formError && <p className="auth-notice" role="alert">{formError}</p>}
      <div className={styles.formStep} hidden={step !== 1}>
        <div className="field">
          <label htmlFor="order-product">Produk</label>
          <select
            id="order-product"
            value={selectedId}
            onChange={(event) => { setSelectedId(event.target.value); setLineError(""); }}
          >
            <option value="">Pilih produk</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} · {formatRupiah(product.sellPrice)} / {product.unit}
              </option>
            ))}
          </select>
          {selected && (
            <p className="field-hint">
              Stok tercatat {formatStockQty(selected.stockQty)} {selected.unit}. Stok berkurang saat pesanan diselesaikan.
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="order-qty">Jumlah{selected ? ` (${selected.unit})` : ""}</label>
          <input
            id="order-qty"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Contoh: 2 atau 1,5"
            value={qty}
            onChange={(event) => { setQty(event.target.value); setLineError(""); }}
            aria-invalid={Boolean(lineError)}
            aria-describedby={lineError ? "order-qty-error" : undefined}
          />
          {lineError && <p className="field-error" id="order-qty-error" role="alert">{lineError}</p>}
        </div>

        <div className="entry-actions">
          <button className="secondary-button" type="button" onClick={addLine}>Tambah baris</button>
        </div>

        {lines.length > 0 && (
          <ul className={styles.lineList}>
            {lines.map((line) => (
              <li className={styles.lineRow} key={line.productId}>
                <span className={styles.lineInfo}>
                  <strong>{line.productName}</strong>
                  <span>{formatQtyMilli(line.qtyMilli)} {line.unit} × {formatRupiah(line.unitPrice)}</span>
                </span>
                <strong className={styles.lineSubtotal}>{formatRupiah(orderTotal([line]))}</strong>
                <button className="secondary-button" type="button" onClick={() => removeLine(line.productId)}>Hapus</button>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.totalBox} role="status">
          <span className="stat-label">Total sementara</span>
          <strong>{formatRupiah(total)}</strong>
          <span className="stat-hint">Dihitung otomatis oleh sistem. Angka tidak dapat diisi manual.</span>
        </div>

        <div className="entry-actions">
          <button className="primary-button" type="button" onClick={goToReview} disabled={lines.length === 0}>Lanjut ke total</button>
        </div>
      </div>

      <div className={styles.formStep} hidden={step !== 2}>
        <h3>Ringkasan pesanan</h3>
        <ul className={styles.reviewList}>
          {lines.map((line) => (
            <li className={styles.reviewRow} key={line.productId}>
              <span className={styles.lineInfo}>
                <strong>{line.productName}</strong>
                <span>{formatQtyMilli(line.qtyMilli)} {line.unit} × {formatRupiah(line.unitPrice)}</span>
              </span>
              <strong className={styles.lineSubtotal}>{formatRupiah(orderTotal([line]))}</strong>
            </li>
          ))}
        </ul>

        <div className={`${styles.totalBox} ${styles.totalBoxStrong}`} role="status">
          <span className="stat-label">Total pesanan</span>
          <strong>{formatRupiah(total)}</strong>
          <span className="stat-hint">Dihitung otomatis dari harga jual produk dan jumlah. Tidak ada input total manual.</span>
        </div>

        <p className="field-hint">Pesanan disimpan sebagai draft. Setelahnya Anda dapat menandai menunggu pembayaran, mulai proses, atau membatalkan.</p>

        <div className="entry-actions">
          <button className="secondary-button" type="button" onClick={() => setStep(1)}>Kembali</button>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan pesanan"}</button>
        </div>
      </div>
    </form>
  );
}

export function OrderForm({ products }: { products: readonly Product[] }) {
  const [state, formAction, pending] = useActionState(createOrder, initialState);
  const [dispatching, startDispatch] = useTransition();
  const busy = pending || dispatching;

  return (
    <section className="panel" aria-labelledby="order-form-title">
      <div className="section-heading">
        <div><p className="eyebrow">PESANAN BARU</p><h2 id="order-form-title">Buat pesanan</h2></div>
        <span className="subtle-tag">Dua langkah</span>
      </div>

      {state.status === "success" && <p className="notice" role="status">{state.message}</p>}
      {state.status === "error" && !Object.keys(state.fieldErrors ?? {}).length && <p className="auth-notice" role="alert">{state.message}</p>}

      <OrderDraftFields
        key={state.status === "success" ? state.nonce ?? "saved" : "entry"}
        products={products}
        busy={busy}
        dispatch={(formData) => startDispatch(() => formAction(formData))}
      />
    </section>
  );
}
