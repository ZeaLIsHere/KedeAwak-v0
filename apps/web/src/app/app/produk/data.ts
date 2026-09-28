import { mapProductRow, type Product, type ProductRow } from "@/lib/inventory";
import type { SupabaseServerClient } from "@/lib/supabase/server";

const PRODUCT_COLUMNS = "id, name, unit, sell_price, buy_price, stock_qty, min_stock";

export async function getProducts(client: SupabaseServerClient, shopId: string) {
  const { data, error } = await client
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("shop_id", shopId)
    .order("name", { ascending: true });
  if (error || !data) return { products: null, error: true } as const;
  return { products: (data as ProductRow[]).map(mapProductRow), error: false } as const;
}

export type { Product };
