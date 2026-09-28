import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/membership", () => ({ getIdentity: vi.fn(), getMembership: vi.fn() }));

import { revalidatePath } from "next/cache";
import { getIdentity, getMembership } from "@/lib/membership";
import { completeOrder, createOrder, setOrderStatus, type OrderActionState } from "./actions";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const SALE_ID = "44444444-4444-4444-8444-444444444444";
const initialState: OrderActionState = { status: "idle", message: "" };

type QueryResult = { data?: unknown; error?: unknown };
type Operation = { table: string; op: string; args: unknown[] };

function makeClient() {
  const results = new Map<string, QueryResult>();
  const operations: Operation[] = [];
  const rpcCalls: { name: string; args: unknown }[] = [];
  const rpcResults = new Map<string, QueryResult>();
  const getResult = (table: string) => results.get(table) ?? { data: null, error: null };

  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    for (const op of ["select", "eq", "in", "order", "limit", "delete", "update"]) {
      builder[op] = vi.fn((...args: unknown[]) => {
        operations.push({ table, op, args });
        return builder;
      });
    }
    builder.insert = vi.fn((...args: unknown[]) => {
      operations.push({ table, op: "insert", args });
      return builder;
    });
    builder.single = vi.fn(() => Promise.resolve(getResult(table)));
    builder.maybeSingle = vi.fn(() => Promise.resolve(getResult(table)));
    builder.then = (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(getResult(table)).then(resolve, reject);
    return builder;
  });

  const rpc = vi.fn((name: string, args: unknown) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(rpcResults.get(name) ?? { data: null, error: null });
  });

  return { client: { from, rpc }, from, rpc, results, operations, rpcCalls, rpcResults };
}

function buildItemsForm(payload: unknown) {
  const data = new FormData();
  data.set("items", typeof payload === "string" ? payload : JSON.stringify(payload));
  return data;
}

function authenticateAsOwner(client: unknown) {
  vi.mocked(getIdentity).mockResolvedValue({ client, authId: "auth-1" } as never);
  vi.mocked(getMembership).mockResolvedValue({ membership: { shop_id: "shop-1", role: "owner" }, error: null } as never);
}

afterEach(() => vi.resetAllMocks());

describe("createOrder", () => {
  it("rejects an unreadable item payload before touching the database", async () => {
    const { client, from } = makeClient();
    authenticateAsOwner(client);
    const state = await createOrder(initialState, buildItemsForm("not-json"));
    expect(state.status).toBe("error");
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects an empty item list before touching the database", async () => {
    const { client, from } = makeClient();
    authenticateAsOwner(client);
    const state = await createOrder(initialState, buildItemsForm([]));
    expect(state.status).toBe("error");
    expect(from).not.toHaveBeenCalled();
  });

  it("computes the total from trusted product prices and writes the trusted shop_id", async () => {
    const { client, results, operations } = makeClient();
    authenticateAsOwner(client);
    results.set("products", { data: [{ id: PRODUCT_ID, name: "Gula", unit: "kg", sell_price: "15000" }], error: null });
    results.set("orders", { data: { id: ORDER_ID }, error: null });
    results.set("order_items", { data: null, error: null });

    const state = await createOrder(
      initialState,
      buildItemsForm([{ product_id: PRODUCT_ID, qty: "1,5", unit_price: 1, price: 1, shop_id: "evil-shop" }]),
    );

    expect(state.status).toBe("success");
    const orderInsert = operations.find((operation) => operation.table === "orders" && operation.op === "insert");
    expect(orderInsert?.args[0]).toEqual({ shop_id: "shop-1", status: "draft", total: "22500", payment_status: "pending", source: "dashboard" });

    const itemInsert = operations.find((operation) => operation.table === "order_items" && operation.op === "insert");
    expect(itemInsert?.args[0]).toEqual([
      { shop_id: "shop-1", order_id: ORDER_ID, product_id: PRODUCT_ID, qty: "1.5", unit_price: 15000 },
    ]);

    expect(revalidatePath).toHaveBeenCalledWith("/app/pesanan");
    expect(revalidatePath).toHaveBeenCalledWith("/app");
    expect(revalidatePath).toHaveBeenCalledWith("/app/riwayat");
  });

  it("reports a product missing from the shop", async () => {
    const { client, results } = makeClient();
    authenticateAsOwner(client);
    results.set("products", { data: [], error: null });
    const state = await createOrder(initialState, buildItemsForm([{ product_id: PRODUCT_ID, qty: "2" }]));
    expect(state.status).toBe("error");
    expect(state.message).toContain("tidak ditemukan");
  });

  it("rolls the orphan order back when items fail to save", async () => {
    const { client, results, operations } = makeClient();
    authenticateAsOwner(client);
    results.set("products", { data: [{ id: PRODUCT_ID, name: "Gula", unit: "kg", sell_price: 15000 }], error: null });
    results.set("orders", { data: { id: ORDER_ID }, error: null });
    results.set("order_items", { data: null, error: { message: "rls" } });

    const state = await createOrder(initialState, buildItemsForm([{ product_id: PRODUCT_ID, qty: "2" }]));

    expect(state.status).toBe("error");
    expect(operations.some((operation) => operation.table === "orders" && operation.op === "delete")).toBe(true);
  });

  it("blocks non-owner roles", async () => {
    const { client, from } = makeClient();
    vi.mocked(getIdentity).mockResolvedValue({ client, authId: "auth-1" } as never);
    vi.mocked(getMembership).mockResolvedValue({ membership: { shop_id: "shop-1", role: "staff" }, error: null } as never);
    const state = await createOrder(initialState, buildItemsForm([{ product_id: PRODUCT_ID, qty: "2" }]));
    expect(state.status).toBe("error");
    expect(from).not.toHaveBeenCalled();
  });
});

describe("setOrderStatus", () => {
  function statusForm(orderId: string, status: string) {
    const data = new FormData();
    data.set("order_id", orderId);
    data.set("status", status);
    return data;
  }

  it("calls the set_order_status RPC with the trusted order id", async () => {
    const { client, rpcCalls } = makeClient();
    authenticateAsOwner(client);
    const state = await setOrderStatus(initialState, statusForm(ORDER_ID, "awaiting_payment"));
    expect(state.status).toBe("success");
    expect(rpcCalls[0]).toEqual({ name: "set_order_status", args: { p_order_id: ORDER_ID, p_status: "awaiting_payment" } });
    expect(revalidatePath).toHaveBeenCalledWith("/app/pesanan");
  });

  it("refuses statuses that are not manually settable", async () => {
    const { client, rpc } = makeClient();
    authenticateAsOwner(client);
    const state = await setOrderStatus(initialState, statusForm(ORDER_ID, "completed"));
    expect(state.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps an RPC error to a friendly message", async () => {
    const { client, rpcResults } = makeClient();
    authenticateAsOwner(client);
    rpcResults.set("set_order_status", { data: null, error: { message: "Order not found" } });
    const state = await setOrderStatus(initialState, statusForm(ORDER_ID, "cancelled"));
    expect(state.status).toBe("error");
    expect(state.message).toContain("tidak ditemukan");
  });
});

describe("completeOrder", () => {
  function completeForm(orderId: string) {
    const data = new FormData();
    data.set("order_id", orderId);
    return data;
  }

  it("calls the complete_order RPC and reports success", async () => {
    const { client, rpcCalls, rpcResults } = makeClient();
    authenticateAsOwner(client);
    rpcResults.set("complete_order", { data: SALE_ID, error: null });
    const state = await completeOrder(initialState, completeForm(ORDER_ID));
    expect(state.status).toBe("success");
    expect(rpcCalls[0]).toEqual({ name: "complete_order", args: { p_order_id: ORDER_ID } });
    expect(revalidatePath).toHaveBeenCalledWith("/app/riwayat");
  });

  it("maps an RPC error to a friendly message", async () => {
    const { client, rpcResults } = makeClient();
    authenticateAsOwner(client);
    rpcResults.set("complete_order", { data: null, error: { message: "Insufficient stock for one or more items" } });
    const state = await completeOrder(initialState, completeForm(ORDER_ID));
    expect(state.status).toBe("error");
    expect(state.message).toContain("Stok tidak mencukupi");
  });

  it("blocks non-owner roles without calling the RPC", async () => {
    const { client, rpc } = makeClient();
    vi.mocked(getIdentity).mockResolvedValue({ client, authId: "auth-1" } as never);
    vi.mocked(getMembership).mockResolvedValue({ membership: { shop_id: "shop-1", role: "staff" }, error: null } as never);
    const state = await completeOrder(initialState, completeForm(ORDER_ID));
    expect(state.status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });
});
