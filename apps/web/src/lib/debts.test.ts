import { describe, expect, it } from "vitest";
import {
  countUnpaidDebts,
  createDebtSchema,
  debtRemaining,
  debtStatusFor,
  debtStatusLabel,
  deleteDebtSchema,
  formatDueDate,
  isDebtOverdue,
  isDebtPartyType,
  isDebtStatus,
  mapDebtRow,
  partyTypeLabel,
  planRepayment,
  recordRepaymentSchema,
  totalRemaining,
  toRupiahValue,
  type Debt,
} from "./debts";

const DEBT_ID = "22222222-2222-4222-8222-222222222222";

function makeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "d1",
    partyType: "customer",
    partyName: "Bu Sari",
    amount: 100_000,
    paidAmount: 0,
    dueDate: null,
    status: "outstanding",
    ...overrides,
  };
}

describe("debt row mapping", () => {
  it("converts bigint columns returned as strings into safe integers", () => {
    expect(
      mapDebtRow({
        id: "d1",
        party_type: "supplier",
        party_name: "Toko Beras",
        amount: "250000",
        paid_amount: "100000",
        due_date: "2026-10-01",
        status: "partial",
      }),
    ).toEqual({
      id: "d1",
      partyType: "supplier",
      partyName: "Toko Beras",
      amount: 250000,
      paidAmount: 100000,
      dueDate: "2026-10-01",
      status: "partial",
    });
  });

  it("falls back to zero for malformed money columns", () => {
    expect(toRupiahValue(null)).toBe(0);
    expect(toRupiahValue("")).toBe(0);
    expect(toRupiahValue("abc")).toBe(0);
    expect(toRupiahValue("1.5")).toBe(0);
    expect(toRupiahValue(42)).toBe(42);
    expect(toRupiahValue("42")).toBe(42);
  });

  it("recomputes an unknown stored status from the trusted amounts", () => {
    const row = mapDebtRow({
      id: "d2",
      party_type: "customer",
      party_name: "Pak Budi",
      amount: 100000,
      paid_amount: 100000,
      due_date: null,
      status: "unknown",
    });
    expect(row.status).toBe("paid");
  });

  it("guards party type and status values", () => {
    expect(isDebtPartyType("customer")).toBe(true);
    expect(isDebtPartyType("other")).toBe(false);
    expect(isDebtStatus("partial")).toBe(true);
    expect(isDebtStatus("cancelled")).toBe(false);
    expect(partyTypeLabel("supplier")).toBe("Pemasok");
    expect(partyTypeLabel("customer")).toBe("Pelanggan");
  });
});

describe("remaining balance and status transitions", () => {
  it("keeps every amount as an integer rupiah with no floating point", () => {
    const remaining = debtRemaining(120_000, 45_000);
    expect(remaining).toBe(75_000);
    expect(Number.isInteger(remaining)).toBe(true);
  });

  it("never returns a negative remaining balance", () => {
    expect(debtRemaining(50_000, 50_000)).toBe(0);
    expect(debtRemaining(50_000, 70_000)).toBe(0);
  });

  it("moves outstanding to partial to paid as repayments grow", () => {
    expect(debtStatusFor(100_000, 0)).toBe("outstanding");
    expect(debtStatusFor(100_000, 1)).toBe("partial");
    expect(debtStatusFor(100_000, 99_999)).toBe("partial");
    expect(debtStatusFor(100_000, 100_000)).toBe("paid");
    expect(debtStatusFor(100_000, 150_000)).toBe("paid");
  });

  it("keeps an unpaid debt when the paid amount is negative or zero", () => {
    expect(debtStatusFor(100_000, -5)).toBe("outstanding");
  });

  it("exposes friendly status labels", () => {
    expect(debtStatusLabel("outstanding")).toBe("Belum dibayar");
    expect(debtStatusLabel("partial")).toBe("Dibayar sebagian");
    expect(debtStatusLabel("paid")).toBe("Lunas");
  });
});

describe("repayment planning", () => {
  it("accepts a partial repayment and returns the new balance and status", () => {
    const result = planRepayment(100_000, 20_000, 30_000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan).toEqual({ paidAmount: 50_000, status: "partial", remaining: 50_000 });
    }
  });

  it("marks the debt paid when the repayment covers the whole remaining balance", () => {
    const result = planRepayment(100_000, 40_000, 60_000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan).toEqual({ paidAmount: 100_000, status: "paid", remaining: 0 });
    }
  });

  it("rejects zero, negative, and fractional repayments", () => {
    for (const repayment of [0, -1, -25_000, 1.5, Number.NaN]) {
      const result = planRepayment(100_000, 0, repayment);
      expect(result.ok, String(repayment)).toBe(false);
    }
  });

  it("rejects a repayment larger than the remaining balance", () => {
    const result = planRepayment(100_000, 90_000, 10_001);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("melebihi sisa hutang");
  });

  it("rejects any repayment on an already settled debt", () => {
    const result = planRepayment(100_000, 100_000, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("sudah lunas");
  });
});

describe("debt summaries", () => {
  it("sums the remaining balance of every debt as integer rupiah", () => {
    expect(totalRemaining([makeDebt({ amount: 100_000, paidAmount: 25_000 }), makeDebt({ amount: 40_000, paidAmount: 40_000 })])).toBe(75_000);
    expect(totalRemaining([])).toBe(0);
  });

  it("counts only debts that are not paid", () => {
    expect(
      countUnpaidDebts([
        makeDebt({ status: "outstanding" }),
        makeDebt({ status: "partial" }),
        makeDebt({ status: "paid" }),
      ]),
    ).toBe(2);
  });
});

describe("due date display", () => {
  it("formats a date only value without a timezone shift", () => {
    expect(formatDueDate("2026-10-01")).toBe("1 Okt 2026");
    expect(formatDueDate(null)).toBe("Tanpa jatuh tempo");
    expect(formatDueDate("not-a-date")).toBe("Tanpa jatuh tempo");
  });

  it("flags a due date that is earlier than today", () => {
    expect(isDebtOverdue("2026-09-01", "2026-09-28")).toBe(true);
    expect(isDebtOverdue("2026-09-28", "2026-09-28")).toBe(false);
    expect(isDebtOverdue(null, "2026-09-28")).toBe(false);
  });
});

describe("debt input schemas", () => {
  it("accepts a valid create payload and converts the amount to a number", () => {
    const result = createDebtSchema.safeParse({ party_type: "customer", party_name: "  Bu Sari ", amount: "25000", due_date: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ party_type: "customer", party_name: "Bu Sari", amount: 25000, due_date: "" });
    }
  });

  it("rejects a missing party type, empty name, and non integer amount", () => {
    const valid = { party_type: "customer", party_name: "Bu Sari", amount: "25000", due_date: "" };
    expect(createDebtSchema.safeParse({ ...valid, party_type: "" }).success).toBe(false);
    expect(createDebtSchema.safeParse({ ...valid, party_name: "   " }).success).toBe(false);
    expect(createDebtSchema.safeParse({ ...valid, party_name: "x".repeat(81) }).success).toBe(false);
    expect(createDebtSchema.safeParse({ ...valid, amount: "0" }).success).toBe(false);
    expect(createDebtSchema.safeParse({ ...valid, amount: "-10" }).success).toBe(false);
    expect(createDebtSchema.safeParse({ ...valid, amount: "1.000" }).success).toBe(false);
    expect(createDebtSchema.safeParse({ ...valid, amount: "1000000001" }).success).toBe(false);
  });

  it("rejects an invalid due date but allows an empty one", () => {
    const valid = { party_type: "supplier", party_name: "Toko Beras", amount: "50000", due_date: "2026-02-30" };
    expect(createDebtSchema.safeParse(valid).success).toBe(false);
    expect(createDebtSchema.safeParse({ ...valid, due_date: "2026-02-28" }).success).toBe(true);
  });

  it("validates repayment and delete payloads", () => {
    expect(recordRepaymentSchema.safeParse({ debt_id: DEBT_ID, amount: "10000" }).success).toBe(true);
    expect(recordRepaymentSchema.safeParse({ debt_id: DEBT_ID, amount: "0" }).success).toBe(false);
    expect(recordRepaymentSchema.safeParse({ debt_id: "not-a-uuid", amount: "10000" }).success).toBe(false);
    expect(deleteDebtSchema.safeParse({ debt_id: DEBT_ID }).success).toBe(true);
    expect(deleteDebtSchema.safeParse({ debt_id: "" }).success).toBe(false);
  });
});
