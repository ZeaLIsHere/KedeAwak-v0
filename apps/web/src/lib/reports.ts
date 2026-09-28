import { getJakartaDayRange, JAKARTA_TIME_ZONE, sumRupiah, todayInJakarta } from "./ledger";
import { qtyValueToMilli, toRupiahBigInt } from "./orders";

// SECTION: Period kinds
export const PERIOD_KINDS = ["today", "last7", "last30", "thisMonth"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];
export const DEFAULT_PERIOD_KIND: PeriodKind = "today";

const DAY_IN_MS = 86_400_000;
const DEFAULT_PRODUCT_NAME = "Produk";

const PERIOD_LABELS: Record<PeriodKind, string> = {
  today: "Hari ini",
  last7: "7 hari terakhir",
  last30: "30 hari terakhir",
  thisMonth: "Bulan ini",
};

const PERIOD_PARAMS: Record<PeriodKind, string> = {
  today: "hari-ini",
  last7: "7-hari",
  last30: "30-hari",
  thisMonth: "bulan-ini",
};

export function periodLabel(kind: PeriodKind): string {
  return PERIOD_LABELS[kind];
}

export function periodKindToParam(kind: PeriodKind): string {
  return PERIOD_PARAMS[kind];
}

export function periodKindFromParam(value: unknown): PeriodKind {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === "string") {
    for (const kind of PERIOD_KINDS) {
      if (PERIOD_PARAMS[kind] === raw) return kind;
    }
  }
  return DEFAULT_PERIOD_KIND;
}

// SECTION: Period ranges in Asia/Jakarta
export type PeriodRange = {
  kind: PeriodKind;
  label: string;
  start: Date;
  end: Date;
};

function jakartaMidnight(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+07:00`);
}

function shiftDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_IN_MS);
}

function firstDayOfJakartaMonth(now: Date): { start: Date; end: Date } {
  const [year, month] = todayInJakarta(now).split("-").map(Number);
  const startKey = `${year}-${String(month).padStart(2, "0")}-01`;
  // STEP: Date.UTC uses a zero-based month, so passing the 1-based month rolls forward one month
  const endKey = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return { start: jakartaMidnight(startKey), end: jakartaMidnight(endKey) };
}

export function resolvePeriod(kind: PeriodKind, now: Date): PeriodRange {
  if (kind === "last7" || kind === "last30") {
    const span = kind === "last7" ? 6 : 29;
    return {
      kind,
      label: PERIOD_LABELS[kind],
      start: getJakartaDayRange(shiftDays(now, -span)).start,
      end: getJakartaDayRange(now).end,
    };
  }
  if (kind === "thisMonth") {
    const { start, end } = firstDayOfJakartaMonth(now);
    return { kind, label: PERIOD_LABELS[kind], start, end };
  }
  const { start, end } = getJakartaDayRange(now);
  return { kind, label: PERIOD_LABELS[kind], start, end };
}

// SECTION: Report rows
export type NumericAmount = number | string;
export type ReportSalesRow = { total: NumericAmount; occurred_at: string };
export type ReportExpenseRow = { amount: NumericAmount; occurred_at: string };
export type ReportOrderItemRow = { product_id: string; qty: NumericAmount | null; unit_price: NumericAmount | null };

// SECTION: Totals (integer rupiah only, no floating point)
export type ReportSummary = {
  income: bigint;
  expense: bigint;
  difference: bigint;
  count: number;
};

export function summarize(sales: readonly ReportSalesRow[], expenses: readonly ReportExpenseRow[]): ReportSummary {
  const income = sumRupiah(sales.map((row) => row.total));
  const expense = sumRupiah(expenses.map((row) => row.amount));
  return { income, expense, difference: income - expense, count: sales.length + expenses.length };
}

// SECTION: Daily buckets
export type DailyBucket = {
  day: string;
  income: bigint;
  expense: bigint;
  incomePercent: number;
  expensePercent: number;
};

function percentOf(value: bigint, max: bigint): number {
  if (value <= BigInt(0) || max <= BigInt(0)) return 0;
  // STEP: Integer division keeps bar widths deterministic; clamp small non-zero values to a visible 1
  const percent = Number((value * BigInt(100)) / max);
  return percent > 0 ? percent : 1;
}

function listJakartaDays(start: Date, end: Date): string[] {
  const days: string[] = [];
  for (let ms = start.getTime(); ms < end.getTime(); ms += DAY_IN_MS) {
    days.push(todayInJakarta(new Date(ms)));
  }
  return days;
}

export function groupByJakartaDay(
  sales: readonly ReportSalesRow[],
  expenses: readonly ReportExpenseRow[],
  period: Pick<PeriodRange, "start" | "end">,
): DailyBucket[] {
  const days = listJakartaDays(period.start, period.end);
  const totals = new Map<string, { income: bigint; expense: bigint }>();
  const startMs = period.start.getTime();
  const endMs = period.end.getTime();

  for (const row of sales) {
    const at = Date.parse(row.occurred_at);
    if (!Number.isFinite(at) || at < startMs || at >= endMs) continue;
    const key = todayInJakarta(new Date(at));
    const bucket = totals.get(key) ?? { income: BigInt(0), expense: BigInt(0) };
    bucket.income += BigInt(row.total);
    totals.set(key, bucket);
  }
  for (const row of expenses) {
    const at = Date.parse(row.occurred_at);
    if (!Number.isFinite(at) || at < startMs || at >= endMs) continue;
    const key = todayInJakarta(new Date(at));
    const bucket = totals.get(key) ?? { income: BigInt(0), expense: BigInt(0) };
    bucket.expense += BigInt(row.amount);
    totals.set(key, bucket);
  }

  let max = BigInt(0);
  for (const day of days) {
    const bucket = totals.get(day);
    if (!bucket) continue;
    if (bucket.income > max) max = bucket.income;
    if (bucket.expense > max) max = bucket.expense;
  }

  return days.map((day) => {
    const bucket = totals.get(day) ?? { income: BigInt(0), expense: BigInt(0) };
    return {
      day,
      income: bucket.income,
      expense: bucket.expense,
      incomePercent: percentOf(bucket.income, max),
      expensePercent: percentOf(bucket.expense, max),
    };
  });
}

// SECTION: Top products
export type TopProduct = {
  productId: string;
  name: string;
  qtyMilli: number;
  revenue: bigint;
};

export function topProducts(
  items: readonly ReportOrderItemRow[],
  productNames: ReadonlyMap<string, string>,
  limit: number,
): TopProduct[] {
  const totals = new Map<string, { qtyMilli: number; revenue: bigint }>();
  for (const item of items) {
    const qtyMilli = qtyValueToMilli(item.qty);
    if (qtyMilli <= 0) continue;
    const revenue = (BigInt(qtyMilli) * toRupiahBigInt(item.unit_price) + BigInt(500)) / BigInt(1000);
    const current = totals.get(item.product_id);
    if (current) {
      current.qtyMilli += qtyMilli;
      current.revenue += revenue;
    } else {
      totals.set(item.product_id, { qtyMilli, revenue });
    }
  }

  const list: TopProduct[] = [];
  for (const [productId, value] of totals) {
    list.push({ productId, name: productNames.get(productId) ?? DEFAULT_PRODUCT_NAME, qtyMilli: value.qtyMilli, revenue: value.revenue });
  }
  list.sort((a, b) => b.qtyMilli - a.qtyMilli || compareRevenue(a.revenue, b.revenue) || a.name.localeCompare(b.name));
  return limit > 0 ? list.slice(0, limit) : list;
}

function compareRevenue(a: bigint, b: bigint): number {
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

// SECTION: Display helpers
const dayShortFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: JAKARTA_TIME_ZONE,
  day: "numeric",
  month: "short",
});

export function formatReportDay(day: string): string {
  return dayShortFormatter.format(jakartaMidnight(day));
}
