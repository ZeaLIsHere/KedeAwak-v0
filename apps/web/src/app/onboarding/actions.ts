"use server";

import { redirect } from "next/navigation";
import { shopSchema } from "@/lib/auth-schema";
import { getIdentity, getMembership } from "@/lib/membership";

export type OnboardingState = { message: string };

export async function createShop(_state: OnboardingState, form: FormData): Promise<OnboardingState> {
  const { client, authId } = await getIdentity();
  const { membership, error: membershipError } = await getMembership(client, authId);
  if (membershipError) return { message: "Profil belum dapat diperiksa. Coba lagi nanti." };
  if (membership) redirect("/app");
  const parsed = shopSchema.safeParse({
    shop_name: form.get("shop_name"),
    shop_business_type: form.get("shop_business_type"),
    owner_name: form.get("owner_name"),
    owner_phone: form.get("owner_phone"),
  });
  if (!parsed.success) return { message: "Periksa semua isian. Nomor telepon harus diawali + dan kode negara, misalnya +6281234567890." };
  const { error } = await client.rpc("create_shop", parsed.data);
  if (error) return { message: "Profil belum dapat disimpan. Coba lagi nanti." };
  redirect("/app");
}
