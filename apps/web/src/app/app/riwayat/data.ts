import {
  periodKindFromParam,
  periodKindToParam,
  periodLabel,
  resolvePeriod,
  summarize,
  type PeriodKind,
  type ReportExpenseRow,
  type ReportSalesRow,
  type ReportSummary,
} from "@/lib/reports";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { CashTransaction } from "../data";

export const HISTORY_LIMIT = 200;

export type HistoryFilter = PeriodKind | "all";
export const HISTORY_FILTERS: readonly HistoryFilter[] = ["today", "last7", "last30", "thisMonth", "all"];

const ALL_FILTER_PARAM = "semua";

export function historyFilterFromParam(value: unknown): HistoryFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === ALL_FILTER_PARAM) return "all";
  return periodKindFromParam(value);
}

export function historyFilterToParam(filter: HistoryFilter): string {
  return filter === "all" ? ALL_FILTER_PARAM : periodKindToParam(filter);
}

export function historyFilterLabel(filter: HistoryFilter): string {
  return filter === "all" ? "Semua" : periodLabel(filter);
}

type SaleListRow = { id: string; total: number | string; description: string | null; occurred_at: string };
type ExpenseListRow = { id: string; amount: number | string; description: string; occurred_at: string };

function toCashTransaction(row: SaleListRow | ExpenseListRow, type: CashTransaction["type"]): CashTransaction {
  if (type === "income") {
    const sale = row as SaleListRow;
    return { id: sale.id, type, description: sale.description ?? "Uang masuk", amount: BigInt(sale.total), occurredAt: sale.occurred_at };
  }
  const expense = row as ExpenseListRow;
  return { id: expense.id, type, description: expense.description, amount: BigInt(expense.amount), occurredAt: expense.occurred_at };
}

function newestFirst(a: CashTransaction, b: CashTransaction): number {
  return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
}

// MARK: shop_id comes from the trusted membership only, never from the client
export async function getHistory(client: SupabaseServerClient, shopId: string, filter: HistoryFilter, now: Date) {
  const period = filter === "all" ? null : resolvePeriod(filter, now);
  const from = period ? period.start.toISOString() : undefined;
  const to = period ? period.end.toISOString() : undefined;

  const salesTotals = client.from("sales").select("total, occurred_at").eq("shop_id", shopId);
  const expenseTotals = client.from("expenses").select("amount, occurred_at").eq("shop_id", shopId);
  const salesList = client.from("sales").select("id, total, description, occurred_at").eq("shop_id", shopId);
  const expenseList = client.from("expenses").select("id, amount, description, occurred_at").eq("shop_id", shopId);

  const [totalsSales, totalsExpense, listSales, listExpense] = await Promise.all([
    from && to ? salesTotals.gte("occurred_at", from).lt("occurred_at", to) : salesTotals,
    from && to ? expenseTotals.gte("occurred_at", from).lt("occurred_at", to) : expenseTotals,
    from && to
      ? salesList.gte("occurred_at", from).lt("occurred_at", to).order("occurred_at", { ascending: false }).limit(HISTORY_LIMIT)
      : salesList.order("occurred_at", { ascending: false }).limit(HISTORY_LIMIT),
    from && to
      ? expenseList.gte("occurred_at", from).lt("occurred_at", to).order("occurred_at", { ascending: false }).limit(HISTORY_LIMIT)
      : expenseList.order("occurred_at", { ascending: false }).limit(HISTORY_LIMIT),
  ]);
  if (totalsSales.error || totalsExpense.error || listSales.error || listExpense.error) {
    return { history: null, error: true } as const;
  }

  const summary: ReportSummary = summarize(
    (totalsSales.data ?? []) as ReportSalesRow[],
    (totalsExpense.data ?? []) as ReportExpenseRow[],
  );

  const merged = [
    ...((listSales.data ?? []) as SaleListRow[]).map((row) => toCashTransaction(row, "income")),
    ...((listExpense.data ?? []) as ExpenseListRow[]).map((row) => toCashTransaction(row, "expense")),
  ];
  merged.sort(newestFirst);

  const transactions = merged.slice(0, HISTORY_LIMIT);
  return { history: { summary, transactions, capped: transactions.length >= HISTORY_LIMIT }, error: false } as const;
}
