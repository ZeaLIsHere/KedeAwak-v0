import { formatStockQty, toNumber } from "@/lib/inventory";
import { formatRupiah, todayInJakarta } from "@/lib/ledger";
import { periodLabel, resolvePeriod, summarize, type ReportExpenseRow, type ReportSalesRow } from "@/lib/reports";
import { REPORT_PERIOD_TO_KIND, type ReportPeriod, type ToolResult } from "@/lib/assistant";
import type { SupabaseServerClient } from "@/lib/supabase/server";

// SECTION: Constants
const PRODUCT_SCAN_LIMIT = 500;

// SECTION: Types
type StockProductRow = {
  name: string;
  aliases: string[] | null;
  unit: string;
  stock_qty: number | string | null;
  min_stock: number | string | null;
};

type UsageRow = { ai_calls: number | string | null };

// SECTION: check_stock
function matchScore(row: StockProductRow, normalized: string): number {
  const name = row.name.toLowerCase();
  if (name === normalized) return 4;
  if (name.includes(normalized)) return 3;
  for (const alias of row.aliases ?? []) {
    const value = alias.toLowerCase();
    if (value === normalized) return 2;
    if (value.includes(normalized)) return 1;
  }
  return 0;
}

// MARK: shop_id comes from the trusted membership only, never from the model arguments
export async function runCheckStock(client: SupabaseServerClient, shopId: string, query: string): Promise<ToolResult> {
  const { data, error } = await client
    .from("products")
    .select("name, aliases, unit, stock_qty, min_stock")
    .eq("shop_id", shopId)
    .limit(PRODUCT_SCAN_LIMIT);
  if (error || !data) return { tool: "check_stock", available: false };

  const normalized = query.toLowerCase();
  let best: { row: StockProductRow; score: number } | null = null;
  for (const row of data as StockProductRow[]) {
    const score = matchScore(row, normalized);
    if (score === 0) continue;
    if (!best || score > best.score || (score === best.score && row.name.localeCompare(best.row.name) < 0)) {
      best = { row, score };
    }
  }
  if (!best) return { tool: "check_stock", available: true, found: false, query };

  const stockQty = toNumber(best.row.stock_qty);
  const minStock = toNumber(best.row.min_stock);
  return {
    tool: "check_stock",
    available: true,
    found: true,
    name: best.row.name,
    unit: best.row.unit,
    stockQty: formatStockQty(stockQty),
    low: stockQty <= minStock,
  };
}

// SECTION: get_report
// MARK: Totals are computed by code in integer rupiah, never by the model
export async function runGetReport(
  client: SupabaseServerClient,
  shopId: string,
  period: ReportPeriod,
  now: Date,
): Promise<ToolResult> {
  const kind = REPORT_PERIOD_TO_KIND[period];
  const range = resolvePeriod(kind, now);
  const from = range.start.toISOString();
  const to = range.end.toISOString();

  const [salesResult, expenseResult] = await Promise.all([
    client.from("sales").select("total, occurred_at").eq("shop_id", shopId).gte("occurred_at", from).lt("occurred_at", to),
    client.from("expenses").select("amount, occurred_at").eq("shop_id", shopId).gte("occurred_at", from).lt("occurred_at", to),
  ]);
  if (salesResult.error || expenseResult.error) return { tool: "get_report", available: false };

  const summary = summarize((salesResult.data ?? []) as ReportSalesRow[], (expenseResult.data ?? []) as ReportExpenseRow[]);
  return {
    tool: "get_report",
    available: true,
    periodLabel: periodLabel(kind),
    income: formatRupiah(summary.income),
    expense: formatRupiah(summary.expense),
    difference: formatRupiah(summary.difference),
    count: summary.count,
  };
}

// SECTION: Daily AI usage counter (read-only)
export async function getTodayAiUsage(client: SupabaseServerClient, shopId: string, now: Date) {
  const date = todayInJakarta(now);
  const { data, error } = await client
    .from("usage_counters")
    .select("ai_calls")
    .eq("shop_id", shopId)
    .eq("date", date)
    .maybeSingle();
  if (error) return { aiCalls: null, error: true } as const;
  if (!data) return { aiCalls: 0, error: false } as const;
  return { aiCalls: toNumber((data as UsageRow).ai_calls), error: false } as const;
}
