"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getIdentity, getMembership } from "@/lib/membership";

export type WhatsAppNumberState = { status: "idle" | "success" | "error"; message: string };

export const whatsappNumberSchema = z.object({
  phone_number_id: z
    .string()
    .trim()
    .refine((value) => value === "" || /^[0-9]{5,32}$/.test(value), "Gunakan ID angka dari Meta, tanpa spasi."),
});

export async function saveWhatsAppNumber(_state: WhatsAppNumberState, form: FormData): Promise<WhatsAppNumberState> {
  const parsed = whatsappNumberSchema.safeParse({ phone_number_id: form.get("phone_number_id") ?? "" });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Periksa kembali ID nomor bisnis." };
  }

  const { client, authId } = await getIdentity();
  const { membership, error } = await getMembership(client, authId);
  if (error) return { status: "error", message: "Nomor belum dapat disimpan. Coba lagi nanti." };
  if (!membership) return { status: "error", message: "Profil warung belum tersedia." };
  if (membership.role !== "owner") return { status: "error", message: "Hanya pemilik warung yang dapat mengubah nomor bisnis." };

  // MARK: shop_id comes from the trusted membership only, never from the form
  const { error: updateError } = await client
    .from("shops")
    .update({ wa_phone_number_id: parsed.data.phone_number_id === "" ? null : parsed.data.phone_number_id })
    .eq("id", membership.shop_id);
  if (updateError) return { status: "error", message: "Nomor belum dapat disimpan. Pastikan ID belum dipakai warung lain." };

  revalidatePath("/app/whatsapp");
  revalidatePath("/app");
  return {
    status: "success",
    message: parsed.data.phone_number_id === "" ? "Nomor bisnis dilepas dari warung ini." : "Nomor bisnis tersimpan.",
  };
}
