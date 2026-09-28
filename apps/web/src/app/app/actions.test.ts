import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/membership", () => ({ getIdentity: vi.fn(), getMembership: vi.fn() }));

import { revalidatePath } from "next/cache";
import { getIdentity, getMembership } from "@/lib/membership";
import { recordCashEntry, type CashEntryState } from "./actions";

const initialState: CashEntryState = { status: "idle", message: "" };

function makeClient() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({ insert }));
  return { client: { from }, from, insert };
}

function buildForm(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function authenticateAsOwner(client: unknown) {
  vi.mocked(getIdentity).mockResolvedValue({ client, authId: "auth-1" } as never);
  vi.mocked(getMembership).mockResolvedValue({ membership: { shop_id: "shop-1", role: "owner" }, error: null } as never);
}

afterEach(() => vi.resetAllMocks());

describe("recordCashEntry", () => {
  it("rejects an invalid amount before touching the database", async () => {
    const { client, from } = makeClient();
    authenticateAsOwner(client);
    const state = await recordCashEntry(initialState, buildForm({ kind: "expense", amount: "0", description: "Belanja", occurred_on: "" }));
    expect(state.status).toBe("error");
    expect(state.fieldErrors?.amount).toBeTruthy();
    expect(from).not.toHaveBeenCalled();
  });

  it("writes an expense using only the shop_id from membership", async () => {
    const { client, from, insert } = makeClient();
    authenticateAsOwner(client);
    const state = await recordCashEntry(
      initialState,
      buildForm({ kind: "expense", amount: "25000", description: "Belanja sayur", occurred_on: "2026-09-28", shop_id: "evil-shop" }),
    );
    expect(state.status).toBe("success");
    expect(from).toHaveBeenCalledWith("expenses");
    expect(insert).toHaveBeenCalledWith({ shop_id: "shop-1", description: "Belanja sayur", amount: 25000, occurred_at: "2026-09-27T17:00:00.000Z" });
    expect(revalidatePath).toHaveBeenCalledWith("/app");
    expect(revalidatePath).toHaveBeenCalledWith("/app/riwayat");
  });

  it("writes income to sales with an integer total and the owner note", async () => {
    const { client, from, insert } = makeClient();
    authenticateAsOwner(client);
    const state = await recordCashEntry(initialState, buildForm({ kind: "income", amount: "42000", description: "Jualan pagi", occurred_on: "" }));
    expect(state.status).toBe("success");
    expect(from).toHaveBeenCalledWith("sales");
    const payload = insert.mock.calls[0][0] as { shop_id: string; total: number; description: string | null; occurred_at: string };
    expect(payload.shop_id).toBe("shop-1");
    expect(payload.total).toBe(42000);
    expect(Number.isInteger(payload.total)).toBe(true);
    expect(payload.description).toBe("Jualan pagi");
    expect(typeof payload.occurred_at).toBe("string");
  });

  it("stores an empty income note as null instead of reusing another column", async () => {
    const { client, insert } = makeClient();
    authenticateAsOwner(client);
    const state = await recordCashEntry(initialState, buildForm({ kind: "income", amount: "42000", description: "   ", occurred_on: "" }));
    expect(state.status).toBe("success");
    expect((insert.mock.calls[0][0] as { description: string | null }).description).toBeNull();
  });

  it("blocks non-owner roles from writing cash entries", async () => {
    const { client, from } = makeClient();
    vi.mocked(getIdentity).mockResolvedValue({ client, authId: "auth-1" } as never);
    vi.mocked(getMembership).mockResolvedValue({ membership: { shop_id: "shop-1", role: "staff" }, error: null } as never);
    const state = await recordCashEntry(initialState, buildForm({ kind: "income", amount: "5000", description: "", occurred_on: "" }));
    expect(state.status).toBe("error");
    expect(from).not.toHaveBeenCalled();
  });

  it("reports a membership lookup error without writing", async () => {
    vi.mocked(getIdentity).mockResolvedValue({ client: {}, authId: "auth-1" } as never);
    vi.mocked(getMembership).mockResolvedValue({ membership: null, error: { message: "boom" } } as never);
    const state = await recordCashEntry(initialState, buildForm({ kind: "income", amount: "5000", description: "", occurred_on: "" }));
    expect(state.status).toBe("error");
    expect(state.message).toContain("belum dapat disimpan");
  });

  it("surfaces a database error from the insert", async () => {
    const { client, insert } = makeClient();
    insert.mockResolvedValueOnce({ error: { message: "rls" } });
    authenticateAsOwner(client);
    const state = await recordCashEntry(initialState, buildForm({ kind: "expense", amount: "5000", description: "Gas", occurred_on: "" }));
    expect(state.status).toBe("error");
  });
});
