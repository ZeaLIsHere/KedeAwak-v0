import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export async function getIdentity() {
  const client = await createClient();
  if (!client) redirect("/");
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login");
  return { client, authId: data.claims.sub };
}

export async function getMembership(client: NonNullable<Awaited<ReturnType<typeof createClient>>>, authId: string) {
  const { data, error } = await client.from("users").select("shop_id, role").eq("auth_id", authId).limit(1).maybeSingle();
  return { membership: data, error };
}
