import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/membership", () => ({ getIdentity: vi.fn(), getMembership: vi.fn() }));

import { getIdentity, getMembership } from "@/lib/membership";
import { whatsappNumberSchema } from "@/lib/whatsapp-number";
import { saveWhatsAppNumber, type WhatsAppNumberState } from "./actions";

const initialState: WhatsAppNumberState = { status: "idle", message: "" };

function makeClient() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq }));
  return { client: { from: vi.fn(() => ({ update })) }, update, eq };
}

function authenticateAs(role: "owner" | "staff", client: unknown) {
  vi.mocked(getIdentity).mockResolvedValue({ client, authId: "auth-1" } as never);
  vi.mocked(getMembership).mockResolvedValue({ membership: { shop_id: "shop-1", role }, error: null } as never);
}

function buildForm(value: string) {
  const data = new FormData();
  data.set("phone_number_id", value);
  return data;
}

afterEach(() => vi.resetAllMocks());

describe("whatsapp number schema", () => {
  it("accepts numeric Meta ids and an empty value for unlinking", () => {
    expect(whatsappNumberSchema.safeParse({ phone_number_id: "123456789012345" }).success).toBe(true);
    expect(whatsappNumberSchema.safeParse({ phone_number_id: "" }).success).toBe(true);
  });

  it("rejects phone numbers, spaces, letters, and short ids", () => {
    for (const value of ["+6281234567890", "0812 3456", "abc123", "1234"]) {
      expect(whatsappNumberSchema.safeParse({ phone_number_id: value }).success, value).toBe(false);
    }
  });
});

describe("saveWhatsAppNumber", () => {
  it("stores the id for the trusted shop only", async () => {
    const { client, update, eq } = makeClient();
    authenticateAs("owner", client);
    const state = await saveWhatsAppNumber(initialState, buildForm("123456789012345"));
    expect(state.status).toBe("success");
    expect(update).toHaveBeenCalledWith({ wa_phone_number_id: "123456789012345" });
    expect(eq).toHaveBeenCalledWith("id", "shop-1");
  });

  it("clears the id when the owner submits an empty value", async () => {
    const { client, update } = makeClient();
    authenticateAs("owner", client);
    const state = await saveWhatsAppNumber(initialState, buildForm(""));
    expect(state.status).toBe("success");
    expect(update).toHaveBeenCalledWith({ wa_phone_number_id: null });
  });

  it("rejects invalid input and non-owner roles without writing", async () => {
    const { client, update } = makeClient();
    authenticateAs("owner", client);
    const invalid = await saveWhatsAppNumber(initialState, buildForm("bukan-angka"));
    expect(invalid.status).toBe("error");
    expect(update).not.toHaveBeenCalled();

    const staffClient = makeClient();
    authenticateAs("staff", staffClient.client);
    const blocked = await saveWhatsAppNumber(initialState, buildForm("123456789012345"));
    expect(blocked.status).toBe("error");
    expect(staffClient.update).not.toHaveBeenCalled();
  });

  it("reports a database error without leaking its message", async () => {
    const { client, eq } = makeClient();
    eq.mockResolvedValueOnce({ error: { message: "duplicate key value violates unique constraint" } });
    authenticateAs("owner", client);
    const state = await saveWhatsAppNumber(initialState, buildForm("123456789012345"));
    expect(state.status).toBe("error");
    expect(state.message).not.toContain("duplicate key");
  });
});
