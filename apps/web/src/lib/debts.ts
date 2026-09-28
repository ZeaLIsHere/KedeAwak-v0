import { z } from "zod";
import { formatRupiah, isValidDateInput, MAX_AMOUNT_RUPIAH } from "./ledger";

// SECTION: Constants
export const DEBT_PARTY_TYPES = ["customer", "supplier"] as const;
export type DebtPartyType = (typeof DEBT_PARTY_TYPES)[number];

export const DEBT_STATUSES = ["outstanding", "partial", "paid"] as const;
export type DebtStatus = (typeof DEBT_STATUSES)[number];

export const DEBT_PARTY_NAME_MAX_LENGTH = 80;

const PARTY_TYPE_LABELS: Record<DebtPartyType, string> = {
  customer: "Pelanggan",
  supplier: "Pemasok",
};

const DEBT_STATUS_LABELS: Record<DebtStatus, string> = {
  outstanding: "Belum dibayar",
  partial: "Dibayar sebagian",
  paid: "Lunas",
};

const DEBT_STATUS_TONES: Record<DebtStatus, "good" | "warning"> = {
  outstanding: "warning",
  partial: "warning",
  paid: "good",
};

// SECTION: Status and label helpers
export function isDebtPartyType(value: unknown): value is DebtPartyType {
  return typeof value === "string" && (DEBT_PARTY_TYPES as readonly string[]).includes(value);
}

export function isDebtStatus(value: unknown): value is DebtStatus {
  return typeof value === "string" && (DEBT_STATUSES as readonly string[]).includes(value);
}

export function partyTypeLabel(type: DebtPartyType): string {
  return PARTY_TYPE_LABELS[type];
}

export function debtStatusLabel(status: DebtStatus): string {
  return DEBT_STATUS_LABELS[status];
}

export function debtStatusTone(status: DebtStatus): "good" | "warning" {
  return DEBT_STATUS_TONES[status];
}

// SECTION: Types and row mapping
export type Debt = {
  id: string;
  partyType: DebtPartyType;
  partyName: string;
  amount: number;
  paidAmount: number;
  dueDate: string | null;
  status: DebtStatus;
};

type NumericColumn = number | string | null | undefined;

export type DebtRow = {
  id: string;
  party_type: string;
  party_name: string;
  amount: NumericColumn;
  paid_amount: NumericColumn;
  due_date: string | null;
  status: string;
};

export function toRupiahValue(value: NumericColumn): number {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : 0;
  }
  return 0;
}

export function mapDebtRow(row: DebtRow): Debt {
  const amount = toRupiahValue(row.amount);
  const paidAmount = toRupiahValue(row.paid_amount);
  return {
    id: row.id,
    partyType: isDebtPartyType(row.party_type) ? row.party_type : "customer",
    partyName: row.party_name,
    amount,
    paidAmount,
    dueDate: row.due_date,
    status: isDebtStatus(row.status) ? row.status : debtStatusFor(amount, paidAmount),
  };
}

// SECTION: Remaining balance and status, always computed in code
export function debtRemaining(amount: number, paidAmount: number): number {
  const remaining = amount - paidAmount;
  return remaining > 0 ? remaining : 0;
}

export function debtStatusFor(amount: number, paidAmount: number): DebtStatus {
  if (paidAmount <= 0) return "outstanding";
  if (paidAmount >= amount) return "paid";
  return "partial";
}

export function isDebtSettled(status: DebtStatus): boolean {
  return status === "paid";
}

export function countUnpaidDebts(debts: readonly Pick<Debt, "status">[]): number {
  let count = 0;
  for (const debt of debts) {
    if (!isDebtSettled(debt.status)) count += 1;
  }
  return count;
}

export function totalRemaining(debts: readonly Pick<Debt, "amount" | "paidAmount">[]): number {
  let total = 0;
  for (const debt of debts) total += debtRemaining(debt.amount, debt.paidAmount);
  return total;
}

// SECTION: Repayment planning
export type RepaymentPlan = {
  paidAmount: number;
  status: DebtStatus;
  remaining: number;
};

export type RepaymentResult = { ok: true; plan: RepaymentPlan } | { ok: false; message: string };

export function planRepayment(amount: number, paidAmount: number, repayment: number): RepaymentResult {
  const remaining = debtRemaining(amount, paidAmount);
  if (remaining <= 0) return { ok: false, message: "Hutang ini sudah lunas." };
  if (!Number.isSafeInteger(repayment) || repayment <= 0) return { ok: false, message: "Nominal pelunasan minimal Rp1." };
  if (repayment > remaining) {
    return { ok: false, message: `Nominal pelunasan melebihi sisa hutang ${formatRupiah(remaining)}.` };
  }
  const nextPaid = paidAmount + repayment;
  return { ok: true, plan: { paidAmount: nextPaid, status: debtStatusFor(amount, nextPaid), remaining: debtRemaining(amount, nextPaid) } };
}

// SECTION: Due date display
const dueDateFormatter = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

export function formatDueDate(value: string | null): string {
  if (!value) return "Tanpa jatuh tempo";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "Tanpa jatuh tempo";
  return dueDateFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

export function isDebtOverdue(dueDate: string | null, todayKey: string): boolean {
  if (!dueDate) return false;
  return dueDate.slice(0, 10) < todayKey;
}

export function toAmountInputValue(value: number): string {
  return String(value);
}

// SECTION: Input schemas
function rupiahFieldSchema(emptyMessage: string) {
  return z
    .string()
    .trim()
    .min(1, emptyMessage)
    .regex(/^[0-9]{1,12}$/, "Gunakan angka rupiah tanpa titik, koma, atau tanda lain.")
    .transform((value) => Number(value))
    .refine((value) => Number.isSafeInteger(value) && value >= 1, "Nominal minimal Rp1.")
    .refine((value) => value <= MAX_AMOUNT_RUPIAH, "Nominal maksimal Rp1.000.000.000.");
}

const partyNameFieldSchema = z
  .string()
  .trim()
  .min(1, "Isi nama pihak terlebih dahulu.")
  .max(DEBT_PARTY_NAME_MAX_LENGTH, `Nama pihak maksimal ${DEBT_PARTY_NAME_MAX_LENGTH} karakter.`);

const dueDateFieldSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || isValidDateInput(value), "Tanggal jatuh tempo tidak valid.");

export const createDebtSchema = z.object({
  party_type: z.enum(DEBT_PARTY_TYPES, "Pilih jenis pihak terlebih dahulu."),
  party_name: partyNameFieldSchema,
  amount: rupiahFieldSchema("Isi nominal hutang terlebih dahulu."),
  due_date: dueDateFieldSchema,
});

export const recordRepaymentSchema = z.object({
  debt_id: z.uuid("Hutang tidak valid."),
  amount: rupiahFieldSchema("Isi nominal pelunasan terlebih dahulu."),
});

export const deleteDebtSchema = z.object({
  debt_id: z.uuid("Hutang tidak valid."),
});

export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type RecordRepaymentInput = z.infer<typeof recordRepaymentSchema>;
