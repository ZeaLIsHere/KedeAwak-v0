import { describe, expect, it } from "vitest";
import {
  createSupplierSchema,
  deleteSupplierSchema,
  formatProductsNote,
  isValidE164Phone,
  mapSupplierRow,
  normalizePhoneInput,
  normalizeProductItems,
  parseProductsNote,
  parseSupplierPhone,
  SUPPLIER_PRODUCTS_MAX_ITEMS,
  updateSupplierSchema,
} from "./suppliers";

const SUPPLIER_ID = "33333333-3333-4333-8333-333333333333";

describe("supplier row mapping", () => {
  it("maps a row and cleans the products array", () => {
    expect(
      mapSupplierRow({
        id: "s1",
        name: "Toko Beras",
        wa_phone: "+6281234567890",
        products: ["  Beras  ", "beras", "Gula", ""],
      }),
    ).toEqual({ id: "s1", name: "Toko Beras", waPhone: "+6281234567890", products: ["Beras", "beras", "Gula"] });
  });

  it("treats a null products column as an empty list", () => {
    expect(mapSupplierRow({ id: "s2", name: "Toko Gula", wa_phone: "+628111111111", products: null }).products).toEqual([]);
  });
});

describe("supplier phone validation (E.164 with plus)", () => {
  it("accepts an already normalized +62 number", () => {
    expect(isValidE164Phone("+6281234567890")).toBe(true);
    expect(parseSupplierPhone("+6281234567890")).toBe("+6281234567890");
  });

  it("normalizes Indonesian local, 62, and spaced formats", () => {
    expect(normalizePhoneInput("081234567890")).toBe("+6281234567890");
    expect(normalizePhoneInput("6281234567890")).toBe("+6281234567890");
    expect(normalizePhoneInput("+62 812-3456-7890")).toBe("+6281234567890");
    expect(normalizePhoneInput("(0812) 3456 7890")).toBe("+6281234567890");
    expect(parseSupplierPhone("081234567890")).toBe("+6281234567890");
  });

  it("rejects numbers that are too short, too long, or missing the plus", () => {
    expect(parseSupplierPhone("")).toBeNull();
    expect(parseSupplierPhone("0812345")).toBeNull();
    expect(parseSupplierPhone("0")).toBeNull();
    expect(parseSupplierPhone("+0123456789")).toBeNull();
    expect(isValidE164Phone("6281234567890")).toBe(false);
    expect(isValidE164Phone("+628123456789012345")).toBe(false);
    expect(parseSupplierPhone("+628123456789012345")).toBeNull();
  });
});

describe("products note parsing", () => {
  it("splits on new lines, commas, and semicolons and removes duplicates", () => {
    expect(parseProductsNote("Beras, Gula\nMinyak; Gula")).toEqual(["Beras", "Gula", "Minyak"]);
    expect(parseProductsNote("   ")).toEqual([]);
  });

  it("collapses inner whitespace", () => {
    expect(parseProductsNote("Beras   premium")).toEqual(["Beras premium"]);
  });

  it("keeps the stored array clean and renders it back for editing", () => {
    expect(normalizeProductItems([" Beras ", "Beras", ""])).toEqual(["Beras"]);
    expect(formatProductsNote(["Beras", "Gula"])).toBe("Beras, Gula");
  });
});

describe("supplier input schemas", () => {
  it("accepts a valid supplier and normalizes the phone and products", () => {
    const result = createSupplierSchema.safeParse({ name: "  Toko Beras ", wa_phone: "081234567890", products: "Beras, Gula" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Toko Beras", wa_phone: "+6281234567890", products: ["Beras", "Gula"] });
    }
  });

  it("allows an empty products note", () => {
    const result = createSupplierSchema.safeParse({ name: "Toko Beras", wa_phone: "+6281234567890", products: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.products).toEqual([]);
  });

  it("rejects a missing name, a bad phone, and an over long note", () => {
    const valid = { name: "Toko Beras", wa_phone: "+6281234567890", products: "" };
    expect(createSupplierSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(createSupplierSchema.safeParse({ ...valid, name: "x".repeat(81) }).success).toBe(false);
    expect(createSupplierSchema.safeParse({ ...valid, wa_phone: "0812345" }).success).toBe(false);
    expect(createSupplierSchema.safeParse({ ...valid, wa_phone: "" }).success).toBe(false);
    expect(createSupplierSchema.safeParse({ ...valid, products: "x".repeat(401) }).success).toBe(false);
  });

  it("caps the number of products and the length of each product", () => {
    const many = Array.from({ length: SUPPLIER_PRODUCTS_MAX_ITEMS + 1 }, (_, index) => `Produk ${index}`).join(", ");
    const valid = { name: "Toko Beras", wa_phone: "+6281234567890", products: many };
    expect(createSupplierSchema.safeParse(valid).success).toBe(false);
    expect(createSupplierSchema.safeParse({ ...valid, products: "x".repeat(41) }).success).toBe(false);
  });

  it("validates the update and delete payloads with a supplier id", () => {
    expect(updateSupplierSchema.safeParse({ supplier_id: SUPPLIER_ID, name: "Toko Beras", wa_phone: "+6281234567890", products: "" }).success).toBe(true);
    expect(updateSupplierSchema.safeParse({ supplier_id: "not-a-uuid", name: "Toko Beras", wa_phone: "+6281234567890", products: "" }).success).toBe(false);
    expect(deleteSupplierSchema.safeParse({ supplier_id: SUPPLIER_ID }).success).toBe(true);
    expect(deleteSupplierSchema.safeParse({ supplier_id: "" }).success).toBe(false);
  });
});
