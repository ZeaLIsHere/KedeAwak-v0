import { describe, expect, it } from "vitest";
import {
  adjustStockSchema,
  createProductSchema,
  deleteProductSchema,
  formatStockQty,
  listLowStockProducts,
  mapProductRow,
  parseRupiahInput,
  parseStockInput,
  stockStatus,
  stockStatusLabel,
  toStockInputValue,
  updateMinStockSchema,
  type Product,
} from "./inventory";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return { id: "p1", name: "Gula", unit: "kg", sellPrice: 15000, buyPrice: 12000, stockQty: 10, minStock: 3, ...overrides };
}

describe("product row mapping", () => {
  it("normalizes numeric columns returned as strings", () => {
    expect(
      mapProductRow({
        id: "p1",
        name: "Gula",
        unit: "kg",
        sell_price: "15000",
        buy_price: "12000",
        stock_qty: "10.500",
        min_stock: "3",
      }),
    ).toEqual({ id: "p1", name: "Gula", unit: "kg", sellPrice: 15000, buyPrice: 12000, stockQty: 10.5, minStock: 3 });
  });

  it("falls back to zero for null, undefined, and malformed columns", () => {
    expect(
      mapProductRow({ id: "p2", name: "Kopi", unit: "pcs", sell_price: null, buy_price: undefined, stock_qty: "", min_stock: "abc" }),
    ).toEqual({ id: "p2", name: "Kopi", unit: "pcs", sellPrice: 0, buyPrice: 0, stockQty: 0, minStock: 0 });
  });
});

describe("stock status", () => {
  it("flags low when stock is at or below the minimum threshold", () => {
    expect(stockStatus(3, 3)).toBe("low");
    expect(stockStatus(2, 3)).toBe("low");
    expect(stockStatus(0, 0)).toBe("low");
  });

  it("flags ok when stock is above the minimum threshold", () => {
    expect(stockStatus(4, 3)).toBe("ok");
    expect(stockStatus(0.5, 0)).toBe("ok");
  });

  it("maps a status to a human readable label", () => {
    expect(stockStatusLabel("low")).toBe("Stok menipis");
    expect(stockStatusLabel("ok")).toBe("Stok cukup");
  });

  it("lists only the products that need restocking", () => {
    const products = [makeProduct({ id: "a", stockQty: 2, minStock: 3 }), makeProduct({ id: "b", stockQty: 9, minStock: 3 }), makeProduct({ id: "c", stockQty: 3, minStock: 3 })];
    expect(listLowStockProducts(products).map((product) => product.id)).toEqual(["a", "c"]);
    expect(listLowStockProducts([])).toEqual([]);
  });
});

describe("quantity formatting", () => {
  it("formats stock with Indonesian separators and no trailing zeros", () => {
    expect(formatStockQty(10)).toBe("10");
    expect(formatStockQty(1.5)).toBe("1,5");
    expect(formatStockQty(1000)).toBe("1.000");
  });

  it("produces an editable value using a comma decimal separator", () => {
    expect(toStockInputValue(10)).toBe("10");
    expect(toStockInputValue(1.5)).toBe("1,5");
  });
});

describe("rupiah price parsing", () => {
  it("accepts integer rupiah from zero up to the cap", () => {
    expect(parseRupiahInput("0")).toBe(0);
    expect(parseRupiahInput("15000")).toBe(15000);
    expect(parseRupiahInput(" 2000 ")).toBe(2000);
    expect(parseRupiahInput("1000000000")).toBe(1000000000);
  });

  it("rejects empty, separator, negative, and over-cap values", () => {
    for (const value of ["", " ", "-1", "1.000", "1,5", "1e3", "12a", "1000000001", "9999999999"]) {
      expect(parseRupiahInput(value), value).toBeNull();
    }
  });
});

describe("stock parsing", () => {
  it("accepts whole numbers and comma decimals up to 3 digits", () => {
    expect(parseStockInput("0")).toBe(0);
    expect(parseStockInput("10")).toBe(10);
    expect(parseStockInput("1,5")).toBe(1.5);
    expect(parseStockInput("1,234")).toBe(1.234);
    expect(parseStockInput("1000000")).toBe(1000000);
  });

  it("rejects negatives, too many decimals, dots, and over-cap values", () => {
    for (const value of ["", " ", "-1", "1,2345", "1.5", "abc", "1000001", "1000000,001"]) {
      expect(parseStockInput(value), value).toBeNull();
    }
  });
});

describe("create product schema", () => {
  it("trims text and converts prices and stock to numbers", () => {
    const result = createProductSchema.safeParse({
      name: "  Gula pasir  ",
      unit: " kg ",
      sell_price: "15000",
      buy_price: "12000",
      stock_qty: "10",
      min_stock: "3",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Gula pasir", unit: "kg", sell_price: 15000, buy_price: 12000, stock_qty: 10, min_stock: 3 });
    }
  });

  it("rejects missing, over-long, and malformed fields", () => {
    const valid = { name: "Gula", unit: "kg", sell_price: "15000", buy_price: "12000", stock_qty: "10", min_stock: "3" };
    expect(createProductSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...valid, name: "x".repeat(81) }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...valid, unit: "" }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...valid, unit: "x".repeat(21) }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...valid, sell_price: "1.000" }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...valid, min_stock: "abc" }).success).toBe(false);
  });
});

describe("product mutation schemas", () => {
  it("requires a valid product id and a reason for a stock adjustment", () => {
    expect(adjustStockSchema.safeParse({ product_id: PRODUCT_ID, stock_qty: "4", reason: "Barang rusak" }).success).toBe(true);
    expect(adjustStockSchema.safeParse({ product_id: "not-a-uuid", stock_qty: "4", reason: "Barang rusak" }).success).toBe(false);
    expect(adjustStockSchema.safeParse({ product_id: PRODUCT_ID, stock_qty: "4", reason: "   " }).success).toBe(false);
  });

  it("validates the minimum threshold and delete payloads", () => {
    expect(updateMinStockSchema.safeParse({ product_id: PRODUCT_ID, min_stock: "2" }).success).toBe(true);
    expect(updateMinStockSchema.safeParse({ product_id: PRODUCT_ID, min_stock: "-1" }).success).toBe(false);
    expect(deleteProductSchema.safeParse({ product_id: PRODUCT_ID }).success).toBe(true);
    expect(deleteProductSchema.safeParse({ product_id: "" }).success).toBe(false);
  });
});
