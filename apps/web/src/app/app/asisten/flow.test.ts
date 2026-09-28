import { describe, expect, it, vi } from "vitest";
import type { ChatMessage, CompletionResult, ToolCall, ToolDefinition } from "@kedeawak/agent/src/deepseek-client";
import {
  ASSISTANT_ALREADY_HANDLED_NOTICE,
  ASSISTANT_EXPIRED_NOTICE,
  ASSISTANT_LOOP_EXHAUSTED,
  ASSISTANT_REJECTED_NOTICE,
  buildSystemPrompt,
  type ToolResult,
} from "@/lib/assistant";
import {
  runAssistantTurn,
  type AssistantModel,
  type AssistantStore,
  type AssistantTurnInput,
  type PendingActionView,
  type QuotaDecision,
  type WriteExecution,
} from "./flow";

const NOW = new Date("2026-09-28T03:00:00Z");

function stop(content: string): CompletionResult {
  return { content, toolCalls: [], finishReason: "stop" };
}

function toolCall(name: string, args: unknown, id = "call-1"): CompletionResult {
  const call: ToolCall = { id, type: "function", function: { name, arguments: JSON.stringify(args) } };
  return { content: null, toolCalls: [call], finishReason: "tool_calls" };
}

function createModel(script: CompletionResult[]) {
  const calls: { messages: ChatMessage[]; tools?: ToolDefinition[] }[] = [];
  const model: AssistantModel = {
    async complete(request) {
      calls.push(request);
      const next = script.shift();
      if (!next) throw new Error("no scripted completion");
      return next;
    },
  };
  return { model, calls };
}

type CreatePendingInput = Parameters<AssistantStore["createPendingAction"]>[0];

function createStore() {
  const checkStock = vi.fn(async (): Promise<ToolResult> => ({ tool: "check_stock", available: true, found: false, query: "gula" }));
  const getReport = vi.fn(async (): Promise<ToolResult> => ({ tool: "get_report", available: false }));
  const findOpenPendingAction = vi.fn(async (): Promise<PendingActionView | null> => null);
  const expirePendingAction = vi.fn(async (): Promise<void> => {});
  const rejectPendingAction = vi.fn(async (): Promise<void> => {});
  const confirmPendingAction = vi.fn(async (): Promise<boolean> => true);
  const createPendingAction = vi.fn<(input: CreatePendingInput) => Promise<{ id: string } | null>>(async () => ({ id: "pending-1" }));
  const executeWrite = vi.fn(async (): Promise<WriteExecution> => ({ ok: true }));
  const logTool = vi.fn(async (): Promise<void> => {});
  const reserveAiCall = vi.fn(async (): Promise<QuotaDecision> => ({ allowed: true, used: 1, limit: 30 }));

  const store: AssistantStore = {
    checkStock,
    getReport,
    findOpenPendingAction,
    expirePendingAction,
    rejectPendingAction,
    confirmPendingAction,
    createPendingAction,
    executeWrite,
    logTool,
    reserveAiCall,
  };
  return { store, checkStock, getReport, findOpenPendingAction, expirePendingAction, rejectPendingAction, confirmPendingAction, createPendingAction, executeWrite, logTool, reserveAiCall };
}

function pendingExpense(overrides: Partial<PendingActionView> = {}): PendingActionView {
  return {
    id: "pending-1",
    actionType: "create_expense",
    payload: { description: "Beli gula", amount: 25000 },
    summary: 'Catat pengeluaran Rp25.000 untuk "Beli gula".',
    expiresAt: new Date(NOW.getTime() + 20 * 60_000),
    ...overrides,
  };
}

function baseInput(store: AssistantStore, overrides: Partial<AssistantTurnInput> = {}): AssistantTurnInput {
  return { role: "owner", message: "halo", history: [], now: NOW, ttlMinutes: 30, model: null, store, ...overrides };
}

describe("role-aware tool offering", () => {
  it("offers write tools to the owner and only read tools to staff", async () => {
    const owner = createStore();
    const ownerModel = createModel([stop("Baik.")]);
    await runAssistantTurn(baseInput(owner.store, { role: "owner", model: ownerModel.model }));
    expect(ownerModel.calls[0]?.tools?.map((tool) => tool.function.name)).toEqual([
      "check_stock",
      "get_report",
      "create_expense",
      "create_sale",
    ]);

    const staff = createStore();
    const staffModel = createModel([stop("Baik.")]);
    await runAssistantTurn(baseInput(staff.store, { role: "staff", model: staffModel.model }));
    expect(staffModel.calls[0]?.tools?.map((tool) => tool.function.name)).toEqual(["check_stock", "get_report"]);
  });

  it("forwards the role-aware system prompt and bounded history", async () => {
    const { store } = createStore();
    const { model, calls } = createModel([stop("Baik.")]);
    await runAssistantTurn(
      baseInput(store, {
        model,
        history: [
          { role: "user", content: "halo" },
          { role: "assistant", content: "hai" },
        ],
      }),
    );
    expect(calls[0]?.messages[0]).toEqual({ role: "system", content: buildSystemPrompt("owner") });
    expect(calls[0]?.messages[1]).toEqual({ role: "user", content: "halo" });
    expect(calls[0]?.messages[2]).toEqual({ role: "assistant", content: "hai" });
    expect(calls[0]?.messages[3]).toEqual({ role: "user", content: "halo" });
  });

  it("refuses a write tool call from staff without creating a pending action", async () => {
    const { store, createPendingAction } = createStore();
    const { model } = createModel([toolCall("create_expense", { description: "Gula", amount: "1000" }), stop("Tidak bisa.")]);
    const result = await runAssistantTurn(baseInput(store, { role: "staff", model }));
    expect(createPendingAction).not.toHaveBeenCalled();
    expect(result.message).toBe("Tidak bisa.");
  });
});

describe("write tools become pending actions", () => {
  it("never executes a write tool from model output", async () => {
    const { store, createPendingAction, executeWrite, logTool } = createStore();
    const { model } = createModel([toolCall("create_expense", { description: "Beli gula", amount: "25000" })]);
    const result = await runAssistantTurn(baseInput(store, { model }));

    expect(executeWrite).not.toHaveBeenCalled();
    expect(createPendingAction).toHaveBeenCalledTimes(1);
    const input = createPendingAction.mock.calls[0]?.[0];
    expect(input?.actionType).toBe("create_expense");
    expect(input?.payload).toEqual({ description: "Beli gula", amount: 25000 });
    expect(input?.expiresAt.toISOString()).toBe(new Date(NOW.getTime() + 30 * 60_000).toISOString());
    expect(result.pending).toEqual({ id: "pending-1", summary: 'Catat pengeluaran Rp25.000 untuk "Beli gula".' });
    expect(result.message).toContain("Balas");
    expect(logTool).toHaveBeenCalledWith(expect.objectContaining({ tool: "create_expense" }));
  });

  it("does not create a pending action when model nominals are invalid", async () => {
    const { store, createPendingAction, executeWrite } = createStore();
    const { model } = createModel([toolCall("create_expense", { description: "Gula", amount: "abc" }), stop("Nominal perlu angka bulat.")]);
    const result = await runAssistantTurn(baseInput(store, { model }));
    expect(createPendingAction).not.toHaveBeenCalled();
    expect(executeWrite).not.toHaveBeenCalled();
    expect(result.message).toBe("Nominal perlu angka bulat.");
  });
});

describe("confirmation resolution", () => {
  it("executes an approved action exactly once and refuses a second approval", async () => {
    const { store, findOpenPendingAction, confirmPendingAction, executeWrite, reserveAiCall } = createStore();
    findOpenPendingAction.mockResolvedValue(pendingExpense());
    confirmPendingAction.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { model, calls } = createModel([]);

    const first = await runAssistantTurn(baseInput(store, { model, message: "ya" }));
    expect(first.status).toBe("success");
    expect(first.message).toContain("tersimpan");
    expect(first.executedWrite).toBe(true);
    expect(executeWrite).toHaveBeenCalledTimes(1);
    expect(executeWrite).toHaveBeenCalledWith({
      actionType: "create_expense",
      payload: { description: "Beli gula", amount: 25000 },
    });
    expect(reserveAiCall).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);

    const second = await runAssistantTurn(baseInput(store, { model, message: "ya" }));
    expect(second.message).toBe(ASSISTANT_ALREADY_HANDLED_NOTICE);
    expect(second.executedWrite).toBe(false);
    expect(executeWrite).toHaveBeenCalledTimes(1);
  });

  it("rejects without executing anything", async () => {
    const { store, findOpenPendingAction, rejectPendingAction, executeWrite, createPendingAction } = createStore();
    findOpenPendingAction.mockResolvedValue(pendingExpense());
    const { model } = createModel([]);

    const result = await runAssistantTurn(baseInput(store, { model, message: "tidak" }));
    expect(result.message).toBe(ASSISTANT_REJECTED_NOTICE);
    expect(rejectPendingAction).toHaveBeenCalledWith("pending-1");
    expect(executeWrite).not.toHaveBeenCalled();
    expect(createPendingAction).not.toHaveBeenCalled();
  });

  it("treats a correction as a replacement pending action, not a new transaction", async () => {
    const { store, findOpenPendingAction, expirePendingAction, createPendingAction, executeWrite } = createStore();
    findOpenPendingAction.mockResolvedValue(pendingExpense());
    const { model } = createModel([toolCall("create_expense", { description: "Beli gula", amount: "30000" })]);

    const result = await runAssistantTurn(baseInput(store, { model, message: "ubah jadi 30000" }));
    expect(expirePendingAction).toHaveBeenCalledWith("pending-1");
    expect(createPendingAction).toHaveBeenCalledTimes(1);
    expect(createPendingAction.mock.calls[0]?.[0]?.payload).toEqual({ description: "Beli gula", amount: 30000 });
    expect(executeWrite).not.toHaveBeenCalled();
    expect(result.pending?.summary).toContain("Rp30.000");
  });

  it("marks an expired pending action and tells the user it was cancelled", async () => {
    const { store, findOpenPendingAction, expirePendingAction, executeWrite, reserveAiCall } = createStore();
    findOpenPendingAction.mockResolvedValue(pendingExpense({ expiresAt: new Date(NOW.getTime() - 60_000) }));
    const { model, calls } = createModel([stop("tidak boleh dipanggil")]);

    const result = await runAssistantTurn(baseInput(store, { model, message: "ya" }));
    expect(expirePendingAction).toHaveBeenCalledWith("pending-1");
    expect(result.message).toBe(ASSISTANT_EXPIRED_NOTICE);
    expect(executeWrite).not.toHaveBeenCalled();
    expect(reserveAiCall).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("reports a pending action whose stored payload fails re-validation", async () => {
    const { store, findOpenPendingAction, rejectPendingAction, executeWrite } = createStore();
    findOpenPendingAction.mockResolvedValue(pendingExpense({ payload: { description: "Gula", amount: 0 } }));
    const { model } = createModel([]);

    const result = await runAssistantTurn(baseInput(store, { model, message: "ya" }));
    expect(result.status).toBe("error");
    expect(executeWrite).not.toHaveBeenCalled();
    expect(rejectPendingAction).toHaveBeenCalledWith("pending-1");
  });
});

describe("quota", () => {
  it("refuses to call the model when the daily quota is exhausted", async () => {
    const { store, reserveAiCall } = createStore();
    reserveAiCall.mockResolvedValue({ allowed: false, used: 30, limit: 30 });
    const { model, calls } = createModel([stop("tidak boleh dipanggil")]);

    const result = await runAssistantTurn(baseInput(store, { model, message: "berapa stok gula?" }));
    expect(result.status).toBe("success");
    expect(result.message).toContain("Kuota AI harian");
    expect(result.message).toContain("30 dari 30");
    expect(result.quota).toEqual({ used: 30, limit: 30 });
    expect(calls).toHaveLength(0);
  });
});

describe("observability", () => {
  it("logs each read tool call and keeps going when logging fails", async () => {
    const { store, checkStock, logTool } = createStore();
    checkStock.mockResolvedValue({ tool: "check_stock", available: true, found: true, name: "Gula", unit: "kg", stockQty: "6", low: false });
    logTool.mockRejectedValue(new Error("agent_logs down"));
    const { model } = createModel([toolCall("check_stock", { query: "gula" }), stop("Stok gula 6 kg.")]);

    const result = await runAssistantTurn(baseInput(store, { model }));
    expect(checkStock).toHaveBeenCalledWith("gula");
    expect(logTool).toHaveBeenCalledWith(expect.objectContaining({ tool: "check_stock", latencyMs: expect.any(Number) }));
    expect(result.status).toBe("success");
    expect(result.message).toBe("Stok gula 6 kg.");
  });

  it("caps the tool loop and reports exhaustion", async () => {
    const { store, checkStock } = createStore();
    checkStock.mockResolvedValue({ tool: "check_stock", available: true, found: false, query: "gula" });
    const { model, calls } = createModel([
      toolCall("check_stock", { query: "gula" }, "c1"),
      toolCall("check_stock", { query: "gula" }, "c2"),
      toolCall("check_stock", { query: "gula" }, "c3"),
      toolCall("check_stock", { query: "gula" }, "c4"),
    ]);

    const result = await runAssistantTurn(baseInput(store, { model }));
    expect(result.status).toBe("error");
    expect(result.message).toBe(ASSISTANT_LOOP_EXHAUSTED);
    expect(calls).toHaveLength(4);
  });
});

describe("configuration and model failures", () => {
  it("does not call the model when configuration is missing", async () => {
    const { store, reserveAiCall } = createStore();
    const result = await runAssistantTurn(baseInput(store, { model: null }));
    expect(result.status).toBe("unavailable");
    expect(result.message).toContain("LLM_API_KEY");
    expect(reserveAiCall).not.toHaveBeenCalled();
  });

  it("maps provider failures to a polite message", async () => {
    const { store } = createStore();
    const model: AssistantModel = {
      async complete() {
        throw Object.assign(new Error("boom"), { code: "TIMEOUT" });
      },
    };
    const result = await runAssistantTurn(baseInput(store, { model }));
    expect(result.status).toBe("error");
    expect(result.message).toContain("tepat waktu");
  });
});
