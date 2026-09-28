import {
  groupByJakartaDay,
  resolvePeriod,
  summarize,
  topProducts,
  type DailyBucket,
  type PeriodKind,
  type PeriodRange,
  type ReportExpenseRow,
  type ReportOrderItemRow,
  type ReportSalesRow,
  type ReportSummary,
  type TopProduct,
} from "@/lib/reports";
import type { SupabaseServerClient } from "@/lib/supabase/server";

const TOP_PRODUCT_LIMIT = 5;
const ORDER_SCAN_LIMIT = 500;
const COMPLETED_ORDER_STATUSES = ["completed", "paid"];

type OrderIdRow = { id: string };
type ProductNameRow = { id: string; name: string };

export type ReportData = {
  period: PeriodRange;
  summary: ReportSummary;
  buckets: DailyBucket[];
  topProducts: TopProduct[];
};

// MARK: shop_id comes from the trusted membership only, never from the client
export async function getReport(client: SupabaseServerClient, shopId: string, kind: PeriodKind, now: Date) {
  const period = resolvePeriod(kind, now);
  const from = period.start.toISOString();
  const to = period.end.toISOString();

  const [salesResult, expenseResult] = await Promise.all([
    client.from("sales").select("total, occurred_at").eq("shop_id", shopId).gte("occurred_at", from).lt("occurred_at", to),
    client.from("expenses").select("amount, occurred_at").eq("shop_id", shopId).gte("occurred_at", from).lt("occurred_at", to),
  ]);
  if (salesResult.error || expenseResult.error) return { report: null, error: true } as const;

  const sales = (salesResult.data ?? []) as ReportSalesRow[];
  const expenses = (expenseResult.data ?? []) as ReportExpenseRow[];
  const summary = summarize(sales, expenses);
  const buckets = groupByJakartaDay(sales, expenses, period);

  const top = await getTopProducts(client, shopId, from, to);
  if (top === null) return { report: null, error: true } as const;

  return { report: { period, summary, buckets, topProducts: top } as ReportData, error: false } as const;
}

async function getTopProducts(client: SupabaseServerClient, shopId: string, from: string, to: string): Promise<TopProduct[] | null> {
  const ordersResult = await client
    .from("orders")
    .select("id")
    .eq("shop_id", shopId)
    .in("status", COMPLETED_ORDER_STATUSES)
    .gte("created_at", from)
    .lt("created_at", to)
    .limit(ORDER_SCAN_LIMIT);
  if (ordersResult.error) return null;

  const orderIds = ((ordersResult.data ?? []) as OrderIdRow[]).map((row) => row.id);
  if (orderIds.length === 0) return [];

  const itemsResult = await client
    .from("order_items")
    .select("product_id, qty, unit_price")
    .eq("shop_id", shopId)
    .in("order_id", orderIds);
  if (itemsResult.error) return null;
  const items = (itemsResult.data ?? []) as ReportOrderItemRow[];

  const productIds = [...new Set(items.map((item) => item.product_id))];
  const names = new Map<string, string>();
  if (productIds.length > 0) {
    const productsResult = await client.from("products").select("id, name").eq("shop_id", shopId).in("id", productIds);
    if (productsResult.error) return null;
    for (const row of (productsResult.data ?? []) as ProductNameRow[]) names.set(row.id, row.name);
  }

  return topProducts(items, names, TOP_PRODUCT_LIMIT);
}
