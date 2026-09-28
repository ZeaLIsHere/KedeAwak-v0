import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/membership", () => ({ getIdentity: vi.fn(), getMembership: vi.fn() }));

import { revalidatePath } from "next/cache";
import { getIdentity, getMembership } from "@/lib/membership";
import { toggleAutoReply, updateShopProfile, type ShopProfileActionState } from "./actions";

const initialState: ShopProfileActionState = { status: "idle", message: "" };

type QueryResult = { data?: unknown; error?: unknown };
type Operation = { table: string; op: string; args: unknown[] };

function makeClient() {
  const updateResults = new Map<string, QueryResult>();
  const operations: Operation[] = [];
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    const chain = (op: string) =>
      vi.fn((...args: unknown[]) => {
        operations.push({ table, op, args });
        return builder;
      });
    builder.select = chain("select");
    builder.eq = chain("eq");
    builder.update = vi.fn((...args: unknown[]) => {
      operations.push({ table, op: "update", args });
      return builder;
    });
    builder.single = vi.fn(() => Promise.resolve(updateResults.get(table) ?? { data: null, error: null }));
    builder.then = (resolve: (value: QueryResult) => unknown) =>
      Promise.resolve(updateResults.get(table) ?? { data: null, error: null }).then(resolve);
    return builder;
  });
  return { client: { from }, from, operations, updateResults };
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

const validProfile = { name: "Warung Bu Sari", business_type: "Warung makan", opening_hours: "07.00 - 21.00", address: "Jl. Melati 3" };

afterEach(() => vi.resetAllMocks());

describe("updateShopProfile", () => {
  it("rejects invalid input before touching the database", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    const state = await updateShopProfile(initialState, buildForm({ ...validProfile, name: "   " }));
    expect(state.status).toBe("error");
    expect(state.fieldErrors?.name).toBeTruthy();
    expect(harness.from).not.toHaveBeenCalled();
  });

  it("updates only the editable profile fields with the trusted shop id", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    const state = await updateShopProfile(
      initialState,
      buildForm({ ...validProfile, opening_hours: "", address: "", shop_id: "evil-shop", plan: "pro", wa_phone_number_id: "999" }),
    );
    expect(state.status).toBe("success");
    const update = harness.operations.find((operation) => operation.table === "shops" && operation.op === "update");
    expect(update?.args[0]).toEqual({
      name: "Warung Bu Sari",
      business_type: "Warung makan",
      opening_hours: null,
      address: null,
    });
    const idFilter = harness.operations.find((operation) => operation.op === "eq" && operation.args[0] === "id");
    expect(idFilter?.args[1]).toBe("shop-1");
    expect(revalidatePath).toHaveBeenCalledWith("/app/pengaturan");
    expect(revalidatePath).toHaveBeenCalledWith("/app");
  });

  it("blocks non-owner roles", async () => {
    const harness = makeClient();
    vi.mocked(getIdentity).mockResolvedValue({ client: harness.client, authId: "auth-1" } as never);
    vi.mocked(getMembership).mockResolvedValue({ membership: { shop_id: "shop-1", role: "staff" }, error: null } as never);
    const state = await updateShopProfile(initialState, buildForm(validProfile));
    expect(state.status).toBe("error");
    expect(harness.from).not.toHaveBeenCalled();
  });

  it("surfaces a database error without leaking the raw message", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    harness.updateResults.set("shops", { data: null, error: { message: "permission denied for table shops" } });
    const state = await updateShopProfile(initialState, buildForm(validProfile));
    expect(state.status).toBe("error");
    expect(state.message).not.toContain("permission denied");
  });
});

describe("toggleAutoReply", () => {
  it("stores a checked switch as true", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    const state = await toggleAutoReply(initialState, buildForm({ enabled: "on", shop_id: "evil-shop" }));
    expect(state.status).toBe("success");
    const update = harness.operations.find((operation) => operation.table === "shops" && operation.op === "update");
    expect(update?.args[0]).toEqual({ auto_reply_enabled: true });
    const idFilter = harness.operations.find((operation) => operation.op === "eq" && operation.args[0] === "id");
    expect(idFilter?.args[1]).toBe("shop-1");
  });

  it("stores an unchecked switch as false", async () => {
    const harness = makeClient();
    authenticateAsOwner(harness.client);
    const state = await toggleAutoReply(initialState, buildForm({}));
    expect(state.status).toBe("success");
    const update = harness.operations.find((operation) => operation.table === "shops" && operation.op === "update");
    expect(update?.args[0]).toEqual({ auto_reply_enabled: false });
  });

  it("blocks non-owner roles", async () => {
    const harness = makeClient();
    vi.mocked(getIdentity).mockResolvedValue({ client: harness.client, authId: "auth-1" } as never);
    vi.mocked(getMembership).mockResolvedValue({ membership: { shop_id: "shop-1", role: "staff" }, error: null } as never);
    const state = await toggleAutoReply(initialState, buildForm({ enabled: "on" }));
    expect(state.status).toBe("error");
    expect(harness.from).not.toHaveBeenCalled();
  });
});
