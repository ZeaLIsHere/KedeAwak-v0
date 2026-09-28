"use server";

import { revalidatePath } from "next/cache";
import { collectFieldErrors } from "@/lib/ledger";
import { getIdentity, getMembership } from "@/lib/membership";
import { autoReplySchema, shopProfileSchema, toNullableText } from "@/lib/shop-profile";
import type { SupabaseServerClient } from "@/lib/supabase/server";

export type ShopProfileActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
  nonce?: string;
};

const MEMBERSHIP_ERROR_MESSAGE = "Data warung belum dapat dimuat. Coba lagi nanti.";
const PROFILE_MISSING_MESSAGE = "Profil warung belum tersedia. Selesaikan langkah awal terlebih dahulu.";
const OWNER_ONLY_MESSAGE = "Hanya pemilik warung yang dapat mengubah pengaturan.";
const SAVE_ERROR_MESSAGE = "Perubahan belum dapat disimpan. Coba lagi nanti.";

type OwnerGuard =
  | { ok: true; client: SupabaseServerClient; shopId: string }
  | { ok: false; state: ShopProfileActionState };

// MARK: shop_id and role come from the trusted membership only, never from the form
async function requireOwner(): Promise<OwnerGuard> {
  const { client, authId } = await getIdentity();
  const { membership, error } = await getMembership(client, authId);
  if (error) return { ok: false, state: { status: "error", message: MEMBERSHIP_ERROR_MESSAGE } };
  if (!membership) return { ok: false, state: { status: "error", message: PROFILE_MISSING_MESSAGE } };
  if (membership.role !== "owner") return { ok: false, state: { status: "error", message: OWNER_ONLY_MESSAGE } };
  return { ok: true, client, shopId: membership.shop_id };
}

function refreshSettingsViews() {
  revalidatePath("/app/pengaturan");
  revalidatePath("/app");
}

export async function updateShopProfile(_state: ShopProfileActionState, form: FormData): Promise<ShopProfileActionState> {
  const parsed = shopProfileSchema.safeParse({
    name: form.get("name") ?? "",
    business_type: form.get("business_type") ?? "",
    opening_hours: form.get("opening_hours") ?? "",
    address: form.get("address") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: "Periksa kembali isian yang ditandai.", fieldErrors: collectFieldErrors(parsed.error) };
  }

  const guard = await requireOwner();
  if (!guard.ok) return guard.state;

  // NOTE: wa_phone_number_id and plan are never written from the client
  const { error } = await guard.client
    .from("shops")
    .update({
      name: parsed.data.name,
      business_type: parsed.data.business_type,
      opening_hours: toNullableText(parsed.data.opening_hours),
      address: toNullableText(parsed.data.address),
    })
    .eq("id", guard.shopId);
  if (error) return { status: "error", message: SAVE_ERROR_MESSAGE };

  refreshSettingsViews();
  return { status: "success", message: "Profil warung tersimpan.", nonce: crypto.randomUUID() };
}

export async function toggleAutoReply(_state: ShopProfileActionState, form: FormData): Promise<ShopProfileActionState> {
  const parsed = autoReplySchema.safeParse({ enabled: form.get("enabled") ?? false });
  if (!parsed.success) return { status: "error", message: "Pilihan balasan otomatis tidak valid." };

  const guard = await requireOwner();
  if (!guard.ok) return guard.state;

  const { error } = await guard.client.from("shops").update({ auto_reply_enabled: parsed.data.enabled }).eq("id", guard.shopId);
  if (error) return { status: "error", message: SAVE_ERROR_MESSAGE };

  refreshSettingsViews();
  return {
    status: "success",
    message: parsed.data.enabled ? "Balasan otomatis ditandai aktif di pengaturan." : "Balasan otomatis ditandai nonaktif.",
    nonce: crypto.randomUUID(),
  };
}
