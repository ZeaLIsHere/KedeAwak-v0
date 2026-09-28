"use server";

import { revalidatePath } from "next/cache";
import { toNumber } from "@/lib/inventory";
import { collectFieldErrors, formatRupiah } from "@/lib/ledger";
import { getIdentity, getMembership } from "@/lib/membership";
import {
  completeOrderSchema,
  createOrderSchema,
  friendlyOrderErrorMessage,
  GENERIC_ORDER_ERROR_MESSAGE,
  orderStatusLabel,
  orderTotal,
  qtyMilliToDecimal,
  setOrderStatusSchema,
  type OrderLine,
} from "@/lib/orders";
import type { SupabaseServerClient } from "@/lib/supabase/server";

export type OrderActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
  nonce?: string;
};

const MEMBERSHIP_ERROR_MESSAGE = "Data warung belum dapat dimuat. Coba lagi nanti.";
const PROFILE_MISSING_MESSAGE = "Profil warung belum tersedia. Selesaikan langkah awal terlebih dahulu.";
const OWNER_ONLY_MESSAGE = "Hanya pemilik warung yang dapat mengelola pesanan.";
const SAVE_ERROR_MESSAGE = "Pesanan belum dapat disimpan. Coba lagi nanti.";

type OwnerGuard =
  | { ok: true; client: SupabaseServerClient; shopId: string }
  | { ok: false; state: OrderActionState };

// MARK: shop_id and role come from the trusted membership only, never from the form
async function requireOwner(): Promise<OwnerGuard> {
  const { client, authId } = await getIdentity();
  const { membership, error } = await getMembership(client, authId);
  if (error) return { ok: false, state: { status: "error", message: MEMBERSHIP_ERROR_MESSAGE } };
  if (!membership) return { ok: false, state: { status: "error", message: PROFILE_MISSING_MESSAGE } };
  if (membership.role !== "owner") return { ok: false, state: { status: "error", message: OWNER_ONLY_MESSAGE } };
  return { ok: true, client, shopId: membership.shop_id };
}

function refreshOrderViews() {
  revalidatePath("/app/pesanan");
  revalidatePath("/app");
  revalidatePath("/app/riwayat");
}

type ProductPriceRow = { id: string; name: string; unit: string; sell_price: number | string | null };

export async function createOrder(_state: OrderActionState, form: FormData): Promise<OrderActionState> {
  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("items") ?? "[]"));
  } catch {
    return { status: "error", message: "Daftar produk tidak terbaca. Muat ulang halaman lalu coba lagi." };
  }

  const parsed = createOrderSchema.safeParse({ items: payload });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Periksa kembali produk dan jumlah pada pesanan.",
      fieldErrors: collectFieldErrors(parsed.error),
    };
  }

  const guard = await requireOwner();
  if (!guard.ok) return guard.state;

  const productIds = parsed.data.items.map((item) => item.product_id);
  const { data: productData, error: productError } = await guard.client
    .from("products")
    .select("id, name, unit, sell_price")
    .eq("shop_id", guard.shopId)
    .in("id", productIds);
  if (productError) return { status: "error", message: SAVE_ERROR_MESSAGE };

  const products = new Map((productData as ProductPriceRow[] | null ?? []).map((row) => [row.id, row]));
  const uniqueIds = new Set(productIds);
  if (products.size !== uniqueIds.size) {
    return { status: "error", message: "Satu atau lebih produk tidak ditemukan untuk warung ini." };
  }

  // STEP: Total is computed from trusted product prices in the database, never from the form
  const lines: OrderLine[] = parsed.data.items.map((item) => {
    const product = products.get(item.product_id) as ProductPriceRow;
    return {
      productId: item.product_id,
      productName: product.name,
      unit: product.unit,
      qtyMilli: item.qty,
      unitPrice: toNumber(product.sell_price),
    };
  });
  const total = orderTotal(lines);

  const { data: orderRow, error: orderError } = await guard.client
    .from("orders")
    .insert({ shop_id: guard.shopId, status: "draft", total: total.toString(), payment_status: "pending", source: "dashboard" })
    .select("id")
    .single();
  if (orderError || !orderRow) return { status: "error", message: SAVE_ERROR_MESSAGE };
  const orderId = (orderRow as { id: string }).id;

  const { error: itemError } = await guard.client.from("order_items").insert(
    lines.map((line) => ({
      shop_id: guard.shopId,
      order_id: orderId,
      product_id: line.productId,
      qty: qtyMilliToDecimal(line.qtyMilli),
      unit_price: line.unitPrice,
    })),
  );
  if (itemError) {
    // STEP: Remove the orphan order so the list stays consistent when items fail
    await guard.client.from("orders").delete().eq("shop_id", guard.shopId).eq("id", orderId);
    return { status: "error", message: SAVE_ERROR_MESSAGE };
  }

  refreshOrderViews();
  return { status: "success", message: `Pesanan ${formatRupiah(total)} tersimpan sebagai draft.`, nonce: crypto.randomUUID() };
}

export async function setOrderStatus(_state: OrderActionState, form: FormData): Promise<OrderActionState> {
  const parsed = setOrderStatusSchema.safeParse({
    order_id: form.get("order_id") ?? "",
    status: form.get("status") ?? "",
  });
  if (!parsed.success) return { status: "error", message: "Permintaan perubahan status tidak valid." };

  const guard = await requireOwner();
  if (!guard.ok) return guard.state;

  const { error } = await guard.client.rpc("set_order_status", {
    p_order_id: parsed.data.order_id,
    p_status: parsed.data.status,
  });
  if (error) return { status: "error", message: friendlyOrderErrorMessage(error.message) };

  refreshOrderViews();
  return {
    status: "success",
    message: `Status pesanan diperbarui menjadi ${orderStatusLabel(parsed.data.status).toLowerCase()}.`,
    nonce: crypto.randomUUID(),
  };
}

export async function completeOrder(_state: OrderActionState, form: FormData): Promise<OrderActionState> {
  const parsed = completeOrderSchema.safeParse({ order_id: form.get("order_id") ?? "" });
  if (!parsed.success) return { status: "error", message: "Permintaan penyelesaian tidak valid." };

  const guard = await requireOwner();
  if (!guard.ok) return guard.state;

  const { data, error } = await guard.client.rpc("complete_order", { p_order_id: parsed.data.order_id });
  if (error) return { status: "error", message: friendlyOrderErrorMessage(error.message) };
  if (!data) return { status: "error", message: GENERIC_ORDER_ERROR_MESSAGE };

  refreshOrderViews();
  return {
    status: "success",
    message: "Pesanan selesai. Penjualan tercatat dan stok berkurang.",
    nonce: crypto.randomUUID(),
  };
}
