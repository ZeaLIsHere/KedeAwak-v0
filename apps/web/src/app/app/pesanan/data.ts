import { mapProductRow, type ProductRow } from "@/lib/inventory";
import {
  customerLabel,
  isOrderStatus,
  qtyValueToMilli,
  toRupiahBigInt,
  type OrderItemSummary,
  type OrderStatus,
} from "@/lib/orders";
import type { SupabaseServerClient } from "@/lib/supabase/server";

const ORDER_COLUMNS = "id, customer_id, status, total, created_at";
const PRODUCT_COLUMNS = "id, name, unit, sell_price, buy_price, stock_qty, min_stock";
export const ORDER_LIST_LIMIT = 100;

export type OrderView = {
  id: string;
  customerLabel: string;
  status: OrderStatus;
  total: bigint;
  createdAt: string;
  items: OrderItemSummary[];
};

type OrderRow = { id: string; customer_id: string | null; status: string; total: number | string | null; created_at: string };
type OrderItemRow = { order_id: string; product_id: string; qty: number | string | null };
type ProductLiteRow = { id: string; name: string; unit: string };
type CustomerRow = { id: string; name: string | null };

// MARK: shop_id comes from the trusted membership only, never from the client
export async function getOrders(client: SupabaseServerClient, shopId: string) {
  const { data, error } = await client
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(ORDER_LIST_LIMIT);
  if (error || !data) return { orders: null, error: true } as const;

  const rows = data as OrderRow[];
  if (rows.length === 0) return { orders: [] as OrderView[], error: false } as const;

  const orderIds = rows.map((row) => row.id);
  const { data: itemData, error: itemError } = await client
    .from("order_items")
    .select("order_id, product_id, qty")
    .eq("shop_id", shopId)
    .in("order_id", orderIds);
  if (itemError || !itemData) return { orders: null, error: true } as const;
  const itemRows = itemData as OrderItemRow[];

  const productIds = [...new Set(itemRows.map((row) => row.product_id))];
  const productResult = productIds.length
    ? await client.from("products").select("id, name, unit").eq("shop_id", shopId).in("id", productIds)
    : { data: [] as ProductLiteRow[], error: null };
  if (productResult.error) return { orders: null, error: true } as const;
  const products = new Map((productResult.data as ProductLiteRow[]).map((row) => [row.id, row]));

  const customerIds = [...new Set(rows.map((row) => row.customer_id).filter((id): id is string => Boolean(id)))];
  const customerResult = customerIds.length
    ? await client.from("customers").select("id, name").eq("shop_id", shopId).in("id", customerIds)
    : { data: [] as CustomerRow[], error: null };
  if (customerResult.error) return { orders: null, error: true } as const;
  const customers = new Map((customerResult.data as CustomerRow[]).map((row) => [row.id, row]));

  const itemsByOrder = new Map<string, OrderItemSummary[]>();
  for (const item of itemRows) {
    const product = products.get(item.product_id);
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push({ productName: product?.name ?? "Produk", unit: product?.unit ?? "", qtyMilli: qtyValueToMilli(item.qty) });
    itemsByOrder.set(item.order_id, list);
  }

  const orders: OrderView[] = rows.map((row) => ({
    id: row.id,
    customerLabel: customerLabel(row.customer_id ? customers.get(row.customer_id)?.name : null),
    status: isOrderStatus(row.status) ? row.status : "draft",
    total: toRupiahBigInt(row.total),
    createdAt: row.created_at,
    items: itemsByOrder.get(row.id) ?? [],
  }));

  return { orders, error: false } as const;
}

export async function getOrderProducts(client: SupabaseServerClient, shopId: string) {
  const { data, error } = await client
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("shop_id", shopId)
    .order("name", { ascending: true });
  if (error || !data) return { products: null, error: true } as const;
  return { products: (data as ProductRow[]).map(mapProductRow), error: false } as const;
}
