"use server";

import { revalidatePath } from "next/cache";
import { collectFieldErrors } from "@/lib/ledger";
import { getIdentity, getMembership } from "@/lib/membership";
import { createSupplierSchema, deleteSupplierSchema, updateSupplierSchema } from "@/lib/suppliers";
import type { SupabaseServerClient } from "@/lib/supabase/server";

export type SupplierActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
  nonce?: string;
};

const MEMBERSHIP_ERROR_MESSAGE = "Data warung belum dapat dimuat. Coba lagi nanti.";
const PROFILE_MISSING_MESSAGE = "Profil warung belum tersedia. Selesaikan langkah awal terlebih dahulu.";
const OWNER_ONLY_MESSAGE = "Hanya pemilik warung yang dapat mengelola supplier.";
const SAVE_ERROR_MESSAGE = "Perubahan belum dapat disimpan. Coba lagi nanti.";
const NOT_FOUND_MESSAGE = "Supplier tidak ditemukan untuk warung ini.";

type OwnerGuard =
  | { ok: true; client: SupabaseServerClient; shopId: string }
  | { ok: false; state: SupplierActionState };

// MARK: shop_id and role come from the trusted membership only, never from the form
async function requireOwner(): Promise<OwnerGuard> {
  const { client, authId } = await getIdentity();
  const { membership, error } = await getMembership(client, authId);
  if (error) return { ok: false, state: { status: "error", message: MEMBERSHIP_ERROR_MESSAGE } };
  if (!membership) return { ok: false, state: { status: "error", message: PROFILE_MISSING_MESSAGE } };
  if (membership.role !== "owner") return { ok: false, state: { status: "error", message: OWNER_ONLY_MESSAGE } };
  return { ok: true, client, shopId: membership.shop_id };
}

function refreshSupplierViews() {
  revalidatePath("/app/supplier");
  revalidatePath("/app");
}

export async function createSupplier(_state: SupplierActionState, form: FormData): Promise<SupplierActionState> {
  const parsed = createSupplierSchema.safeParse({
    name: form.get("name") ?? "",
    wa_phone: form.get("wa_phone") ?? "",
    products: form.get("products") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: "Periksa kembali isian yang ditandai.", fieldErrors: collectFieldErrors(parsed.error) };
  }

  const guard = await requireOwner();
  if (!guard.ok) return guard.state;

  const { error } = await guard.client.from("suppliers").insert({
    shop_id: guard.shopId,
    name: parsed.data.name,
    wa_phone: parsed.data.wa_phone,
    products: parsed.data.products,
  });
  if (error) return { status: "error", message: SAVE_ERROR_MESSAGE };

  refreshSupplierViews();
  return { status: "success", message: `Supplier ${parsed.data.name} tersimpan.`, nonce: crypto.randomUUID() };
}

export async function updateSupplier(_state: SupplierActionState, form: FormData): Promise<SupplierActionState> {
  const parsed = updateSupplierSchema.safeParse({
    supplier_id: form.get("supplier_id") ?? "",
    name: form.get("name") ?? "",
    wa_phone: form.get("wa_phone") ?? "",
    products: form.get("products") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: "Periksa kembali isian yang ditandai.", fieldErrors: collectFieldErrors(parsed.error) };
  }

  const guard = await requireOwner();
  if (!guard.ok) return guard.state;

  const { data, error: readError } = await guard.client
    .from("suppliers")
    .select("id")
    .eq("shop_id", guard.shopId)
    .eq("id", parsed.data.supplier_id)
    .maybeSingle();
  if (readError) return { status: "error", message: SAVE_ERROR_MESSAGE };
  if (!data) return { status: "error", message: NOT_FOUND_MESSAGE };

  const { error: updateError } = await guard.client
    .from("suppliers")
    .update({ name: parsed.data.name, wa_phone: parsed.data.wa_phone, products: parsed.data.products })
    .eq("shop_id", guard.shopId)
    .eq("id", parsed.data.supplier_id);
  if (updateError) return { status: "error", message: SAVE_ERROR_MESSAGE };

  refreshSupplierViews();
  return { status: "success", message: `Data supplier ${parsed.data.name} diperbarui.`, nonce: crypto.randomUUID() };
}

export async function deleteSupplier(_state: SupplierActionState, form: FormData): Promise<SupplierActionState> {
  const parsed = deleteSupplierSchema.safeParse({ supplier_id: form.get("supplier_id") ?? "" });
  if (!parsed.success) return { status: "error", message: "Supplier tidak valid." };

  const guard = await requireOwner();
  if (!guard.ok) return guard.state;

  const { data, error: readError } = await guard.client
    .from("suppliers")
    .select("id, name")
    .eq("shop_id", guard.shopId)
    .eq("id", parsed.data.supplier_id)
    .maybeSingle();
  if (readError) return { status: "error", message: SAVE_ERROR_MESSAGE };
  if (!data) return { status: "error", message: NOT_FOUND_MESSAGE };

  const { error: deleteError } = await guard.client
    .from("suppliers")
    .delete()
    .eq("shop_id", guard.shopId)
    .eq("id", parsed.data.supplier_id);
  if (deleteError) return { status: "error", message: SAVE_ERROR_MESSAGE };

  refreshSupplierViews();
  return { status: "success", message: `Supplier ${(data as { name: string }).name} dihapus.`, nonce: crypto.randomUUID() };
}
