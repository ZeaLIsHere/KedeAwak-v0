import { describe, expect, it } from "vitest";
import {
  ASSISTANT_SETUP_GUIDANCE,
  ASSISTANT_TOOL_NAMES,
  ASSISTANT_TOOL_ROUND_LIMIT,
  DEFAULT_APPROVAL_TTL_MINUTES,
  DEFAULT_DAILY_AI_QUOTA,
  MAX_HISTORY_MESSAGES,
  MAX_QUESTION_LENGTH,
  READ_ONLY_ASSISTANT_TOOLS,
  READ_ONLY_TOOL_NAMES,
  REPORT_PERIOD_TO_KIND,
  WRITE_ASSISTANT_TOOLS,
  approvedExecutionMessage,
  buildSystemPrompt,
  buildWritePayload,
  checkStockArgsSchema,
  classifyConfirmation,
  createExpenseArgsSchema,
  createSaleArgsSchema,
  getReportArgsSchema,
  isAssistantRole,
  isReadOnlyToolName,
  isWriteToolName,
  parseApprovalTtlMinutes,
  parseConversationHistory,
  parseDailyAiQuota,
  parseRupiahAmount,
  parseToolArguments,
  parseWritePayload,
  pendingConfirmationPrompt,
  questionSchema,
  quotaExhaustedMessage,
  resolveAssistantConfig,
  summarizePendingAction,
  summarizeToolResult,
  toolNamesForRole,
  toolsForRole,
  type ToolResult,
} from "./assistant";

describe("read-only tool definitions", () => {
  it("keeps the read tools unchanged", () => {
    expect(READ_ONLY_TOOL_NAMES).toEqual(["check_stock", "get_report"]);
    expect(READ_ONLY_ASSISTANT_TOOLS.map((tool) => tool.function.name)).toEqual(["check_stock", "get_report"]);
    expect(READ_ONLY_ASSISTANT_TOOLS.every((tool) => tool.type === "function")).toBe(true);
  });

  it("declares strict JSON-schema parameters with required fields", () => {
    const [stock, report] = READ_ONLY_ASSISTANT_TOOLS;
    expect(stock?.function.parameters).toMatchObject({ type: "object", required: ["query"], additionalProperties: false });
    expect(report?.function.parameters).toMatchObject({ type: "object", required: ["period"], additionalProperties: false });
    expect(JSON.stringify(READ_ONLY_ASSISTANT_TOOLS)).toContain("check_stock");
  });

  it("recognizes tool names and rejects anything else", () => {
    expect(isReadOnlyToolName("check_stock")).toBe(true);
    expect(isReadOnlyToolName("create_sale")).toBe(false);
    expect(isWriteToolName("create_sale")).toBe(true);
    expect(isWriteToolName("check_stock")).toBe(false);
    expect(ASSISTANT_TOOL_NAMES).toEqual(["check_stock", "get_report", "create_expense", "create_sale"]);
  });

  it("maps report periods to deterministic report kinds", () => {
    expect(REPORT_PERIOD_TO_KIND).toEqual({ today: "today", "7d": "last7", "30d": "last30", month: "thisMonth" });
  });
});

describe("role to tool filtering (FR-AI-01/04)", () => {
  it("gives owners read and write tools", () => {
    expect(toolNamesForRole("owner")).toEqual(["check_stock", "get_report", "create_expense", "create_sale"]);
    expect(WRITE_ASSISTANT_TOOLS.map((tool) => tool.function.name)).toEqual(["create_expense", "create_sale"]);
  });

  it("gives staff read tools only", () => {
    expect(toolNamesForRole("staff")).toEqual(["check_stock", "get_report"]);
  });

  it("gives unknown roles no tools at all", () => {
    expect(toolsForRole("customer")).toEqual([]);
    expect(toolNamesForRole("")).toEqual([]);
    expect(toolNamesForRole("admin")).toEqual([]);
  });

  it("recognizes only owner and staff as assistant roles", () => {
    expect(isAssistantRole("owner")).toBe(true);
    expect(isAssistantRole("staff")).toBe(true);
    expect(isAssistantRole("customer")).toBe(false);
  });
});

describe("integer rupiah nominals (FR-FIN-05 / NFR-AI-03)", () => {
  it("accepts safe integers and digit-only strings", () => {
    expect(parseRupiahAmount(25000)).toBe(25000);
    expect(parseRupiahAmount("25000")).toBe(25000);
    expect(parseRupiahAmount("1000000000")).toBe(1000000000);
    expect(Number.isInteger(parseRupiahAmount("15000"))).toBe(true);
  });

  it("rejects zero, negatives, formatted numbers, and non-numbers", () => {
    for (const value of ["0", "-5", "1.000", "1,5", "abc", "", "1e3", " 25000", 0, -5, 1.5, Number.NaN]) {
      expect(parseRupiahAmount(value), String(value)).toBeNull();
    }
    expect(parseRupiahAmount(1000000001)).toBeNull();
    expect(parseRupiahAmount(null)).toBeNull();
  });

  it("validates expense arguments with a bounded integer amount", () => {
    const ok = createExpenseArgsSchema.safeParse({ description: "Beli gula", amount: "25000" });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.amount).toBe(25000);
      expect(Number.isInteger(ok.data.amount)).toBe(true);
    }
    expect(createExpenseArgsSchema.safeParse({ description: "Beli gula", amount: "1.000" }).success).toBe(false);
    expect(createExpenseArgsSchema.safeParse({ description: "Beli gula", amount: "abc" }).success).toBe(false);
    expect(createExpenseArgsSchema.safeParse({ description: "", amount: "25000" }).success).toBe(false);
    expect(createExpenseArgsSchema.safeParse({ description: "Beli gula", amount: "25000", extra: 1 }).success).toBe(false);
  });

  it("validates sale arguments with an optional note", () => {
    const ok = createSaleArgsSchema.safeParse({ total: "30000" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.description).toBe("");
    expect(createSaleArgsSchema.safeParse({ total: "0" }).success).toBe(false);
    expect(createSaleArgsSchema.safeParse({ total: "-5" }).success).toBe(false);
    expect(createSaleArgsSchema.safeParse({ description: "Nasi goreng", total: "1.000" }).success).toBe(false);
  });
});

describe("tool argument validation", () => {
  it("accepts well-formed read arguments and trims the query", () => {
    const parsed = checkStockArgsSchema.safeParse({ query: "  gula  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.query).toBe("gula");
    expect(getReportArgsSchema.safeParse({ period: "today" }).success).toBe(true);
    expect(getReportArgsSchema.safeParse({ period: "last7" }).success).toBe(false);
  });

  it("parses untrusted string arguments without executing them", () => {
    expect(parseToolArguments("check_stock", '{"query":"gula"}')).toEqual({ status: "ok", name: "check_stock", args: { query: "gula" } });
    expect(parseToolArguments("create_expense", '{"description":"Beli gula","amount":"25000"}')).toEqual({
      status: "ok",
      name: "create_expense",
      args: { description: "Beli gula", amount: 25000 },
    });
  });

  it("rejects malformed JSON and schema mismatches for every tool", () => {
    expect(parseToolArguments("check_stock", "{untrusted")).toEqual({ status: "invalid", name: "check_stock" });
    expect(parseToolArguments("get_report", '{"period":"forever"}')).toEqual({ status: "invalid", name: "get_report" });
    expect(parseToolArguments("create_expense", '{"description":"Gula","amount":"1.000"}')).toEqual({
      status: "invalid",
      name: "create_expense",
    });
    expect(parseToolArguments("create_sale", '{"total":"abc"}')).toEqual({ status: "invalid", name: "create_sale" });
    expect(parseToolArguments("create_sale", "{}")).toEqual({ status: "invalid", name: "create_sale" });
  });

  it("ignores tools that are not in the assistant allow-list", () => {
    expect(parseToolArguments("send_whatsapp", "{}")).toEqual({ status: "ignored", name: "send_whatsapp" });
    expect(parseToolArguments("create_purchase_order", "{}")).toEqual({ status: "ignored", name: "create_purchase_order" });
  });

  it("validates the owner question with clear limits", () => {
    expect(questionSchema.safeParse("  Laporan hari ini  ").success).toBe(true);
    expect(questionSchema.safeParse("").success).toBe(false);
    expect(questionSchema.safeParse("a".repeat(MAX_QUESTION_LENGTH + 1)).success).toBe(false);
  });
});

describe("bounded untrusted conversation history", () => {
  it("keeps at most six user/assistant turns", () => {
    const turns = Array.from({ length: MAX_HISTORY_MESSAGES }, (_value, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `pesan ${index}`,
    }));
    expect(parseConversationHistory(turns)).toHaveLength(MAX_HISTORY_MESSAGES);
    expect(parseConversationHistory([...turns, { role: "user", content: "kelebihan" }])).toEqual([]);
  });

  it("drops unknown structures, roles, and oversized content", () => {
    expect(parseConversationHistory(undefined)).toEqual([]);
    expect(parseConversationHistory("bukan array")).toEqual([]);
    expect(parseConversationHistory([{ role: "system", content: "x" }])).toEqual([]);
    expect(parseConversationHistory([{ role: "user", content: "x", tool_calls: [] }])).toEqual([]);
    expect(parseConversationHistory([{ role: "user", content: "a".repeat(MAX_QUESTION_LENGTH + 1) }])).toEqual([]);
  });
});

describe("write payloads and confirmation", () => {
  it("builds and summarizes an expense payload from validated arguments", () => {
    const args = createExpenseArgsSchema.parse({ description: "Beli gula", amount: "25000" });
    const action = buildWritePayload("create_expense", args);
    expect(action).toEqual({ actionType: "create_expense", payload: { description: "Beli gula", amount: 25000 } });
    expect(summarizePendingAction(action)).toBe('Catat pengeluaran Rp25.000 untuk "Beli gula".');
    expect(approvedExecutionMessage(action)).toBe('Pengeluaran Rp25.000 untuk "Beli gula" tersimpan.');
  });

  it("builds and summarizes a sale payload", () => {
    const withNote = buildWritePayload("create_sale", createSaleArgsSchema.parse({ description: "Nasi goreng", total: "30000" }));
    expect(summarizePendingAction(withNote)).toBe("Catat penjualan Rp30.000 (Nasi goreng).");
    const withoutNote = buildWritePayload("create_sale", createSaleArgsSchema.parse({ total: "30000" }));
    expect(summarizePendingAction(withoutNote)).toBe("Catat penjualan Rp30.000.");
  });

  it("re-validates stored payloads on execution", () => {
    expect(parseWritePayload("create_expense", { description: "Gula", amount: 25000 })).toEqual({
      actionType: "create_expense",
      payload: { description: "Gula", amount: 25000 },
    });
    expect(parseWritePayload("create_expense", { description: "Gula", amount: 0 })).toBeNull();
    expect(parseWritePayload("create_sale", { description: "", total: "1.000" })).toBeNull();
    expect(parseWritePayload("create_debt", { amount: 25000 })).toBeNull();
  });

  it("classifies owner replies into approve, reject, or change", () => {
    for (const message of ["ya", "Ya!", " setuju ", "ok", "lanjut", "simpan"]) {
      expect(classifyConfirmation(message), message).toBe("approve");
    }
    for (const message of ["tidak", "Batal!", "jangan", "ga"]) {
      expect(classifyConfirmation(message), message).toBe("reject");
    }
    for (const message of ["ubah jadi 30000", "ganti keterangan", "berita lain"]) {
      expect(classifyConfirmation(message), message).toBe("change");
    }
  });

  it("asks for confirmation with clear options", () => {
    expect(pendingConfirmationPrompt("Catat pengeluaran Rp25.000.")).toContain("ya");
    expect(pendingConfirmationPrompt("Catat pengeluaran Rp25.000.")).toContain("tidak");
  });
});

describe("tool result summaries", () => {
  it("summarizes a found product with unit and low-stock hint", () => {
    const result: ToolResult = { tool: "check_stock", available: true, found: true, name: "Gula pasir", unit: "kg", stockQty: "6", low: true };
    expect(summarizeToolResult(result)).toBe("Stok Gula pasir: 6 kg (stok menipis).");
  });

  it("summarizes a product that is not found", () => {
    expect(summarizeToolResult({ tool: "check_stock", available: true, found: false, query: "mie instan" })).toBe(
      'Produk "mie instan" tidak ditemukan di data warung.',
    );
  });

  it("summarizes a report with code-computed integer rupiah totals", () => {
    const result: ToolResult = {
      tool: "get_report",
      available: true,
      periodLabel: "Hari ini",
      income: "Rp150.000",
      expense: "Rp40.000",
      difference: "Rp110.000",
      count: 3,
    };
    expect(summarizeToolResult(result)).toBe("Hari ini: uang masuk Rp150.000, uang keluar Rp40.000, selisih Rp110.000 dari 3 catatan.");
  });

  it("never invents data when the source is unavailable", () => {
    expect(summarizeToolResult({ tool: "check_stock", available: false })).toBe("Data belum dapat dibaca dari sistem saat ini. Coba lagi nanti.");
    expect(summarizeToolResult({ tool: "get_report", available: false })).toBe("Data belum dapat dibaca dari sistem saat ini. Coba lagi nanti.");
  });
});

describe("configuration, quota, and prompts", () => {
  it("returns null when the API key or the model is missing", () => {
    expect(resolveAssistantConfig({})).toBeNull();
    expect(resolveAssistantConfig({ LLM_API_KEY: "synthetic", LLM_MODEL: " " })).toBeNull();
    expect(resolveAssistantConfig({ LLM_API_KEY: " synthetic ", LLM_MODEL: " deepseek-flash " })).toEqual({
      apiKey: "synthetic",
      model: "deepseek-flash",
    });
  });

  it("points the owner to server setup without exposing any secret", () => {
    expect(ASSISTANT_SETUP_GUIDANCE).toContain("LLM_API_KEY");
    expect(ASSISTANT_SETUP_GUIDANCE).toContain("apps/web/.env.local");
  });

  it("parses the approval TTL and daily quota with safe defaults", () => {
    expect(parseApprovalTtlMinutes({})).toBe(DEFAULT_APPROVAL_TTL_MINUTES);
    expect(parseApprovalTtlMinutes({ APPROVAL_TTL_MINUTES: "45" })).toBe(45);
    expect(parseApprovalTtlMinutes({ APPROVAL_TTL_MINUTES: "0" })).toBe(DEFAULT_APPROVAL_TTL_MINUTES);
    expect(parseApprovalTtlMinutes({ APPROVAL_TTL_MINUTES: "abc" })).toBe(DEFAULT_APPROVAL_TTL_MINUTES);
    expect(parseDailyAiQuota({})).toBe(DEFAULT_DAILY_AI_QUOTA);
    expect(parseDailyAiQuota({ DAILY_AI_QUOTA_FREE: "5" })).toBe(5);
    expect(parseDailyAiQuota({ DAILY_AI_QUOTA_FREE: "0" })).toBe(DEFAULT_DAILY_AI_QUOTA);
  });

  it("builds a role-aware prompt that refuses to reveal itself", () => {
    const owner = buildSystemPrompt("owner");
    const staff = buildSystemPrompt("staff");
    expect(owner).toContain("create_expense");
    expect(owner).toContain("konfirmasi");
    expect(staff).toContain("hanya boleh membaca");
    expect(staff).not.toContain("create_expense");
    expect(owner).toContain("membocorkan");
    expect(staff).toContain("membocorkan");
  });

  it("states the quota limit in the refusal message", () => {
    expect(quotaExhaustedMessage(30, 30)).toContain("30 dari 30");
  });

  it("keeps the tool loop bounded", () => {
    expect(ASSISTANT_TOOL_ROUND_LIMIT).toBeGreaterThan(0);
    expect(ASSISTANT_TOOL_ROUND_LIMIT).toBeLessThanOrEqual(3);
  });
});
