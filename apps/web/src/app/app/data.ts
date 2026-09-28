import { listLowStockProducts, type Product } from "@/lib/inventory";
import { getJakartaDayRange, sumRupiah } from "@/lib/ledger";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { getProducts } from "./produk/data";

export type CashTransaction = {
  id: string;
  type: "income" | "expense";
  description: string;
  amount: bigint;
  occurredAt: string;
};

export type TodaySummary = {
  income: bigint;
  expense: bigint;
  difference: bigint;
};

type SaleRow = { id: string; total: number | string; description: string | null; occurred_at: string };
type ExpenseRow = { id: string; amount: number | string; description: string; occurred_at: string };

function toCashTransaction(row: SaleRow | ExpenseRow, type: CashTransaction["type"]): CashTransaction {
  if (type === "income") {
    const sale = row as SaleRow;
    return { id: sale.id, type, description: sale.description ?? "Uang masuk", amount: BigInt(sale.total), occurredAt: sale.occurred_at };
  }
  const expense = row as ExpenseRow;
  return { id: expense.id, type, description: expense.description, amount: BigInt(expense.amount), occurredAt: expense.occurred_at };
}

function newestFirst(a: CashTransaction, b: CashTransaction): number {
  return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
}

export async function getTodaySummary(client: SupabaseServerClient, shopId: string, now: Date) {
  const { start, end } = getJakartaDayRange(now);
  const from = start.toISOString();
  const to = end.toISOString();
  const [sales, expenses] = await Promise.all([
    client.from("sales").select("total").eq("shop_id", shopId).gte("occurred_at", from).lt("occurred_at", to),
    client.from("expenses").select("amount").eq("shop_id", shopId).gte("occurred_at", from).lt("occurred_at", to),
  ]);
  if (sales.error || expenses.error) return { summary: null, error: true } as const;
  const income = sumRupiah(((sales.data ?? []) as { total: number | string }[]).map((row) => row.total));
  const expense = sumRupiah(((expenses.data ?? []) as { amount: number | string }[]).map((row) => row.amount));
  return { summary: { income, expense, difference: income - expense }, error: false } as const;
}

export async function getLowStockProducts(client: SupabaseServerClient, shopId: string) {
  const { products, error } = await getProducts(client, shopId);
  if (error || !products) return { lowStock: null, error: true } as const;
  return { lowStock: listLowStockProducts(products), error: false } as const;
}

export type { Product };

export async function getTransactions(client: SupabaseServerClient, shopId: string, limit: number) {
  const [sales, expenses] = await Promise.all([
    client.from("sales").select("id, total, description, occurred_at").eq("shop_id", shopId).order("occurred_at", { ascending: false }).limit(limit),
    client.from("expenses").select("id, amount, description, occurred_at").eq("shop_id", shopId).order("occurred_at", { ascending: false }).limit(limit),
  ]);
  if (sales.error || expenses.error) return { transactions: null, error: true } as const;
  const merged = [
    ...((sales.data ?? []) as SaleRow[]).map((row) => toCashTransaction(row, "income")),
    ...((expenses.data ?? []) as ExpenseRow[]).map((row) => toCashTransaction(row, "expense")),
  ];
  merged.sort(newestFirst);
  return { transactions: merged.slice(0, limit), error: false } as const;
}
