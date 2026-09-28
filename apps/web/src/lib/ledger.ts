import { z } from "zod";

// SECTION: Constants
export const JAKARTA_TIME_ZONE = "Asia/Jakarta";
const JAKARTA_OFFSET_MINUTES = 7 * 60;
const DAY_IN_MS = 86_400_000;
export const MAX_AMOUNT_RUPIAH = 1_000_000_000;
export const MAX_DESCRIPTION_LENGTH = 120;

// SECTION: Currency
const rupiahFormatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

export function formatRupiah(amount: bigint | number): string {
  return `Rp${rupiahFormatter.format(amount)}`;
}

export function sumRupiah(values: readonly (number | string)[]): bigint {
  let total = BigInt(0);
  for (const value of values) total += BigInt(value);
  return total;
}

// SECTION: Amount and text validation
const amountFieldSchema = z
  .string()
  .trim()
  .min(1, "Isi nominal terlebih dahulu.")
  .regex(/^[0-9]{1,12}$/, "Gunakan angka rupiah tanpa titik, koma, atau tanda lain.")
  .refine((value) => Number(value) >= 1, "Nominal minimal Rp1.")
  .refine((value) => Number(value) <= MAX_AMOUNT_RUPIAH, "Nominal maksimal Rp1.000.000.000.");

const descriptionFieldSchema = z
  .string()
  .trim()
  .max(MAX_DESCRIPTION_LENGTH, `Keterangan maksimal ${MAX_DESCRIPTION_LENGTH} karakter.`);

const occurredOnFieldSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || isValidDateInput(value), "Tanggal tidak valid.");

export const incomeInputSchema = z.object({
  amount: amountFieldSchema,
  description: descriptionFieldSchema,
  occurred_on: occurredOnFieldSchema,
});

export const expenseInputSchema = z.object({
  amount: amountFieldSchema,
  description: z
    .string()
    .trim()
    .min(1, "Isi keterangan terlebih dahulu.")
    .max(MAX_DESCRIPTION_LENGTH, `Keterangan maksimal ${MAX_DESCRIPTION_LENGTH} karakter.`),
  occurred_on: occurredOnFieldSchema,
});

export type IncomeInput = z.infer<typeof incomeInputSchema>;
export type ExpenseInput = z.infer<typeof expenseInputSchema>;

export function collectFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = typeof issue.path[0] === "string" ? issue.path[0] : "";
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

// SECTION: Dates in Asia/Jakarta
export function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function todayInJakarta(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: JAKARTA_TIME_ZONE }).format(now);
}

export function getJakartaDayRange(now: Date): { start: Date; end: Date } {
  const jakartaMs = now.getTime() + JAKARTA_OFFSET_MINUTES * 60_000;
  const dayStartMs = Math.floor(jakartaMs / DAY_IN_MS) * DAY_IN_MS;
  const startMs = dayStartMs - JAKARTA_OFFSET_MINUTES * 60_000;
  return { start: new Date(startMs), end: new Date(startMs + DAY_IN_MS) };
}

export function resolveOccurredAt(dateInput: string | null, now: Date): string {
  if (!dateInput) return now.toISOString();
  return new Date(`${dateInput}T00:00:00+07:00`).toISOString();
}

const jakartaDayFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: JAKARTA_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const jakartaTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: JAKARTA_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

export function formatJakartaDate(value: Date): string {
  return jakartaDayFormatter.format(value);
}

export function formatJakartaDateTime(iso: string): string {
  const date = new Date(iso);
  return `${jakartaDayFormatter.format(date)} · ${jakartaTimeFormatter.format(date)}`;
}
