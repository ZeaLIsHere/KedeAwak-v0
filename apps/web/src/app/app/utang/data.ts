import { mapDebtRow, type Debt, type DebtRow } from "@/lib/debts";
import type { SupabaseServerClient } from "@/lib/supabase/server";

const DEBT_COLUMNS = "id, party_type, party_name, amount, paid_amount, due_date, status";
export const DEBT_LIST_LIMIT = 200;

// MARK: shop_id comes from the trusted membership only, never from the client
export async function getDebts(client: SupabaseServerClient, shopId: string) {
  const { data, error } = await client
    .from("debts")
    .select(DEBT_COLUMNS)
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(DEBT_LIST_LIMIT);
  if (error || !data) return { debts: null, error: true } as const;
  return { debts: (data as DebtRow[]).map(mapDebtRow), error: false } as const;
}

export type { Debt };
