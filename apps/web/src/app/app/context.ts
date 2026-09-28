import { redirect } from "next/navigation";
import { getIdentity, getMembership } from "@/lib/membership";
import type { SupabaseServerClient } from "@/lib/supabase/server";

export type ShopContext = {
  client: SupabaseServerClient;
  shopId: string;
  shopName: string;
  role: string;
};

export async function loadShopContext(): Promise<ShopContext | null> {
  const { client, authId } = await getIdentity();
  const { membership, error } = await getMembership(client, authId);
  if (error) return null;
  if (!membership) redirect("/onboarding");
  const { data: shop, error: shopError } = await client.from("shops").select("name").eq("id", membership.shop_id).single();
  if (shopError || !shop) return null;
  return { client, shopId: membership.shop_id, shopName: String(shop.name), role: membership.role };
}
