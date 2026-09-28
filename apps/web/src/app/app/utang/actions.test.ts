import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/membership", () => ({ getIdentity: vi.fn(), getMembership: vi.fn() }));

import { revalidatePath } from "next/cache";
import { getIdentity, getMembership } from "@/lib/membership";
import { createDebt, deleteDebt, recordDebtRepayment, type DebtActionState } from "./actions";

const DEBT_ID = "22222222-2222-4222-8222-222222222222";
const initialState: DebtActionState = { status: "idle", message: "" };

type QueryResult = { data?: unknown; error?: unknown };
type Operation = { table: string; op: string; args: unknown[] };

function makeClient() {
  const selectResults = new Map<string, QueryResult>();
  const insertResults = new Map<string, QueryResult>();
  const updateResults = new Map<string, QueryResult>();
  const deleteResults = new Map<string, QueryResult>();
  const operations: Operation[] = [];
  const from = vi.fn((table: string) => {
    let mutation: "update" | "delete" | null = null;
    const builder: Record<string, unknown> = {};
    const chain = (op: string) =>
      vi.fn((...args: unknown[]) => {
        operations.push({ table, op, args });
        return builder;
      });
    builder.select = chain("select");
    builder.eq = chain("eq");
    builder.order = chain("order");
    builder.limit = chain("limit");
    builder.update = vi.fn((...args: unknown[]) => {
      mutation = "update";
      operations.push({ table, op: "update", args });
      return builder;
    });
    builder.delete = vi.fn((...args: unknown[]) => {
      mutation = "delete";
      operations.push({ table, op: "delete", args });
      return builder;
    });
    builder.single = vi.fn(() => Promise.resolve(selectResults.get(table) ?? { data: null, error: null }));
    builder.maybeSingle = vi.fn(() => Promise.resolve(selectResults.get(table) ?? { data: null, error: null }));
    builder.insert = vi.fn((...args: unknown[]) => {
      operations.push({ table, op: "insert", args });
      return Promise.resolve(insertResults.get(table) ?? { data: null, error: null });
    });
    builder.then = (resolve: (value: QueryResult) => unknown) => {
      const result =
        mutation === "update" ? updateResults.get(table) : mutation === "delete" ? deleteResults.get(table) : selectResults.get(table);
      return Promise.resolve(result ?? { data: null, error: null }).then(resolve);
    };
    return builder;
  });
  return { client: { from }, from, operations, selectResults, insertResults, updateResults, deleteResults };
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

const validCreate = { party_type: "customer", party_name: "Bu Sari", amount: "50000", due_date: "" };

afterEach(() => vi.resetAllMocks());

describe("createDebt", () => {
  it("rejects invalid input before touching the database", async () => {
    const { client, from } = makeClient();
    authenticateAsOwner(client);
    const state = await createDebt(initialState, buildForm({ ...validCreate, amount: "0" }));
    expect(state.status).toBe("error");
    expect(state.fieldErrors?.amount).toBeTruthy();
    expect(from).not.toHaveBeenCalled();
  });

  it("writes with the trusted shop_id and an outstanding status, ignoring form shop_id", async () => {
    const { client, operations } = makeClient();
    authenticateAsOwner(client);
    const state = await createDebt(initialState, buildForm({ ...validCreate, shop_id: "evil-shop" }));
    expect(state.status).toBe("success");
    const insert = operations.find((operation) => operation.table === "debts" && operation.op === "insert");
    expect(insert?.args[0]).toEqual({
      shop_id: "shop-1",
      party_type: "customer",
      party_name: "Bu Sari",
      amount: 50000,
      paid_amount: 0,
      due_date: null,
      status: "outstanding",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/app/utang");
    expect(revalidatePath).toHaveBeenCalledWith("/app");
  });

  it("blocks non-owner roles", async () => {
    const { client, from } = makeClient();
    vi.mocked(getIdentity).mockResolvedValue({ client, authId: "auth-1" } as never);
    vi.mocked(getMembership).mockResolvedValue({ membership: { shop_id: "shop-1", role: "staff" }, error: null } as never);
    const state = await createDebt(initialState, buildForm(validCreate));
    expect(state.status).toBe("error");
    expect(from).not.toHaveBeenCalled();
  });

  it("surfaces a database error from the insert", async () => {
    const { client, insertResults } = makeClient();
    authenticateAsOwner(client);
    insertResults.set("debts", { data: null, error: { message: "rls" } });
    const state = await createDebt(initialState, buildForm(validCreate));
    expect(state.status).toBe("error");
  });
});

describe("recordDebtRepayment", () => {
  function seedDebt(client: ReturnType<typeof makeClient>, amount: string, paidAmount: string) {
    client.selectResults.set("debts", { data: { id: DEBT_ID, party_name: "Bu Sari", amount, paid_amount: paidAmount }, error: null });
    client.updateResults.set("debts", { data: [{ id: DEBT_ID }], error: null });
  }

  it("records a partial repayment and lets the code set status partial", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    seedDebt(harness, "100000", "0");

    const state = await recordDebtRepayment(initialState, buildForm({ debt_id: DEBT_ID, amount: "40000" }));

    expect(state.status).toBe("success");
    const update = harness.operations.find((operation) => operation.table === "debts" && operation.op === "update");
    expect(update?.args[0]).toEqual({ paid_amount: 40000, status: "partial" });
    const shopFilter = harness.operations.find((operation) => operation.op === "eq" && operation.args[0] === "shop_id");
    expect(shopFilter?.args[1]).toBe("shop-1");
    const guard = harness.operations.find((operation) => operation.op === "eq" && operation.args[0] === "paid_amount");
    expect(guard?.args[1]).toBe(0);
    expect(state.message).toContain("Sisa hutang");
    expect(revalidatePath).toHaveBeenCalledWith("/app/utang");
  });

  it("marks the debt paid when the repayment covers the remaining balance", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    seedDebt(harness, "100000", "40000");

    const state = await recordDebtRepayment(initialState, buildForm({ debt_id: DEBT_ID, amount: "60000" }));

    expect(state.status).toBe("success");
    const update = harness.operations.find((operation) => operation.table === "debts" && operation.op === "update");
    expect(update?.args[0]).toEqual({ paid_amount: 100000, status: "paid" });
    expect(state.message).toContain("lunas");
  });

  it("rejects a repayment larger than the remaining balance without updating", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    seedDebt(harness, "100000", "90000");

    const state = await recordDebtRepayment(initialState, buildForm({ debt_id: DEBT_ID, amount: "10001" }));

    expect(state.status).toBe("error");
    expect(state.message).toContain("melebihi sisa hutang");
    expect(harness.operations.some((operation) => operation.table === "debts" && operation.op === "update")).toBe(false);
  });

  it("rejects a zero or negative repayment at the schema level", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    seedDebt(harness, "100000", "0");
    for (const amount of ["0", "-5000"]) {
      const state = await recordDebtRepayment(initialState, buildForm({ debt_id: DEBT_ID, amount }));
      expect(state.status, amount).toBe("error");
      expect(state.fieldErrors?.amount).toBeTruthy();
    }
    expect(harness.operations.some((operation) => operation.table === "debts" && operation.op === "update")).toBe(false);
  });

  it("reports a debt that does not belong to the shop", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    harness.selectResults.set("debts", { data: null, error: null });
    const state = await recordDebtRepayment(initialState, buildForm({ debt_id: DEBT_ID, amount: "10000" }));
    expect(state.status).toBe("error");
    expect(state.message).toContain("tidak ditemukan");
  });

  it("warns when the balance changed before the update", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    harness.selectResults.set("debts", { data: { id: DEBT_ID, party_name: "Bu Sari", amount: "100000", paid_amount: "0" }, error: null });
    harness.updateResults.set("debts", { data: [], error: null });
    const state = await recordDebtRepayment(initialState, buildForm({ debt_id: DEBT_ID, amount: "10000" }));
    expect(state.status).toBe("error");
    expect(state.message).toContain("berubah");
  });
});

describe("deleteDebt", () => {
  it("confirms existence then deletes with the trusted shop_id", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    harness.selectResults.set("debts", { data: { id: DEBT_ID, party_name: "Bu Sari" }, error: null });
    const state = await deleteDebt(initialState, buildForm({ debt_id: DEBT_ID, shop_id: "evil-shop" }));
    expect(state.status).toBe("success");
    expect(harness.operations.some((operation) => operation.table === "debts" && operation.op === "delete")).toBe(true);
    const shopFilter = harness.operations.find((operation) => operation.op === "eq" && operation.args[0] === "shop_id");
    expect(shopFilter?.args[1]).toBe("shop-1");
  });

  it("rejects an invalid debt id without touching the database", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    const state = await deleteDebt(initialState, buildForm({ debt_id: "not-a-uuid" }));
    expect(state.status).toBe("error");
    expect(harness.from).not.toHaveBeenCalled();
  });
});
