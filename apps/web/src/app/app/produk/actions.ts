"use server";

import { revalidatePath } from "next/cache";
import { collectFieldErrors } from "@/lib/ledger";
import {
  adjustStockSchema,
  createProductSchema,
  deleteProductSchema,
  toNumber,
  updateMinStockSchema,
} from "@/lib/inventory";
import { getIdentity, getMembership } from "@/lib/membership";
import type { SupabaseServerClient } from "@/lib/supabase/server";

export type ProductActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
  nonce?: string;
};

const MEMBERSHIP_ERROR_MESSAGE = "Data warung belum dapat dimuat. Coba lagi nanti.";
const PROFILE_MISSING_MESSAGE = "Profil warung belum tersedia. Selesaikan langkah awal terlebih dahulu.";
const OWNER_ONLY_MESSAGE = "Hanya pemilik warung yang dapat mengubah produk.";
const SAVE_ERROR_MESSAGE = "Perubahan belum dapat disimpan. Coba lagi nanti.";
const NOT_FOUND_MESSAGE = "Produk tidak ditemukan untuk warung ini.";

type OwnerGuard =
  | { ok: true; client: SupabaseServerClient; shopId: string; actor: string }
  | { ok: false; state: ProductActionState };

// MARK: shop_id and role come from the trusted membership only, never from the form
async function requireOwner(): Promise<OwnerGuard> {
  const { client, authId } = await getIdentity();
  const { membership, error } = await getMembership(client, authId);
  if (error) return { ok: false, state: { status: "error", message: MEMBERSHIP_ERROR_MESSAGE } };
  if (!membership) return { ok: false, state: { status: "error", message: PROFILE_MISSING_MESSAGE } };
  if (membership.role !== "owner") return { ok: false, state: { status: "error", message: OWNER_ONLY_MESSAGE } };
  return { ok: true, client, shopId: membership.shop_id, actor: authId };
}

function refreshProductViews() {
  revalidatePath("/app/produk");
  revalidatePath("/app");
}

export async function createProduct(_state: ProductActionState, form: FormData): Promise<ProductActionState> {
  const parsed = createProductSchema.safeParse({
    name: form.get("name") ?? "",
    unit: form.get("unit") ?? "",
    sell_price: form.get("sell_price") ?? "",
    buy_price: form.get("buy_price") ?? "",
    stock_qty: form.get("stock_qty") ?? "",
    min_stock: form.get("min_stock") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: "Periksa kembali isian yang ditandai.", fieldErrors: collectFieldErrors(parsed.error) };
  }

  const guard = await requireOwner();
  if (!guard.ok) return guard.state;

  const { error } = await guard.client.from("products").insert({
    shop_id: guard.shopId,
    name: parsed.data.name,
    unit: parsed.data.unit,
    sell_price: parsed.data.sell_price,
    buy_price: parsed.data.buy_price,
    stock_qty: parsed.data.stock_qty,
    min_stock: parsed.data.min_stock,
  });
  if (error) return { status: "error", message: SAVE_ERROR_MESSAGE };

  refreshProductViews();
  return { status: "success", message: `Produk ${parsed.data.name} tersimpan.`, nonce: crypto.randomUUID() };
}

export async function adjustStock(_state: ProductActionState, form: FormData): Promise<ProductActionState> {
  const parsed = adjustStockSchema.safeParse({
    product_id: form.get("product_id") ?? "",
    stock_qty: form.get("stock_qty") ?? "",
    reason: form.get("reason") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: "Periksa kembali isian yang ditandai.", fieldErrors: collectFieldErrors(parsed.error) };
  }

  const guard = await requireOwner();
  if (!guard.ok) return guard.state;
  const { client, shopId, actor } = guard;

  const { data: product, error: readError } = await client
    .from("products")
    .select("stock_qty, min_stock")
    .eq("shop_id", shopId)
    .eq("id", parsed.data.product_id)
    .maybeSingle();
  if (readError) return { status: "error", message: SAVE_ERROR_MESSAGE };
  if (!product) return { status: "error", message: NOT_FOUND_MESSAGE };

  // STEP: Record the reason in the audit trail before mutating stock
  const { error: auditError } = await client.from("audit_logs").insert({
    shop_id: shopId,
    entity: "product",
    entity_id: parsed.data.product_id,
    action: "stock_adjustment",
    old_value: { stock_qty: toNumber(product.stock_qty), min_stock: toNumber(product.min_stock) },
    new_value: { stock_qty: parsed.data.stock_qty, reason: parsed.data.reason },
    actor,
  });
  if (auditError) return { status: "error", message: "Alasan penyesuaian belum dapat dicatat. Stok tidak diubah." };

  const { error: updateError } = await client
    .from("products")
    .update({ stock_qty: parsed.data.stock_qty })
    .eq("shop_id", shopId)
    .eq("id", parsed.data.product_id);
  if (updateError) return { status: "error", message: SAVE_ERROR_MESSAGE };

  refreshProductViews();
  return { status: "success", message: "Stok diperbarui dan alasan tercatat.", nonce: crypto.randomUUID() };
}

export async function updateMinStock(_state: ProductActionState, form: FormData): Promise<ProductActionState> {
  const parsed = updateMinStockSchema.safeParse({
    product_id: form.get("product_id") ?? "",
    min_stock: form.get("min_stock") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: "Periksa kembali isian yang ditandai.", fieldErrors: collectFieldErrors(parsed.error) };
  }

  const guard = await requireOwner();
  if (!guard.ok) return guard.state;

  const { error } = await guard.client
    .from("products")
    .update({ min_stock: parsed.data.min_stock })
    .eq("shop_id", guard.shopId)
    .eq("id", parsed.data.product_id);
  if (error) return { status: "error", message: SAVE_ERROR_MESSAGE };

  refreshProductViews();
  return { status: "success", message: "Ambang minimum diperbarui.", nonce: crypto.randomUUID() };
}

export async function deleteProduct(_state: ProductActionState, form: FormData): Promise<ProductActionState> {
  const parsed = deleteProductSchema.safeParse({ product_id: form.get("product_id") ?? "" });
  if (!parsed.success) return { status: "error", message: "Produk tidak valid." };

  const guard = await requireOwner();
  if (!guard.ok) return guard.state;

  const { data: product, error: readError } = await guard.client
    .from("products")
    .select("name")
    .eq("shop_id", guard.shopId)
    .eq("id", parsed.data.product_id)
    .maybeSingle();
  if (readError) return { status: "error", message: SAVE_ERROR_MESSAGE };
  if (!product) return { status: "error", message: NOT_FOUND_MESSAGE };

  const { error: deleteError } = await guard.client
    .from("products")
    .delete()
    .eq("shop_id", guard.shopId)
    .eq("id", parsed.data.product_id);
  if (deleteError) return { status: "error", message: SAVE_ERROR_MESSAGE };

  refreshProductViews();
  return { status: "success", message: "Produk dihapus.", nonce: crypto.randomUUID() };
}
