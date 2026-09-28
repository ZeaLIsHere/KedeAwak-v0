import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/membership", () => ({ getIdentity: vi.fn(), getMembership: vi.fn() }));

import { revalidatePath } from "next/cache";
import { getIdentity, getMembership } from "@/lib/membership";
import { adjustStock, createProduct, deleteProduct, updateMinStock, type ProductActionState } from "./actions";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const initialState: ProductActionState = { status: "idle", message: "" };

type QueryResult = { data?: unknown; error?: unknown };
type Operation = { table: string; op: string; args: unknown[] };

function makeClient() {
  const results = new Map<string, QueryResult>();
  const operations: Operation[] = [];
  const from = vi.fn((table: string) => {
    const getResult = () => results.get(table) ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    for (const op of ["select", "eq", "update", "delete", "order", "limit"]) {
      builder[op] = vi.fn((...args: unknown[]) => {
        operations.push({ table, op, args });
        return builder;
      });
    }
    builder.insert = vi.fn((...args: unknown[]) => {
      operations.push({ table, op: "insert", args });
      return Promise.resolve(getResult());
    });
    builder.single = vi.fn(() => Promise.resolve(getResult()));
    builder.maybeSingle = vi.fn(() => Promise.resolve(getResult()));
    builder.then = (resolve: (value: QueryResult) => unknown) => Promise.resolve(getResult()).then(resolve);
    return builder;
  });
  return { client: { from }, from, results, operations };
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

const validCreate = { name: "Gula", unit: "kg", sell_price: "15000", buy_price: "12000", stock_qty: "10", min_stock: "3" };

afterEach(() => vi.resetAllMocks());

describe("createProduct", () => {
  it("rejects invalid input before touching the database", async () => {
    const { client, from } = makeClient();
    authenticateAsOwner(client);
    const state = await createProduct(initialState, buildForm({ ...validCreate, name: "  " }));
    expect(state.status).toBe("error");
    expect(state.fieldErrors?.name).toBeTruthy();
    expect(from).not.toHaveBeenCalled();
  });

  it("writes with the trusted shop_id and integer prices, ignoring form shop_id", async () => {
    const { client, results, operations } = makeClient();
    authenticateAsOwner(client);
    results.set("products", { data: null, error: null });
    const state = await createProduct(initialState, buildForm({ ...validCreate, shop_id: "evil-shop" }));
    expect(state.status).toBe("success");
    const insert = operations.find((operation) => operation.table === "products" && operation.op === "insert");
    expect(insert?.args[0]).toEqual({ shop_id: "shop-1", name: "Gula", unit: "kg", sell_price: 15000, buy_price: 12000, stock_qty: 10, min_stock: 3 });
    expect(revalidatePath).toHaveBeenCalledWith("/app/produk");
    expect(revalidatePath).toHaveBeenCalledWith("/app");
  });

  it("blocks non-owner roles", async () => {
    const { client, from } = makeClient();
    vi.mocked(getIdentity).mockResolvedValue({ client, authId: "auth-1" } as never);
    vi.mocked(getMembership).mockResolvedValue({ membership: { shop_id: "shop-1", role: "staff" }, error: null } as never);
    const state = await createProduct(initialState, buildForm(validCreate));
    expect(state.status).toBe("error");
    expect(from).not.toHaveBeenCalled();
  });

  it("surfaces a database error from the insert", async () => {
    const { client, results } = makeClient();
    authenticateAsOwner(client);
    results.set("products", { data: null, error: { message: "rls" } });
    const state = await createProduct(initialState, buildForm(validCreate));
    expect(state.status).toBe("error");
  });
});

describe("adjustStock", () => {
  const validAdjust = { product_id: PRODUCT_ID, stock_qty: "4", reason: "Barang rusak" };

  it("records the reason in audit_logs before updating stock with the trusted shop_id", async () => {
    const { client, results, operations } = makeClient();
    authenticateAsOwner(client);
    results.set("products", { data: { stock_qty: "5", min_stock: "2" }, error: null });
    results.set("audit_logs", { data: null, error: null });

    const state = await adjustStock(initialState, buildForm({ ...validAdjust, shop_id: "evil-shop" }));

    expect(state.status).toBe("success");
    const audit = operations.find((operation) => operation.table === "audit_logs" && operation.op === "insert");
    expect(audit?.args[0]).toEqual({
      shop_id: "shop-1",
      entity: "product",
      entity_id: PRODUCT_ID,
      action: "stock_adjustment",
      old_value: { stock_qty: 5, min_stock: 2 },
      new_value: { stock_qty: 4, reason: "Barang rusak" },
      actor: "auth-1",
    });
    const update = operations.find((operation) => operation.table === "products" && operation.op === "update");
    expect(update?.args[0]).toEqual({ stock_qty: 4 });
    expect(revalidatePath).toHaveBeenCalledWith("/app/produk");
  });

  it("does not change stock when the audit trail cannot be written", async () => {
    const { client, results, operations } = makeClient();
    authenticateAsOwner(client);
    results.set("products", { data: { stock_qty: "5", min_stock: "2" }, error: null });
    results.set("audit_logs", { data: null, error: { message: "rls" } });

    const state = await adjustStock(initialState, buildForm(validAdjust));

    expect(state.status).toBe("error");
    expect(state.message).toContain("Alasan");
    expect(operations.some((operation) => operation.table === "products" && operation.op === "update")).toBe(false);
  });

  it("reports a missing product for the shop", async () => {
    const { client, results } = makeClient();
    authenticateAsOwner(client);
    results.set("products", { data: null, error: null });
    const state = await adjustStock(initialState, buildForm(validAdjust));
    expect(state.status).toBe("error");
    expect(state.message).toContain("tidak ditemukan");
  });

  it("requires a reason", async () => {
    const { client, from } = makeClient();
    authenticateAsOwner(client);
    const state = await adjustStock(initialState, buildForm({ ...validAdjust, reason: "  " }));
    expect(state.status).toBe("error");
    expect(state.fieldErrors?.reason).toBeTruthy();
    expect(from).not.toHaveBeenCalled();
  });
});

describe("updateMinStock", () => {
  it("updates the minimum threshold using the trusted shop_id", async () => {
    const { client, operations } = makeClient();
    authenticateAsOwner(client);
    const state = await updateMinStock(initialState, buildForm({ product_id: PRODUCT_ID, min_stock: "2", shop_id: "evil-shop" }));
    expect(state.status).toBe("success");
    const update = operations.find((operation) => operation.table === "products" && operation.op === "update");
    expect(update?.args[0]).toEqual({ min_stock: 2 });
    const shopFilter = operations.find((operation) => operation.op === "eq" && operation.args[0] === "shop_id");
    expect(shopFilter?.args[1]).toBe("shop-1");
  });
});

describe("deleteProduct", () => {
  it("confirms existence then deletes with the trusted shop_id", async () => {
    const { client, results, operations } = makeClient();
    authenticateAsOwner(client);
    results.set("products", { data: { name: "Gula" }, error: null });
    const state = await deleteProduct(initialState, buildForm({ product_id: PRODUCT_ID, shop_id: "evil-shop" }));
    expect(state.status).toBe("success");
    expect(operations.some((operation) => operation.table === "products" && operation.op === "delete")).toBe(true);
    const shopFilter = operations.find((operation) => operation.op === "eq" && operation.args[0] === "shop_id");
    expect(shopFilter?.args[1]).toBe("shop-1");
  });

  it("rejects an invalid product id without touching the database", async () => {
    const { client, from } = makeClient();
    authenticateAsOwner(client);
    const state = await deleteProduct(initialState, buildForm({ product_id: "not-a-uuid" }));
    expect(state.status).toBe("error");
    expect(from).not.toHaveBeenCalled();
  });
});
