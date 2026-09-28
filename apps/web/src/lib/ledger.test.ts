import { describe, expect, it } from "vitest";
import {
  collectFieldErrors,
  expenseInputSchema,
  formatRupiah,
  getJakartaDayRange,
  incomeInputSchema,
  isValidDateInput,
  resolveOccurredAt,
  sumRupiah,
  todayInJakarta,
} from "./ledger";

const validExpense = { amount: "25000", description: "Belanja sayur", occurred_on: "" };

describe("rupiah formatting", () => {
  it("formats integers as plain rupiah without decimals", () => {
    expect(formatRupiah(0)).toBe("Rp0");
    expect(formatRupiah(25000)).toBe("Rp25.000");
    expect(formatRupiah(1000000000)).toBe("Rp1.000.000.000");
  });

  it("supports bigint and negative cash difference values", () => {
    expect(formatRupiah(BigInt(135000))).toBe("Rp135.000");
    expect(formatRupiah(BigInt(-5000))).toBe("Rp-5.000");
  });

  it("sums integer rupiah from numbers and strings without floating point", () => {
    expect(sumRupiah(["25000", 42000, "15000"])).toBe(BigInt(82000));
    expect(sumRupiah([])).toBe(BigInt(0));
  });
});

describe("cash entry validation", () => {
  it("accepts positive integer rupiah within the limit", () => {
    for (const value of ["1", "25000", "1000000000"]) {
      expect(incomeInputSchema.safeParse({ amount: value, description: "", occurred_on: "" }).success, value).toBe(true);
    }
  });

  it("rejects empty, non-numeric, zero, negative, and over-limit amounts", () => {
    for (const value of ["", " ", "0", "-1", "1.000", "1,5", "1e3", "1000000001", "12a", "9007199254740993"]) {
      const result = incomeInputSchema.safeParse({ amount: value, description: "", occurred_on: "" });
      expect(result.success, value).toBe(false);
      if (!result.success) expect(collectFieldErrors(result.error).amount).toBeTruthy();
    }
  });

  it("requires a description for expenses but allows it to be empty for income", () => {
    expect(expenseInputSchema.safeParse(validExpense).success).toBe(true);
    expect(expenseInputSchema.safeParse({ ...validExpense, description: "   " }).success).toBe(false);
    expect(incomeInputSchema.safeParse({ amount: "5000", description: "", occurred_on: "" }).success).toBe(true);
    const tooLong = incomeInputSchema.safeParse({ amount: "5000", description: "x".repeat(121), occurred_on: "" });
    expect(tooLong.success).toBe(false);
  });

  it("validates optional calendar dates only when provided", () => {
    expect(isValidDateInput("2026-02-28")).toBe(true);
    expect(isValidDateInput("2024-02-29")).toBe(true);
    for (const value of ["2026-02-30", "2025-02-29", "28-02-2026", "2026-13-01", "abc", "2026-1-1"]) {
      expect(isValidDateInput(value), value).toBe(false);
    }
    expect(expenseInputSchema.safeParse({ ...validExpense, occurred_on: "" }).success).toBe(true);
    expect(expenseInputSchema.safeParse({ ...validExpense, occurred_on: "2026-02-30" }).success).toBe(false);
  });
});

describe("Asia/Jakarta date range", () => {
  it("brackets the Jakarta calendar day in UTC", () => {
    expect(getJakartaDayRange(new Date("2026-09-28T03:00:00Z"))).toEqual({
      start: new Date("2026-09-27T17:00:00.000Z"),
      end: new Date("2026-09-28T17:00:00.000Z"),
    });
  });

  it("keeps the same day just before midnight and moves on just after", () => {
    expect(getJakartaDayRange(new Date("2026-09-28T16:59:00Z")).start.toISOString()).toBe("2026-09-27T17:00:00.000Z");
    expect(getJakartaDayRange(new Date("2026-09-28T17:30:00Z")).start.toISOString()).toBe("2026-09-28T17:00:00.000Z");
    expect(getJakartaDayRange(new Date("2026-09-28T17:30:00Z")).end.toISOString()).toBe("2026-09-29T17:00:00.000Z");
  });

  it("derives the Jakarta calendar date and resolves an entry timestamp", () => {
    expect(todayInJakarta(new Date("2026-09-28T17:30:00Z"))).toBe("2026-09-29");
    const now = new Date("2026-09-28T03:00:00Z");
    expect(resolveOccurredAt("", now)).toBe(now.toISOString());
    expect(resolveOccurredAt(null, now)).toBe(now.toISOString());
    expect(resolveOccurredAt("2026-09-28", now)).toBe("2026-09-27T17:00:00.000Z");
  });
});
