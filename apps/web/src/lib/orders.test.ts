import { describe, expect, it } from "vitest";
import {
  canCompleteOrder,
  completeOrderSchema,
  createOrderItemSchema,
  createOrderSchema,
  customerLabel,
  formatQtyMilli,
  friendlyOrderErrorMessage,
  isOrderStatus,
  nextOrderStatuses,
  orderItemSummary,
  orderStatusActionLabel,
  orderStatusLabel,
  orderStatusTone,
  orderTotal,
  orderTotalMilli,
  parseQtyToMilli,
  qtyMilliToDecimal,
  qtyValueToMilli,
  setOrderStatusSchema,
  toRupiahBigInt,
} from "./orders";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

describe("order status helpers", () => {
  it("labels every status in Indonesian", () => {
    expect(orderStatusLabel("draft")).toBe("Draft");
    expect(orderStatusLabel("awaiting_payment")).toBe("Menunggu pembayaran");
    expect(orderStatusLabel("paid")).toBe("Pembayaran terindikasi");
    expect(orderStatusLabel("processing")).toBe("Diproses");
    expect(orderStatusLabel("completed")).toBe("Selesai");
    expect(orderStatusLabel("cancelled")).toBe("Dibatalkan");
  });

  it("maps tones for the status pill", () => {
    expect(orderStatusTone("completed")).toBe("good");
    expect(orderStatusTone("paid")).toBe("good");
    expect(orderStatusTone("cancelled")).toBe("warning");
    expect(orderStatusTone("draft")).toBe("warning");
  });

  it("moves through draft, awaiting payment, processing and cancelled only", () => {
    expect(nextOrderStatuses("draft")).toEqual(["awaiting_payment", "cancelled"]);
    expect(nextOrderStatuses("awaiting_payment")).toEqual(["processing", "cancelled"]);
    expect(nextOrderStatuses("processing")).toEqual(["cancelled"]);
    expect(nextOrderStatuses("completed")).toEqual([]);
    expect(nextOrderStatuses("cancelled")).toEqual([]);
  });

  it("provides clear button labels", () => {
    expect(orderStatusActionLabel("awaiting_payment")).toBe("Tandai menunggu pembayaran");
    expect(orderStatusActionLabel("processing")).toBe("Mulai proses");
    expect(orderStatusActionLabel("cancelled")).toBe("Batalkan");
  });

  it("allows completion only from payable states", () => {
    expect(canCompleteOrder("awaiting_payment")).toBe(true);
    expect(canCompleteOrder("processing")).toBe(true);
    expect(canCompleteOrder("paid")).toBe(true);
    expect(canCompleteOrder("draft")).toBe(false);
    expect(canCompleteOrder("completed")).toBe(false);
    expect(canCompleteOrder("cancelled")).toBe(false);
  });

  it("guards unknown status values", () => {
    expect(isOrderStatus("draft")).toBe(true);
    expect(isOrderStatus("paid")).toBe(true);
    expect(isOrderStatus("refunded")).toBe(false);
    expect(isOrderStatus(null)).toBe(false);
  });
});

describe("quantity parsing and formatting", () => {
  it("parses whole and decimal quantities into integer thousandths", () => {
    expect(parseQtyToMilli("2")).toBe(2000);
    expect(parseQtyToMilli("1,5")).toBe(1500);
    expect(parseQtyToMilli("1.5")).toBe(1500);
    expect(parseQtyToMilli("0,25")).toBe(250);
  });

  it("rejects empty, zero, negative and malformed quantities", () => {
    for (const value of ["", " ", "0", "0,0", "-1", "abc", "1,2345", "1,", "1e3", "1000001"]) {
      expect(parseQtyToMilli(value), value).toBeNull();
    }
    expect(parseQtyToMilli("1000000")).toBe(1_000_000_000);
  });

  it("formats thousandths without floating point and hides trailing zeros", () => {
    expect(qtyMilliToDecimal(2000)).toBe("2");
    expect(qtyMilliToDecimal(1500)).toBe("1.5");
    expect(qtyMilliToDecimal(1234)).toBe("1.234");
    expect(formatQtyMilli(1500)).toBe("1,5");
  });

  it("reads numeric column values back into thousandths", () => {
    expect(qtyValueToMilli("1.500")).toBe(1500);
    expect(qtyValueToMilli(2)).toBe(2000);
    expect(qtyValueToMilli(null)).toBe(0);
    expect(qtyValueToMilli("abc")).toBe(0);
  });
});

describe("order totals", () => {
  it("computes integer rupiah totals from lines", () => {
    const lines = [
      { qtyMilli: 2000, unitPrice: 15000 },
      { qtyMilli: 1000, unitPrice: 2000 },
    ];
    expect(orderTotal(lines)).toBe(BigInt(32000));
    expect(orderTotalMilli(lines)).toBe(BigInt(32_000_000));
  });

  it("keeps fractional quantities exact before rounding to rupiah", () => {
    expect(orderTotal([{ qtyMilli: 1500, unitPrice: 10000 }])).toBe(BigInt(15000));
    expect(orderTotal([{ qtyMilli: 1000, unitPrice: 15001 }])).toBe(BigInt(15001));
  });

  it("rounds half up to the nearest rupiah deterministically", () => {
    expect(orderTotal([{ qtyMilli: 1, unitPrice: 1500 }])).toBe(BigInt(2));
    expect(orderTotal([{ qtyMilli: 1, unitPrice: 1400 }])).toBe(BigInt(1));
    expect(orderTotal([])).toBe(BigInt(0));
  });

  it("never uses floating point for large sums", () => {
    const lines = Array.from({ length: 1000 }, () => ({ qtyMilli: 1000, unitPrice: 999_999 }));
    expect(orderTotal(lines)).toBe(BigInt(999_999_000));
  });
});

describe("display summaries", () => {
  it("summarizes order items from quantity and unit", () => {
    expect(orderItemSummary([{ productName: "Gula", unit: "kg", qtyMilli: 1500 }])).toBe("1,5 kg Gula");
    expect(orderItemSummary([])).toBe("Belum ada rincian item");
  });

  it("falls back to the warung label when no customer name is known", () => {
    expect(customerLabel("Bu Sari")).toBe("Bu Sari");
    expect(customerLabel("  ")).toBe("Pesanan warung");
    expect(customerLabel(null)).toBe("Pesanan warung");
  });

  it("converts numeric columns to rupiah safely", () => {
    expect(toRupiahBigInt("32000")).toBe(BigInt(32000));
    expect(toRupiahBigInt(15000)).toBe(BigInt(15000));
    expect(toRupiahBigInt(null)).toBe(BigInt(0));
    expect(toRupiahBigInt("not-a-number")).toBe(BigInt(0));
  });
});

describe("order error mapping", () => {
  it("maps known RPC errors to friendly Indonesian messages", () => {
    expect(friendlyOrderErrorMessage("Insufficient stock for one or more items")).toContain("Stok tidak mencukupi");
    expect(friendlyOrderErrorMessage("Order not found")).toContain("tidak ditemukan");
    expect(friendlyOrderErrorMessage("Only the shop owner can complete orders")).toContain("pemilik warung");
    expect(friendlyOrderErrorMessage("Order is not ready to complete")).toContain("belum siap");
  });

  it("never leaks raw database errors", () => {
    const generic = friendlyOrderErrorMessage("permission denied for table orders");
    expect(generic).toBe("Pesanan belum dapat diperbarui. Coba lagi nanti.");
    expect(friendlyOrderErrorMessage(undefined)).toBe(generic);
  });
});

describe("order input schemas", () => {
  it("accepts a valid item line and normalizes the quantity", () => {
    const parsed = createOrderItemSchema.safeParse({ product_id: PRODUCT_ID, qty: "1,5" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.qty).toBe(1500);
  });

  it("rejects a bad product id or quantity", () => {
    expect(createOrderItemSchema.safeParse({ product_id: "not-a-uuid", qty: "2" }).success).toBe(false);
    expect(createOrderItemSchema.safeParse({ product_id: PRODUCT_ID, qty: "0" }).success).toBe(false);
  });

  it("requires at least one line and caps the line count", () => {
    expect(createOrderSchema.safeParse({ items: [] }).success).toBe(false);
    const oneLine = { items: [{ product_id: PRODUCT_ID, qty: "1" }] };
    expect(createOrderSchema.safeParse(oneLine).success).toBe(true);
    const tooMany = { items: Array.from({ length: 21 }, () => ({ product_id: OTHER_ID, qty: "1" })) };
    expect(createOrderSchema.safeParse(tooMany).success).toBe(false);
  });

  it("only allows manual statuses through set_order_status", () => {
    expect(setOrderStatusSchema.safeParse({ order_id: PRODUCT_ID, status: "awaiting_payment" }).success).toBe(true);
    expect(setOrderStatusSchema.safeParse({ order_id: PRODUCT_ID, status: "processing" }).success).toBe(true);
    expect(setOrderStatusSchema.safeParse({ order_id: PRODUCT_ID, status: "paid" }).success).toBe(false);
    expect(setOrderStatusSchema.safeParse({ order_id: PRODUCT_ID, status: "completed" }).success).toBe(false);
  });

  it("requires a valid uuid to complete an order", () => {
    expect(completeOrderSchema.safeParse({ order_id: PRODUCT_ID }).success).toBe(true);
    expect(completeOrderSchema.safeParse({ order_id: "nope" }).success).toBe(false);
  });
});
