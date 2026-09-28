import { z } from "zod";

// SECTION: Constants
export const SUPPLIER_NAME_MAX_LENGTH = 80;
export const SUPPLIER_PHONE_MAX_LENGTH = 24;
export const SUPPLIER_PRODUCTS_NOTE_MAX_LENGTH = 400;
export const SUPPLIER_PRODUCTS_MAX_ITEMS = 20;
export const SUPPLIER_PRODUCT_ITEM_MAX_LENGTH = 40;

// NOTE: 9 to 15 digits keeps the E.164 shape while rejecting obviously short numbers
const E164_PATTERN = /^\+[1-9][0-9]{8,14}$/;
const PRODUCT_SEPARATOR_PATTERN = /[\n,;]/;
const PHONE_SEPARATOR_PATTERN = /[\s().-]/g;
const WHITESPACE_PATTERN = /\s+/g;

// SECTION: Types and row mapping
export type Supplier = {
  id: string;
  name: string;
  waPhone: string;
  products: string[];
};

export type SupplierRow = {
  id: string;
  name: string;
  wa_phone: string;
  products: string[] | null;
};

export function mapSupplierRow(row: SupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    waPhone: row.wa_phone,
    products: normalizeProductItems(row.products ?? []),
  };
}

// SECTION: WhatsApp phone in E.164 format
export function normalizePhoneInput(value: string): string {
  const compact = value.trim().replace(PHONE_SEPARATOR_PATTERN, "");
  if (compact === "") return "";
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("62")) return `+${compact}`;
  if (compact.startsWith("0")) return `+62${compact.slice(1)}`;
  return `+${compact}`;
}

export function isValidE164Phone(value: string): boolean {
  return E164_PATTERN.test(value);
}

export function parseSupplierPhone(value: string): string | null {
  const normalized = normalizePhoneInput(value);
  return isValidE164Phone(normalized) ? normalized : null;
}

// SECTION: Products note stored in the text[] column
export function parseProductsNote(value: string): string[] {
  const items: string[] = [];
  for (const chunk of value.split(PRODUCT_SEPARATOR_PATTERN)) {
    const item = chunk.trim().replace(WHITESPACE_PATTERN, " ");
    if (item && !items.includes(item)) items.push(item);
  }
  return items;
}

export function normalizeProductItems(products: readonly string[]): string[] {
  const items: string[] = [];
  for (const product of products) {
    const item = product.trim().replace(WHITESPACE_PATTERN, " ");
    if (item && !items.includes(item)) items.push(item);
  }
  return items;
}

export function formatProductsNote(products: readonly string[]): string {
  return products.join(", ");
}

// SECTION: Input schemas
const nameFieldSchema = z
  .string()
  .trim()
  .min(1, "Isi nama supplier terlebih dahulu.")
  .max(SUPPLIER_NAME_MAX_LENGTH, `Nama supplier maksimal ${SUPPLIER_NAME_MAX_LENGTH} karakter.`);

const phoneFieldSchema = z
  .string()
  .trim()
  .min(1, "Isi nomor WhatsApp supplier terlebih dahulu.")
  .max(SUPPLIER_PHONE_MAX_LENGTH, "Nomor WhatsApp terlalu panjang.")
  .transform(parseSupplierPhone)
  .refine((value): value is string => value !== null, "Gunakan format +62, contoh +6281234567890.");

const productsNoteFieldSchema = z
  .string()
  .trim()
  .max(SUPPLIER_PRODUCTS_NOTE_MAX_LENGTH, `Catatan produk maksimal ${SUPPLIER_PRODUCTS_NOTE_MAX_LENGTH} karakter.`)
  .transform(parseProductsNote)
  .refine((items) => items.length <= SUPPLIER_PRODUCTS_MAX_ITEMS, `Maksimal ${SUPPLIER_PRODUCTS_MAX_ITEMS} produk dalam satu supplier.`)
  .refine(
    (items) => items.every((item) => item.length <= SUPPLIER_PRODUCT_ITEM_MAX_LENGTH),
    `Nama produk maksimal ${SUPPLIER_PRODUCT_ITEM_MAX_LENGTH} karakter.`,
  );

export const createSupplierSchema = z.object({
  name: nameFieldSchema,
  wa_phone: phoneFieldSchema,
  products: productsNoteFieldSchema,
});

export const updateSupplierSchema = z.object({
  supplier_id: z.uuid("Supplier tidak valid."),
  name: nameFieldSchema,
  wa_phone: phoneFieldSchema,
  products: productsNoteFieldSchema,
});

export const deleteSupplierSchema = z.object({
  supplier_id: z.uuid("Supplier tidak valid."),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
