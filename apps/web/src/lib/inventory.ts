import { z } from "zod";

// SECTION: Constants
export const PRODUCT_NAME_MAX_LENGTH = 80;
export const PRODUCT_UNIT_MAX_LENGTH = 20;
export const PRODUCT_REASON_MAX_LENGTH = 120;
export const MAX_PRICE_RUPIAH = 1_000_000_000;
export const MAX_STOCK_VALUE = 1_000_000;

// SECTION: Types
export type StockStatus = "low" | "ok";

export type Product = {
  id: string;
  name: string;
  unit: string;
  sellPrice: number;
  buyPrice: number;
  stockQty: number;
  minStock: number;
};

type NumericColumn = number | string | null | undefined;

export type ProductRow = {
  id: string;
  name: string;
  unit: string;
  sell_price: NumericColumn;
  buy_price: NumericColumn;
  stock_qty: NumericColumn;
  min_stock: NumericColumn;
};

// SECTION: Row mapping
export function toNumber(value: NumericColumn): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function mapProductRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    sellPrice: toNumber(row.sell_price),
    buyPrice: toNumber(row.buy_price),
    stockQty: toNumber(row.stock_qty),
    minStock: toNumber(row.min_stock),
  };
}

// SECTION: Stock status
export function stockStatus(stockQty: number, minStock: number): StockStatus {
  return stockQty <= minStock ? "low" : "ok";
}

export function stockStatusLabel(status: StockStatus): string {
  return status === "low" ? "Stok menipis" : "Stok cukup";
}

export function listLowStockProducts(products: readonly Product[]): Product[] {
  return products.filter((product) => stockStatus(product.stockQty, product.minStock) === "low");
}

// SECTION: Quantity formatting
const stockFormatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });

export function formatStockQty(value: number): string {
  return stockFormatter.format(value);
}

export function toStockInputValue(value: number): string {
  return String(value).replace(".", ",");
}

// SECTION: Numeric parsing
const integerPattern = /^[0-9]{1,10}$/;
const decimalPattern = /^[0-9]{1,10}(,[0-9]{1,3})?$/;

export function parseRupiahInput(value: string): number | null {
  const trimmed = value.trim();
  if (!integerPattern.test(trimmed)) return null;
  const amount = Number(trimmed);
  if (!Number.isSafeInteger(amount) || amount > MAX_PRICE_RUPIAH) return null;
  return amount;
}

export function parseStockInput(value: string): number | null {
  const trimmed = value.trim();
  if (!decimalPattern.test(trimmed)) return null;
  const amount = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_STOCK_VALUE) return null;
  return amount;
}

// SECTION: Input schemas
function stockField(emptyMessage: string) {
  return z
    .string()
    .trim()
    .min(1, emptyMessage)
    .transform((value) => parseStockInput(value))
    .refine((value): value is number => value !== null, "Gunakan angka bulat, atau koma untuk desimal maksimal 3 angka.");
}

const nameFieldSchema = z
  .string()
  .trim()
  .min(1, "Isi nama produk terlebih dahulu.")
  .max(PRODUCT_NAME_MAX_LENGTH, `Nama produk maksimal ${PRODUCT_NAME_MAX_LENGTH} karakter.`);

const unitFieldSchema = z
  .string()
  .trim()
  .min(1, "Isi satuan terlebih dahulu.")
  .max(PRODUCT_UNIT_MAX_LENGTH, `Satuan maksimal ${PRODUCT_UNIT_MAX_LENGTH} karakter.`);

const priceFieldSchema = z
  .string()
  .trim()
  .min(1, "Isi harga terlebih dahulu.")
  .transform((value) => parseRupiahInput(value))
  .refine((value): value is number => value !== null, "Gunakan angka rupiah tanpa titik, koma, atau tanda lain.");

const productIdFieldSchema = z.uuid();

export const createProductSchema = z.object({
  name: nameFieldSchema,
  unit: unitFieldSchema,
  sell_price: priceFieldSchema,
  buy_price: priceFieldSchema,
  stock_qty: stockField("Isi jumlah stok terlebih dahulu."),
  min_stock: stockField("Isi ambang minimum terlebih dahulu."),
});

export const adjustStockSchema = z.object({
  product_id: productIdFieldSchema,
  stock_qty: stockField("Isi jumlah stok terlebih dahulu."),
  reason: z
    .string()
    .trim()
    .min(1, "Isi alasan penyesuaian terlebih dahulu.")
    .max(PRODUCT_REASON_MAX_LENGTH, `Alasan maksimal ${PRODUCT_REASON_MAX_LENGTH} karakter.`),
});

export const updateMinStockSchema = z.object({
  product_id: productIdFieldSchema,
  min_stock: stockField("Isi ambang minimum terlebih dahulu."),
});

export const deleteProductSchema = z.object({
  product_id: productIdFieldSchema,
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type UpdateMinStockInput = z.infer<typeof updateMinStockSchema>;
export type DeleteProductInput = z.infer<typeof deleteProductSchema>;
