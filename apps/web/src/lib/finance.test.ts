import { describe, expect, it } from "vitest";
import { formatRupiah, summarize, validateAmount, validateTitle } from "./finance";

describe("demo finance calculations", () => {
  it("separates income, expense, and cash difference", () => {
    expect(summarize([
      { id: "1", title: "Jualan", type: "income", amount: 120000, date: "contoh" },
      { id: "2", title: "Belanja", type: "expense", amount: 35000, date: "contoh" },
      { id: "3", title: "Jualan lagi", type: "income", amount: 15000, date: "contoh" },
    ])).toEqual({ income: 135000, expense: 35000, cashDifference: 100000 });
    expect(summarize([])).toEqual({ income: 0, expense: 0, cashDifference: 0 });
  });

  it("supports a negative cash difference without calling it profit", () => {
    expect(summarize([{ id: "1", title: "Belanja", type: "expense", amount: 5000, date: "contoh" }]).cashDifference).toBe(-5000);
    expect(formatRupiah(-5000)).toBe("Rp-5.000");
    expect(formatRupiah(1000000)).toBe("Rp1.000.000");
  });

  it("accepts only positive integer rupiah within the demo limit", () => {
    for (const value of ["1", "25000", "1000000000"]) expect(validateAmount(value)).toBeNull();
    for (const value of ["", " ", "0", "-1", "1.000", "1,5", "1e3", "1000000001", "9007199254740993", "12a"]) {
      expect(validateAmount(value), value).not.toBeNull();
    }
  });

  it("requires a meaningful short description", () => {
    expect(validateTitle("  Belanja sayur  ")).toBeNull();
    expect(validateTitle("   ")).not.toBeNull();
    expect(validateTitle("x".repeat(61))).not.toBeNull();
  });
});
