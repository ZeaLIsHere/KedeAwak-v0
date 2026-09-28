"use server";

import { revalidatePath } from "next/cache";
import {
  createDebtSchema,
  deleteDebtSchema,
  planRepayment,
  recordRepaymentSchema,
  toRupiahValue,
} from "@/lib/debts";
import { collectFieldErrors, formatRupiah } from "@/lib/ledger";
import { getIdentity, getMembership } from "@/lib/membership";
import type { SupabaseServerClient } from "@/lib/supabase/server";

export type DebtActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
  nonce?: string;
};

const MEMBERSHIP_ERROR_MESSAGE = "Data warung belum dapat dimuat. Coba lagi nanti.";
const PROFILE_MISSING_MESSAGE = "Profil warung belum tersedia. Selesaikan langkah awal terlebih dahulu.";
const OWNER_ONLY_MESSAGE = "Hanya pemilik warung yang dapat mengelola hutang.";
const SAVE_ERROR_MESSAGE = "Perubahan belum dapat disimpan. Coba lagi nanti.";
const NOT_FOUND_MESSAGE = "Hutang tidak ditemukan untuk warung ini.";
const STALE_BALANCE_MESSAGE = "Saldo hutang sudah berubah. Muat ulang halaman lalu coba lagi.";

type OwnerGuard =
  | { ok: true; client: SupabaseServerClient; shopId: string }
  | { ok: false; state: DebtActionState };

// MARK: shop_id and role come from the trusted membership only, never from the form
async function requireOwner(): Promise<OwnerGuard> {
  const { client, authId } = await getIdentity();
  const { membership, error } = await getMembership(client, authId);
  if (error) return { ok: false, state: { status: "error", message: MEMBERSHIP_ERROR_MESSAGE } };
  if (!membership) return { ok: false, state: { status: "error", message: PROFILE_MISSING_MESSAGE } };
  if (membership.role !== "owner") return { ok: false, state: { status: "error", message: OWNER_ONLY_MESSAGE } };
  return { ok: true, client, shopId: membership.shop_id };
}

function refreshDebtViews() {
  revalidatePath("/app/utang");
  revalidatePath("/app");
}

type DebtBalanceRow = { id: string; party_name: string; amount: number | string | null; paid_amount: number | string | null };
type DebtNameRow = { party_name: string };

export async function createDebt(_state: DebtActionState, form: FormData): Promise<DebtActionState> {
  const parsed = createDebtSchema.safeParse({
    party_type: form.get("party_type") ?? "",
    party_name: form.get("party_name") ?? "",
    amount: form.get("amount") ?? "",
    due_date: form.get("due_date") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: "Periksa kembali isian yang ditandai.", fieldErrors: collectFieldErrors(parsed.error) };
  }

  const guard = await requireOwner();
  if (!guard.ok) return guard.state;

  const { error } = await guard.client.from("debts").insert({
    shop_id: guard.shopId,
    party_type: parsed.data.party_type,
    party_name: parsed.data.party_name,
    amount: parsed.data.amount,
    paid_amount: 0,
    due_date: parsed.data.due_date || null,
    status: "outstanding",
  });
  if (error) return { status: "error", message: SAVE_ERROR_MESSAGE };

  refreshDebtViews();
  return {
    status: "success",
    message: `Hutang ${parsed.data.party_name} ${formatRupiah(parsed.data.amount)} tersimpan.`,
    nonce: crypto.randomUUID(),
  };
}

export async function recordDebtRepayment(_state: DebtActionState, form: FormData): Promise<DebtActionState> {
  const parsed = recordRepaymentSchema.safeParse({
    debt_id: form.get("debt_id") ?? "",
    amount: form.get("amount") ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: "Periksa kembali isian yang ditandai.", fieldErrors: collectFieldErrors(parsed.error) };
  }

  const guard = await requireOwner();
  if (!guard.ok) return guard.state;

  const { data, error: readError } = await guard.client
    .from("debts")
    .select("id, party_name, amount, paid_amount")
    .eq("shop_id", guard.shopId)
    .eq("id", parsed.data.debt_id)
    .maybeSingle();
  if (readError) return { status: "error", message: SAVE_ERROR_MESSAGE };
  if (!data) return { status: "error", message: NOT_FOUND_MESSAGE };
  const debt = data as DebtBalanceRow;

  const paidAmount = toRupiahValue(debt.paid_amount);
  // STEP: Remaining balance and status are computed in code, never typed by the user
  const repayment = planRepayment(toRupiahValue(debt.amount), paidAmount, parsed.data.amount);
  if (!repayment.ok) return { status: "error", message: repayment.message };

  const { data: updated, error: updateError } = await guard.client
    .from("debts")
    .update({ paid_amount: repayment.plan.paidAmount, status: repayment.plan.status })
    .eq("shop_id", guard.shopId)
    .eq("id", parsed.data.debt_id)
    .eq("paid_amount", paidAmount)
    .select("id");
  if (updateError) return { status: "error", message: SAVE_ERROR_MESSAGE };
  if (!updated || (updated as unknown[]).length === 0) return { status: "error", message: STALE_BALANCE_MESSAGE };

  refreshDebtViews();
  const remainingMessage = repayment.plan.remaining === 0 ? "Hutang lunas." : `Sisa hutang ${formatRupiah(repayment.plan.remaining)}.`;
  return {
    status: "success",
    message: `Pelunasan ${formatRupiah(parsed.data.amount)} tercatat. ${remainingMessage}`,
    nonce: crypto.randomUUID(),
  };
}

export async function deleteDebt(_state: DebtActionState, form: FormData): Promise<DebtActionState> {
  const parsed = deleteDebtSchema.safeParse({ debt_id: form.get("debt_id") ?? "" });
  if (!parsed.success) return { status: "error", message: "Hutang tidak valid." };

  const guard = await requireOwner();
  if (!guard.ok) return guard.state;

  const { data, error: readError } = await guard.client
    .from("debts")
    .select("id, party_name")
    .eq("shop_id", guard.shopId)
    .eq("id", parsed.data.debt_id)
    .maybeSingle();
  if (readError) return { status: "error", message: SAVE_ERROR_MESSAGE };
  if (!data) return { status: "error", message: NOT_FOUND_MESSAGE };

  const { error: deleteError } = await guard.client
    .from("debts")
    .delete()
    .eq("shop_id", guard.shopId)
    .eq("id", parsed.data.debt_id);
  if (deleteError) return { status: "error", message: SAVE_ERROR_MESSAGE };

  refreshDebtViews();
  return { status: "success", message: `Hutang ${(data as DebtNameRow).party_name} dihapus.`, nonce: crypto.randomUUID() };
}
