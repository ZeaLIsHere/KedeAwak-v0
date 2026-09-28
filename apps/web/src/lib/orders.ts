import { z } from "zod";

// SECTION: Constants
export const MAX_ORDER_ITEMS = 20;
export const QTY_SCALE = 1000;
export const MAX_QTY_MILLI = 1_000_000_000;
export const DEFAULT_CUSTOMER_LABEL = "Pesanan warung";
export const GENERIC_ORDER_ERROR_MESSAGE = "Pesanan belum dapat diperbarui. Coba lagi nanti.";

// SECTION: Statuses
export const ORDER_STATUSES = ["draft", "awaiting_payment", "paid", "processing", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const MANUAL_ORDER_STATUSES = ["draft", "awaiting_payment", "processing", "cancelled"] as const;
export type ManualOrderStatus = (typeof MANUAL_ORDER_STATUSES)[number];

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Draft",
  awaiting_payment: "Menunggu pembayaran",
  paid: "Pembayaran terindikasi",
  processing: "Diproses",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const ORDER_STATUS_TONES: Record<OrderStatus, "good" | "warning"> = {
  draft: "warning",
  awaiting_payment: "warning",
  paid: "good",
  processing: "warning",
  completed: "good",
  cancelled: "warning",
};

const ORDER_ACTION_LABELS: Record<ManualOrderStatus, string> = {
  draft: "Tandai draft",
  awaiting_payment: "Tandai menunggu pembayaran",
  processing: "Mulai proses",
  cancelled: "Batalkan",
};

const ORDER_NEXT_STATUSES: Record<OrderStatus, readonly ManualOrderStatus[]> = {
  draft: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["processing", "cancelled"],
  paid: ["processing", "cancelled"],
  processing: ["cancelled"],
  completed: [],
  cancelled: [],
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function orderStatusTone(status: OrderStatus): "good" | "warning" {
  return ORDER_STATUS_TONES[status] ?? "warning";
}

export function orderStatusActionLabel(status: ManualOrderStatus): string {
  return ORDER_ACTION_LABELS[status];
}

export function nextOrderStatuses(status: OrderStatus): readonly ManualOrderStatus[] {
  return ORDER_NEXT_STATUSES[status] ?? [];
}

export function canCompleteOrder(status: OrderStatus): boolean {
  return status === "awaiting_payment" || status === "processing" || status === "paid";
}

// SECTION: Order lines and totals (integer rupiah only, no floating point)
export type OrderLine = {
  productId: string;
  productName: string;
  unit: string;
  qtyMilli: number;
  unitPrice: number;
};

export function lineTotalMilli(line: { qtyMilli: number; unitPrice: number }): bigint {
  return BigInt(line.qtyMilli) * BigInt(line.unitPrice);
}

export function orderTotalMilli(lines: readonly { qtyMilli: number; unitPrice: number }[]): bigint {
  let total = BigInt(0);
  for (const line of lines) total += lineTotalMilli(line);
  return total;
}

export function orderTotal(lines: readonly { qtyMilli: number; unitPrice: number }[]): bigint {
  // STEP: Round half up to the nearest rupiah with integer arithmetic only
  return (orderTotalMilli(lines) + BigInt(500)) / BigInt(1000);
}

// SECTION: Quantity parsing and formatting
const QTY_PATTERN = /^[0-9]{1,10}([.,][0-9]{1,3})?$/;

export function parseQtyToMilli(value: string): number | null {
  const trimmed = value.trim();
  if (!QTY_PATTERN.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.replace(",", ".").split(".");
  const milli = Number(whole) * QTY_SCALE + Number(`${fraction}000`.slice(0, 3));
  if (!Number.isSafeInteger(milli) || milli <= 0 || milli > MAX_QTY_MILLI) return null;
  return milli;
}

export function qtyMilliToDecimal(qtyMilli: number): string {
  const whole = Math.trunc(qtyMilli / QTY_SCALE);
  const fraction = qtyMilli % QTY_SCALE;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(3, "0").replace(/0+$/, "")}`;
}

export function formatQtyMilli(qtyMilli: number): string {
  return qtyMilliToDecimal(qtyMilli).replace(".", ",");
}

type NumericValue = number | string | null | undefined;

export function qtyValueToMilli(value: NumericValue): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * QTY_SCALE) : 0;
  return parseQtyToMilli(value) ?? 0;
}

export function toRupiahBigInt(value: NumericValue): bigint {
  if (value === null || value === undefined) return BigInt(0);
  try {
    return BigInt(value);
  } catch {
    return BigInt(0);
  }
}

// SECTION: Display summaries
export type OrderItemSummary = {
  productName: string;
  unit: string;
  qtyMilli: number;
};

export function orderItemSummary(items: readonly OrderItemSummary[]): string {
  if (items.length === 0) return "Belum ada rincian item";
  return items.map((item) => `${formatQtyMilli(item.qtyMilli)} ${item.unit} ${item.productName}`.trim()).join(" · ");
}

export function customerLabel(customerName: string | null | undefined): string {
  const name = customerName?.trim();
  return name ? name : DEFAULT_CUSTOMER_LABEL;
}

// SECTION: Database RPC error mapping
const ORDER_ERROR_MESSAGES: ReadonlyArray<readonly [string, string]> = [
  ["Authentication required", "Sesi Anda telah berakhir. Masuk kembali lalu coba lagi."],
  ["Unsupported order status", "Perubahan status pesanan ini tidak didukung."],
  ["Order not found", "Pesanan tidak ditemukan untuk warung ini."],
  ["Not a shop member", "Anda tidak memiliki akses ke pesanan warung ini."],
  ["Only the shop owner can complete orders", "Hanya pemilik warung yang dapat menyelesaikan pesanan."],
  ["Order is not ready to complete", "Pesanan belum siap diselesaikan."],
  ["Insufficient stock for one or more items", "Stok tidak mencukupi untuk salah satu item. Perbarui stok lalu coba lagi."],
];

export function friendlyOrderErrorMessage(raw: string | null | undefined): string {
  if (!raw) return GENERIC_ORDER_ERROR_MESSAGE;
  for (const [needle, friendly] of ORDER_ERROR_MESSAGES) {
    if (raw.includes(needle)) return friendly;
  }
  return GENERIC_ORDER_ERROR_MESSAGE;
}

// SECTION: Input schemas
const qtyFieldSchema = z
  .string()
  .trim()
  .min(1, "Isi jumlah terlebih dahulu.")
  .transform((value) => parseQtyToMilli(value))
  .refine((value): value is number => value !== null, "Gunakan angka, atau koma untuk desimal maksimal 3 angka.");

export const createOrderItemSchema = z.object({
  product_id: z.uuid("Produk tidak valid."),
  qty: qtyFieldSchema,
});

export const createOrderSchema = z.object({
  items: z
    .array(createOrderItemSchema)
    .min(1, "Tambahkan minimal satu produk.")
    .max(MAX_ORDER_ITEMS, `Maksimal ${MAX_ORDER_ITEMS} baris dalam satu pesanan.`),
});

export const setOrderStatusSchema = z.object({
  order_id: z.uuid(),
  status: z.enum(MANUAL_ORDER_STATUSES),
});

export const completeOrderSchema = z.object({
  order_id: z.uuid(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderItemInput = z.infer<typeof createOrderItemSchema>;
export type SetOrderStatusInput = z.infer<typeof setOrderStatusSchema>;
