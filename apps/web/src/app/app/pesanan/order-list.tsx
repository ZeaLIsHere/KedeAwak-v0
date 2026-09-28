"use client";

import { useState, useTransition } from "react";
import { formatJakartaDateTime, formatRupiah } from "@/lib/ledger";
import {
  canCompleteOrder,
  nextOrderStatuses,
  orderItemSummary,
  orderStatusActionLabel,
  orderStatusLabel,
  orderStatusTone,
  type ManualOrderStatus,
} from "@/lib/orders";
import { completeOrder, setOrderStatus, type OrderActionState } from "./actions";
import type { OrderView } from "./data";
import styles from "./pesanan.module.css";

const IDLE_STATE: OrderActionState = { status: "idle", message: "" };

// MARK: Status changes run through the database RPC only, never a direct table update
type OrderAction = (state: OrderActionState, form: FormData) => Promise<OrderActionState>;

export function OrderList({ orders }: { orders: readonly OrderView[] }) {
  if (orders.length === 0) {
    return <p className="empty-state">Belum ada pesanan tercatat. Buat pesanan pertama lewat formulir di atas.</p>;
  }
  return (
    <ul className="data-list">
      {orders.map((order) => <OrderRow key={order.id} order={order} />)}
    </ul>
  );
}

function OrderRow({ order }: { order: OrderView }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<OrderActionState>(IDLE_STATE);
  const [confirming, setConfirming] = useState(false);
  const transitions = nextOrderStatuses(order.status);
  const completable = canCompleteOrder(order.status);

  function run(action: OrderAction, status?: ManualOrderStatus) {
    const form = new FormData();
    form.set("order_id", order.id);
    if (status) form.set("status", status);
    startTransition(async () => {
      const next = await action(IDLE_STATE, form);
      setResult(next);
    });
  }

  return (
    <li className={styles.orderItem}>
      <div className="data-row">
        <div>
          <strong>{order.customerLabel}</strong>
          <span>{formatJakartaDateTime(order.createdAt)}</span>
          <span>{orderItemSummary(order.items)}</span>
        </div>
        <div className="row-end">
          <span className={`status-pill ${orderStatusTone(order.status)}`}>{orderStatusLabel(order.status)}</span>
          <strong>{formatRupiah(order.total)}</strong>
        </div>
      </div>

      {result.status === "success" && <p className="notice" role="status">{result.message}</p>}
      {result.status === "error" && <p className="auth-notice" role="alert">{result.message}</p>}

      {(transitions.length > 0 || completable) && (
        <div className={styles.statusActions}>
          {transitions.map((status) => (
            <button
              key={status}
              type="button"
              className="secondary-button"
              disabled={pending}
              onClick={() => run(setOrderStatus, status)}
            >
              {orderStatusActionLabel(status)}
            </button>
          ))}
          {completable && (
            <button
              type="button"
              className={`primary-button ${styles.completeButton}`}
              disabled={pending}
              onClick={() => { setConfirming(true); setResult(IDLE_STATE); }}
            >
              Selesaikan dan catat penjualan
            </button>
          )}
        </div>
      )}

      {confirming && (
        <div className={styles.confirmBox} role="group" aria-label="Konfirmasi selesaikan pesanan">
          <p className="muted">
            Dengan menyelesaikan, Anda menandai uang diterima (indikatif). Sistem akan mencatat penjualan <strong>{formatRupiah(order.total)}</strong> dan
            mengurangi stok produk. Tindakan ini tidak dapat dibatalkan. Verifikasi pembayaran bersifat indikatif: sistem tidak terhubung ke bank dan
            tidak dapat memastikan uang sudah masuk.
          </p>
          <div className="entry-actions">
            <button
              className={`primary-button ${styles.completeButton}`}
              type="button"
              disabled={pending}
              onClick={() => { setConfirming(false); run(completeOrder); }}
            >
              {pending ? "Memproses..." : "Ya, selesaikan"}
            </button>
            <button className="secondary-button" type="button" onClick={() => setConfirming(false)}>Batal</button>
          </div>
        </div>
      )}
    </li>
  );
}
