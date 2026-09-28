import { mapSupplierRow, type Supplier, type SupplierRow } from "@/lib/suppliers";
import type { SupabaseServerClient } from "@/lib/supabase/server";

const SUPPLIER_COLUMNS = "id, name, wa_phone, products";

// MARK: shop_id comes from the trusted membership only, never from the client
export async function getSuppliers(client: SupabaseServerClient, shopId: string) {
  const { data, error } = await client
    .from("suppliers")
    .select(SUPPLIER_COLUMNS)
    .eq("shop_id", shopId)
    .order("name", { ascending: true });
  if (error || !data) return { suppliers: null, error: true } as const;
  return { suppliers: (data as SupplierRow[]).map(mapSupplierRow), error: false } as const;
}

export type { Supplier };
