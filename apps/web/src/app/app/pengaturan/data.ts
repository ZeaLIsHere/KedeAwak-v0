import { mapShopProfileRow, type ShopProfile, type ShopProfileRow } from "@/lib/shop-profile";
import type { SupabaseServerClient } from "@/lib/supabase/server";

const SHOP_PROFILE_COLUMNS = "id, name, business_type, opening_hours, address, wa_phone_number_id, plan, auto_reply_enabled";

// MARK: shop_id comes from the trusted membership only, never from the client
export async function getShopProfile(client: SupabaseServerClient, shopId: string) {
  const { data, error } = await client.from("shops").select(SHOP_PROFILE_COLUMNS).eq("id", shopId).single();
  if (error || !data) return { profile: null, error: true } as const;
  return { profile: mapShopProfileRow(data as ShopProfileRow), error: false } as const;
}

export type OwnerContact = { name: string; phone: string };

type OwnerContactRow = { name: string; phone: string };

export async function getOwnerContact(client: SupabaseServerClient, shopId: string) {
  const { data, error } = await client
    .from("users")
    .select("name, phone")
    .eq("shop_id", shopId)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return { contact: null, error: false } as const;
  const row = data as OwnerContactRow;
  return { contact: { name: row.name, phone: row.phone } as OwnerContact, error: false } as const;
}

export type { ShopProfile };
