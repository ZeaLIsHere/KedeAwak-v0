"use server";

import { revalidatePath } from "next/cache";
import { collectFieldErrors, expenseInputSchema, formatRupiah, incomeInputSchema, resolveOccurredAt } from "@/lib/ledger";
import { getIdentity, getMembership } from "@/lib/membership";

export type CashEntryState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
  nonce?: string;
};

export async function recordCashEntry(_state: CashEntryState, form: FormData): Promise<CashEntryState> {
  const kind = form.get("kind") === "expense" ? "expense" : "income";
  const schema = kind === "expense" ? expenseInputSchema : incomeInputSchema;
  const parsed = schema.safeParse({
    amount: form.get("amount") ?? "",
    description: form.get("description") ?? "",
    occurred_on: form.get("occurred_on") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: "Periksa kembali isian yang ditandai.", fieldErrors: collectFieldErrors(parsed.error) };
  }

  const { client, authId } = await getIdentity();
  const { membership, error } = await getMembership(client, authId);
  if (error) return { status: "error", message: "Catatan belum dapat disimpan. Coba lagi nanti." };
  if (!membership) return { status: "error", message: "Profil warung belum tersedia. Selesaikan langkah awal terlebih dahulu." };
  if (membership.role !== "owner") return { status: "error", message: "Hanya pemilik warung yang dapat mencatat kas." };

  // MARK: shop_id comes from the trusted membership only, never from the form
  const shopId = membership.shop_id;
  const amount = Number(parsed.data.amount);
  const occurredAt = resolveOccurredAt(parsed.data.occurred_on, new Date());

  if (kind === "expense") {
    const { error: insertError } = await client.from("expenses").insert({
      shop_id: shopId,
      description: parsed.data.description,
      amount,
      occurred_at: occurredAt,
    });
    if (insertError) return { status: "error", message: "Uang keluar belum dapat disimpan. Coba lagi nanti." };
  } else {
    const { error: insertError } = await client.from("sales").insert({
      shop_id: shopId,
      total: amount,
      description: parsed.data.description || null,
      occurred_at: occurredAt,
    });
    if (insertError) return { status: "error", message: "Uang masuk belum dapat disimpan. Coba lagi nanti." };
  }

  revalidatePath("/app");
  revalidatePath("/app/riwayat");
  return {
    status: "success",
    message: `${kind === "expense" ? "Uang keluar" : "Uang masuk"} ${formatRupiah(amount)} tersimpan.`,
    nonce: crypto.randomUUID(),
  };
}
