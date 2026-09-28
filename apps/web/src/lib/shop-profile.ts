import { z } from "zod";

// SECTION: Constants
export const SHOP_NAME_MAX_LENGTH = 80;
export const BUSINESS_TYPE_MAX_LENGTH = 60;
export const OPENING_HOURS_MAX_LENGTH = 120;
export const ADDRESS_MAX_LENGTH = 200;

// SECTION: Types and row mapping
export type ShopProfile = {
  id: string;
  name: string;
  businessType: string;
  openingHours: string | null;
  address: string | null;
  waPhoneNumberId: string | null;
  plan: string;
  autoReplyEnabled: boolean;
};

export type ShopProfileRow = {
  id: string;
  name: string;
  business_type: string;
  opening_hours: string | null;
  address: string | null;
  wa_phone_number_id: string | null;
  plan: string;
  auto_reply_enabled: boolean;
};

export function mapShopProfileRow(row: ShopProfileRow): ShopProfile {
  return {
    id: row.id,
    name: row.name,
    businessType: row.business_type,
    openingHours: row.opening_hours,
    address: row.address,
    waPhoneNumberId: row.wa_phone_number_id,
    plan: row.plan,
    autoReplyEnabled: Boolean(row.auto_reply_enabled),
  };
}

// SECTION: Read only status labels
const PLAN_LABELS: Record<string, string> = {
  free: "Gratis",
  pro: "Pro",
};

export function planLabel(plan: string): string {
  return PLAN_LABELS[plan] ?? plan;
}

export function waNumberStatusLabel(waPhoneNumberId: string | null): string {
  return waPhoneNumberId ? "Nomor bisnis tersimpan, belum terhubung" : "Belum ada nomor bisnis";
}

export function toNullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// SECTION: Checkbox parsing
export function parseCheckboxValue(value: string | boolean | null | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "on" || normalized === "true" || normalized === "1" || normalized === "yes";
}

// SECTION: Input schemas
const nameFieldSchema = z
  .string()
  .trim()
  .min(1, "Isi nama warung terlebih dahulu.")
  .max(SHOP_NAME_MAX_LENGTH, `Nama warung maksimal ${SHOP_NAME_MAX_LENGTH} karakter.`);

const businessTypeFieldSchema = z
  .string()
  .trim()
  .min(1, "Isi jenis usaha terlebih dahulu.")
  .max(BUSINESS_TYPE_MAX_LENGTH, `Jenis usaha maksimal ${BUSINESS_TYPE_MAX_LENGTH} karakter.`);

const openingHoursFieldSchema = z
  .string()
  .trim()
  .max(OPENING_HOURS_MAX_LENGTH, `Jam buka maksimal ${OPENING_HOURS_MAX_LENGTH} karakter.`);

const addressFieldSchema = z.string().trim().max(ADDRESS_MAX_LENGTH, `Alamat maksimal ${ADDRESS_MAX_LENGTH} karakter.`);

export const shopProfileSchema = z.object({
  name: nameFieldSchema,
  business_type: businessTypeFieldSchema,
  opening_hours: openingHoursFieldSchema,
  address: addressFieldSchema,
});

export const autoReplySchema = z.object({
  enabled: z
    .union([z.string(), z.boolean()])
    .transform((value) => parseCheckboxValue(value))
    .pipe(z.boolean()),
});

export type ShopProfileInput = z.infer<typeof shopProfileSchema>;
export type AutoReplyInput = z.infer<typeof autoReplySchema>;
