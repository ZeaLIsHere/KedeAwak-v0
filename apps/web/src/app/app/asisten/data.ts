import { formatStockQty, toNumber } from "@/lib/inventory";
import { formatRupiah, todayInJakarta } from "@/lib/ledger";
import { periodLabel, resolvePeriod, summarize, type ReportExpenseRow, type ReportSalesRow } from "@/lib/reports";
import { REPORT_PERIOD_TO_KIND, type ReportPeriod, type ToolResult, type WritePayload, type WriteToolName } from "@/lib/assistant";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { AgentLogEntry, AssistantStore, PendingActionView, QuotaDecision, WriteExecution } from "./flow";

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

type PendingRow = {
  id: string;
  action_type: string;
  payload: unknown;
  summary: string;
  expires_at: string;
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
// MARK: Totals are computed by code in integer rupiah, never by the model (NFR-AI-03)
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

// SECTION: Identity helpers
export async function getAssistantUserId(client: SupabaseServerClient, authId: string) {
  const { data, error } = await client.from("users").select("id").eq("auth_id", authId).limit(1).maybeSingle();
  if (error || !data) return { userId: null, error: error !== null } as const;
  return { userId: String((data as { id: string }).id), error: false } as const;
}

// SECTION: Pending actions
async function findLatestPending(
  client: SupabaseServerClient,
  shopId: string,
  userId: string,
): Promise<PendingActionView | null> {
  const { data, error } = await client
    .from("assistant_pending_actions")
    .select("id, action_type, payload, summary, expires_at")
    .eq("shop_id", shopId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as PendingRow;
  return { id: row.id, actionType: row.action_type, payload: row.payload, summary: row.summary, expiresAt: new Date(row.expires_at) };
}

export async function getOpenPendingAction(
  client: SupabaseServerClient,
  shopId: string,
  userId: string,
  now: Date,
): Promise<PendingActionView | null> {
  const pending = await findLatestPending(client, shopId, userId);
  if (!pending) return null;
  return pending.expiresAt.getTime() <= now.getTime() ? null : pending;
}

// SECTION: Daily AI usage counter
export async function getTodayAiUsage(client: SupabaseServerClient, shopId: string, now: Date) {
  const date = todayInJakarta(now);
  const { data, error } = await client
    .from("usage_counters")
    .select("ai_calls")
    .eq("shop_id", shopId)
    .eq("date", date)
    .maybeSingle();
  if (error) return { used: null, error: true } as const;
  if (!data) return { used: 0, error: false } as const;
  return { used: toNumber((data as UsageRow).ai_calls), error: false } as const;
}

// SECTION: Store bound to the trusted shop and user
export type AssistantStoreContext = {
  client: SupabaseServerClient;
  shopId: string;
  userId: string;
  now: Date;
  quotaLimit: number;
};

// MARK: All writes carry the trusted shop_id; the model never supplies it
export function createAssistantStore(context: AssistantStoreContext): AssistantStore {
  const { client, shopId, userId, now, quotaLimit } = context;

  return {
    checkStock: (query) => runCheckStock(client, shopId, query),
    getReport: (period) => runGetReport(client, shopId, period, now),

    findOpenPendingAction: () => findLatestPending(client, shopId, userId),

    async expirePendingAction(id) {
      await client
        .from("assistant_pending_actions")
        .update({ status: "expired" })
        .eq("id", id)
        .eq("shop_id", shopId)
        .eq("status", "pending")
        .select("id");
    },

    async rejectPendingAction(id) {
      await client
        .from("assistant_pending_actions")
        .update({ status: "rejected" })
        .eq("id", id)
        .eq("shop_id", shopId)
        .eq("status", "pending")
        .select("id");
    },

    async confirmPendingAction(id) {
      const { data, error } = await client
        .from("assistant_pending_actions")
        .update({ status: "confirmed" })
        .eq("id", id)
        .eq("shop_id", shopId)
        .eq("status", "pending")
        .select("id");
      if (error) return false;
      return Array.isArray(data) && data.length > 0;
    },

    async createPendingAction({ actionType, payload, summary, expiresAt }: {
      actionType: WriteToolName;
      payload: unknown;
      summary: string;
      expiresAt: Date;
    }) {
      const { data, error } = await client
        .from("assistant_pending_actions")
        .insert({
          shop_id: shopId,
          user_id: userId,
          action_type: actionType,
          payload,
          summary,
          status: "pending",
          expires_at: expiresAt.toISOString(),
        })
        .select("id")
        .single();
      if (error || !data) return null;
      return { id: String((data as { id: string }).id) };
    },

    async executeWrite(action: WritePayload): Promise<WriteExecution> {
      const occurredAt = now.toISOString();
      if (action.actionType === "create_expense") {
        const { error } = await client.from("expenses").insert({
          shop_id: shopId,
          description: action.payload.description,
          amount: action.payload.amount,
          occurred_at: occurredAt,
        });
        if (error) return { ok: false, message: "Pengeluaran belum dapat disimpan. Coba lagi nanti." };
        return { ok: true };
      }
      const { error } = await client.from("sales").insert({
        shop_id: shopId,
        total: action.payload.total,
        description: action.payload.description || null,
        occurred_at: occurredAt,
      });
      if (error) return { ok: false, message: "Penjualan belum dapat disimpan. Coba lagi nanti." };
      return { ok: true };
    },

    async logTool(entry: AgentLogEntry): Promise<void> {
      try {
        await client.from("agent_logs").insert({
          shop_id: shopId,
          tool: entry.tool,
          args: entry.args ?? {},
          result: { summary: entry.result },
          latency_ms: entry.latencyMs,
          error: entry.error ?? null,
        });
      } catch {
        // MARK: logging must never break the user reply
      }
    },

    async reserveAiCall(): Promise<QuotaDecision> {
      const date = todayInJakarta(now);
      const { data, error } = await client
        .from("usage_counters")
        .select("ai_calls")
        .eq("shop_id", shopId)
        .eq("date", date)
        .maybeSingle();
      if (error) return { allowed: true, used: 0, limit: quotaLimit };

      const used = data ? toNumber((data as UsageRow).ai_calls) : 0;
      if (used >= quotaLimit) return { allowed: false, used, limit: quotaLimit };

      // MARK: Optimistic increment; a write failure fails open so the assistant stays usable
      await client
        .from("usage_counters")
        .upsert({ shop_id: shopId, date, ai_calls: used + 1 }, { onConflict: "shop_id,date" });
      return { allowed: true, used: used + 1, limit: quotaLimit };
    },
  };
}
