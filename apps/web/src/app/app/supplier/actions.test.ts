import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/membership", () => ({ getIdentity: vi.fn(), getMembership: vi.fn() }));

import { revalidatePath } from "next/cache";
import { getIdentity, getMembership } from "@/lib/membership";
import { createSupplier, deleteSupplier, updateSupplier, type SupplierActionState } from "./actions";

const SUPPLIER_ID = "33333333-3333-4333-8333-333333333333";
const initialState: SupplierActionState = { status: "idle", message: "" };

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

const validCreate = { name: "Toko Beras", wa_phone: "081234567890", products: "Beras, Gula" };

afterEach(() => vi.resetAllMocks());

describe("createSupplier", () => {
  it("rejects an invalid phone before touching the database", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    const state = await createSupplier(initialState, buildForm({ ...validCreate, wa_phone: "0812345" }));
    expect(state.status).toBe("error");
    expect(state.fieldErrors?.wa_phone).toBeTruthy();
    expect(harness.from).not.toHaveBeenCalled();
  });

  it("writes the normalized phone and products with the trusted shop_id", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    const state = await createSupplier(initialState, buildForm({ ...validCreate, shop_id: "evil-shop" }));
    expect(state.status).toBe("success");
    const insert = harness.operations.find((operation) => operation.table === "suppliers" && operation.op === "insert");
    expect(insert?.args[0]).toEqual({ shop_id: "shop-1", name: "Toko Beras", wa_phone: "+6281234567890", products: ["Beras", "Gula"] });
    expect(revalidatePath).toHaveBeenCalledWith("/app/supplier");
    expect(revalidatePath).toHaveBeenCalledWith("/app");
  });

  it("blocks non-owner roles", async () => {
    const harness = makeClient();
    vi.mocked(getIdentity).mockResolvedValue({ client: harness.client, authId: "auth-1" } as never);
    vi.mocked(getMembership).mockResolvedValue({ membership: { shop_id: "shop-1", role: "staff" }, error: null } as never);
    const state = await createSupplier(initialState, buildForm(validCreate));
    expect(state.status).toBe("error");
    expect(harness.from).not.toHaveBeenCalled();
  });
});

describe("updateSupplier", () => {
  it("confirms existence then updates with the trusted shop_id", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    harness.selectResults.set("suppliers", { data: { id: SUPPLIER_ID }, error: null });
    const state = await updateSupplier(initialState, buildForm({ supplier_id: SUPPLIER_ID, ...validCreate, shop_id: "evil-shop" }));
    expect(state.status).toBe("success");
    const update = harness.operations.find((operation) => operation.table === "suppliers" && operation.op === "update");
    expect(update?.args[0]).toEqual({ name: "Toko Beras", wa_phone: "+6281234567890", products: ["Beras", "Gula"] });
    const shopFilter = harness.operations.find((operation) => operation.op === "eq" && operation.args[0] === "shop_id");
    expect(shopFilter?.args[1]).toBe("shop-1");
  });

  it("reports a supplier that does not belong to the shop", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    harness.selectResults.set("suppliers", { data: null, error: null });
    const state = await updateSupplier(initialState, buildForm({ supplier_id: SUPPLIER_ID, ...validCreate }));
    expect(state.status).toBe("error");
    expect(state.message).toContain("tidak ditemukan");
    expect(harness.operations.some((operation) => operation.op === "update")).toBe(false);
  });
});

describe("deleteSupplier", () => {
  it("confirms existence then deletes with the trusted shop_id", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    harness.selectResults.set("suppliers", { data: { id: SUPPLIER_ID, name: "Toko Beras" }, error: null });
    const state = await deleteSupplier(initialState, buildForm({ supplier_id: SUPPLIER_ID, shop_id: "evil-shop" }));
    expect(state.status).toBe("success");
    expect(harness.operations.some((operation) => operation.table === "suppliers" && operation.op === "delete")).toBe(true);
    const shopFilter = harness.operations.find((operation) => operation.op === "eq" && operation.args[0] === "shop_id");
    expect(shopFilter?.args[1]).toBe("shop-1");
  });

  it("rejects an invalid supplier id without touching the database", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    const state = await deleteSupplier(initialState, buildForm({ supplier_id: "not-a-uuid" }));
    expect(state.status).toBe("error");
    expect(harness.from).not.toHaveBeenCalled();
  });
});
