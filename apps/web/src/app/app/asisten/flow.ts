import type { ChatMessage, CompletionResult, ToolDefinition } from "@kedeawak/agent/src/deepseek-client";
import {
  ASSISTANT_EXPIRED_NOTICE,
  ASSISTANT_LOOP_EXHAUSTED,
  ASSISTANT_NO_ANSWER,
  ASSISTANT_ALREADY_HANDLED_NOTICE,
  ASSISTANT_REJECTED_NOTICE,
  ASSISTANT_SETUP_GUIDANCE,
  ASSISTANT_STAFF_WRITE_REFUSAL,
  ASSISTANT_TOOL_ROUND_LIMIT,
  approvedExecutionMessage,
  buildSystemPrompt,
  buildWritePayload,
  classifyConfirmation,
  parseToolArguments,
  parseWritePayload,
  pendingConfirmationPrompt,
  quotaExhaustedMessage,
  summarizePendingAction,
  summarizeToolResult,
  toolsForRole,
  type AssistantRole,
  type ConversationTurn,
  type ReportPeriod,
  type ToolResult,
  type WritePayload,
  type WriteToolName,
} from "@/lib/assistant";

// SECTION: Ports (implemented by data.ts, faked in tests)
export type AgentLogEntry = {
  tool: string;
  args: unknown;
  result: string;
  latencyMs: number;
  error?: string;
};

export type PendingActionView = {
  id: string;
  actionType: string;
  payload: unknown;
  summary: string;
  expiresAt: Date;
};

export type QuotaDecision = { allowed: boolean; used: number; limit: number };
export type WriteExecution = { ok: true } | { ok: false; message: string };

export type AssistantStore = {
  checkStock(query: string): Promise<ToolResult>;
  getReport(period: ReportPeriod): Promise<ToolResult>;
  findOpenPendingAction(): Promise<PendingActionView | null>;
  expirePendingAction(id: string): Promise<void>;
  rejectPendingAction(id: string): Promise<void>;
  confirmPendingAction(id: string): Promise<boolean>;
  createPendingAction(input: {
    actionType: WriteToolName;
    payload: unknown;
    summary: string;
    expiresAt: Date;
  }): Promise<{ id: string } | null>;
  executeWrite(action: WritePayload): Promise<WriteExecution>;
  logTool(entry: AgentLogEntry): Promise<void>;
  reserveAiCall(): Promise<QuotaDecision>;
};

export type AssistantModel = {
  complete(request: { messages: ChatMessage[]; tools?: ToolDefinition[] }): Promise<CompletionResult>;
};

// SECTION: Result and input
export type AssistantTurnResult = {
  status: "success" | "unavailable" | "error";
  message: string;
  pending: { id: string; summary: string } | null;
  quota: { used: number; limit: number } | null;
  executedWrite: boolean;
};

export type AssistantTurnInput = {
  role: AssistantRole;
  message: string;
  history: readonly ConversationTurn[];
  now: Date;
  ttlMinutes: number;
  model: AssistantModel | null;
  store: AssistantStore;
};

// SECTION: Helpers
function success(message: string, extra: Partial<AssistantTurnResult> = {}): AssistantTurnResult {
  return { status: "success", message, pending: null, quota: null, executedWrite: false, ...extra };
}

function failure(message: string, status: "error" | "unavailable" = "error"): AssistantTurnResult {
  return { status, message, pending: null, quota: null, executedWrite: false };
}

function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

// MARK: Logging must never break the user reply (FR-AI-07)
async function safeLog(store: AssistantStore, entry: AgentLogEntry): Promise<void> {
  try {
    await store.logTool(entry);
  } catch {
    // SECTION: swallow logging failures
  }
}

function modelErrorResult(error: unknown): AssistantTurnResult {
  const code =
    typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "CONFIG") return failure(ASSISTANT_SETUP_GUIDANCE, "unavailable");
  if (code === "TIMEOUT") return failure("Asisten tidak merespons tepat waktu. Coba lagi.");
  return failure("Layanan asisten sedang tidak dapat dihubungi. Coba lagi nanti.");
}

// SECTION: Tool handling
type ToolOutcome = { content: string; pending: { id: string; summary: string } | null };

async function handleToolCall(
  input: AssistantTurnInput,
  name: string,
  rawArguments: string,
): Promise<ToolOutcome> {
  const started = Date.now();
  const parsed = parseToolArguments(name, rawArguments);
  const latency = () => Math.max(0, Date.now() - started);

  if (parsed.status === "ignored") {
    const content = `Tool "${parsed.name}" tidak tersedia.`;
    await safeLog(input.store, { tool: parsed.name, args: {}, result: content, latencyMs: latency(), error: "unknown_tool" });
    return { content, pending: null };
  }
  if (parsed.status === "invalid") {
    const content = `Argumen untuk ${parsed.name} tidak valid. Kirim argumen sesuai skema.`;
    await safeLog(input.store, { tool: parsed.name, args: {}, result: content, latencyMs: latency(), error: "invalid_arguments" });
    return { content, pending: null };
  }

  if (parsed.name === "check_stock") {
    const result = await input.store.checkStock(parsed.args.query);
    const content = summarizeToolResult(result);
    await safeLog(input.store, { tool: parsed.name, args: parsed.args, result: content, latencyMs: latency() });
    return { content, pending: null };
  }
  if (parsed.name === "get_report") {
    const result = await input.store.getReport(parsed.args.period);
    const content = summarizeToolResult(result);
    await safeLog(input.store, { tool: parsed.name, args: parsed.args, result: content, latencyMs: latency() });
    return { content, pending: null };
  }

  // MARK: Write tools are never executed here; only owners may even reach them
  if (input.role !== "owner") {
    await safeLog(input.store, { tool: parsed.name, args: parsed.args, result: ASSISTANT_STAFF_WRITE_REFUSAL, latencyMs: latency(), error: "role_denied" });
    return { content: ASSISTANT_STAFF_WRITE_REFUSAL, pending: null };
  }

  const action = parsed.name === "create_expense" ? buildWritePayload("create_expense", parsed.args) : buildWritePayload("create_sale", parsed.args);
  const summary = summarizePendingAction(action);
  const expiresAt = new Date(input.now.getTime() + input.ttlMinutes * 60_000);
  const created = await input.store.createPendingAction({
    actionType: parsed.name,
    payload: action.payload,
    summary,
    expiresAt,
  });
  const latencyMs = latency();
  if (!created) {
    const content = "Permintaan belum dapat disiapkan karena penyimpanan gagal. Coba lagi nanti.";
    await safeLog(input.store, { tool: parsed.name, args: parsed.args, result: content, latencyMs, error: "pending_insert_failed" });
    return { content, pending: null };
  }
  await safeLog(input.store, { tool: parsed.name, args: parsed.args, result: summary, latencyMs });
  return { content: summary, pending: { id: created.id, summary } };
}

// SECTION: Approval resolution (FR-HITL-02/03/05)
async function resolveApproval(
  store: AssistantStore,
  pending: PendingActionView,
): Promise<AssistantTurnResult> {
  const action = parseWritePayload(pending.actionType, pending.payload);
  if (!action) {
    await store.rejectPendingAction(pending.id);
    return failure("Data permintaan tidak valid sehingga tidak dijalankan.");
  }

  // MARK: Conditional update enforces exactly one execution
  const claimed = await store.confirmPendingAction(pending.id);
  if (!claimed) return success(ASSISTANT_ALREADY_HANDLED_NOTICE);

  const execution = await store.executeWrite(action);
  if (!execution.ok) return failure(execution.message);

  return success(approvedExecutionMessage(action), { executedWrite: true });
}

// SECTION: Main turn
export async function runAssistantTurn(input: AssistantTurnInput): Promise<AssistantTurnResult> {
  const { role, message, history, now, model, store } = input;

  // STEP: Resolve a pending action before anything else
  const pending = await store.findOpenPendingAction();
  if (pending) {
    if (isExpired(pending.expiresAt, now)) {
      await store.expirePendingAction(pending.id);
      return success(ASSISTANT_EXPIRED_NOTICE);
    }
    const decision = classifyConfirmation(message);
    if (decision === "approve") return resolveApproval(store, pending);
    if (decision === "reject") {
      await store.rejectPendingAction(pending.id);
      return success(ASSISTANT_REJECTED_NOTICE);
    }
    // STEP: A correction replaces the pending payload, never a brand-new transaction
    await store.expirePendingAction(pending.id);
  }

  if (!model) return failure(ASSISTANT_SETUP_GUIDANCE, "unavailable");

  // STEP: Reserve quota before the model call (FR-QUOTA-01/02)
  const quota = await store.reserveAiCall();
  if (!quota.allowed) {
    return success(quotaExhaustedMessage(quota.used, quota.limit), { quota: { used: quota.used, limit: quota.limit } });
  }
  const quotaView = { used: quota.used, limit: quota.limit };

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(role) },
    ...history.map((turn) => ({ role: turn.role, content: turn.content }) as ChatMessage),
    { role: "user", content: message },
  ];
  const tools = toolsForRole(role);

  try {
    let toolRounds = 0;
    for (;;) {
      const completion = await model.complete({ messages, tools: [...tools] });
      if (completion.finishReason === "stop") {
        return success(completion.content?.trim() || ASSISTANT_NO_ANSWER, { quota: quotaView });
      }
      if (toolRounds >= ASSISTANT_TOOL_ROUND_LIMIT) {
        return failure(ASSISTANT_LOOP_EXHAUSTED);
      }
      toolRounds += 1;
      messages.push({ role: "assistant", content: null, tool_calls: completion.toolCalls });

      for (const call of completion.toolCalls) {
        const outcome = await handleToolCall(input, call.function.name, call.function.arguments);
        if (outcome.pending) {
          return success(pendingConfirmationPrompt(outcome.pending.summary), { pending: outcome.pending, quota: quotaView });
        }
        messages.push({ role: "tool", content: outcome.content, tool_call_id: call.id });
      }
    }
  } catch (caught) {
    return modelErrorResult(caught);
  }
}
