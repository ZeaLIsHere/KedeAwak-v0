import { describe, expect, it } from "vitest";
import {
  ASSISTANT_SETUP_GUIDANCE,
  ASSISTANT_TOOL_ROUND_LIMIT,
  MAX_QUESTION_LENGTH,
  READ_ONLY_ASSISTANT_TOOLS,
  READ_ONLY_TOOL_NAMES,
  REPORT_PERIOD_TO_KIND,
  checkStockArgsSchema,
  getReportArgsSchema,
  isReadOnlyToolName,
  parseToolArguments,
  questionSchema,
  resolveAssistantConfig,
  summarizeToolResult,
  type ToolResult,
} from "./assistant";

describe("read-only tool definitions", () => {
  it("exposes only check_stock and get_report", () => {
    expect(READ_ONLY_TOOL_NAMES).toEqual(["check_stock", "get_report"]);
    expect(READ_ONLY_ASSISTANT_TOOLS.map((tool) => tool.function.name)).toEqual(["check_stock", "get_report"]);
    expect(READ_ONLY_ASSISTANT_TOOLS.every((tool) => tool.type === "function")).toBe(true);
  });

  it("declares strict JSON-schema parameters with required fields", () => {
    const [stock, report] = READ_ONLY_ASSISTANT_TOOLS;
    expect(stock?.function.parameters).toMatchObject({
      type: "object",
      required: ["query"],
      additionalProperties: false,
    });
    expect(report?.function.parameters).toMatchObject({
      type: "object",
      required: ["period"],
      additionalProperties: false,
    });
    expect(JSON.stringify(READ_ONLY_ASSISTANT_TOOLS)).toContain("check_stock");
  });

  it("recognizes the read-only names and rejects anything else", () => {
    expect(isReadOnlyToolName("check_stock")).toBe(true);
    expect(isReadOnlyToolName("send_purchase_order")).toBe(false);
    expect(isReadOnlyToolName("")).toBe(false);
  });

  it("maps report periods to deterministic report kinds", () => {
    expect(REPORT_PERIOD_TO_KIND).toEqual({ today: "today", "7d": "last7", "30d": "last30", month: "thisMonth" });
  });
});

describe("tool argument validation", () => {
  it("accepts well-formed check_stock arguments and trims the query", () => {
    const parsed = checkStockArgsSchema.safeParse({ query: "  gula  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.query).toBe("gula");
  });

  it("rejects malformed check_stock arguments", () => {
    expect(checkStockArgsSchema.safeParse({ query: "" }).success).toBe(false);
    expect(checkStockArgsSchema.safeParse({ query: "gula", extra: 1 }).success).toBe(false);
    expect(checkStockArgsSchema.safeParse({ product_id: "x" }).success).toBe(false);
  });

  it("accepts known report periods and rejects unknown ones", () => {
    expect(getReportArgsSchema.safeParse({ period: "today" }).success).toBe(true);
    expect(getReportArgsSchema.safeParse({ period: "last7" }).success).toBe(false);
    expect(getReportArgsSchema.safeParse({ period: "custom" }).success).toBe(false);
    expect(getReportArgsSchema.safeParse({}).success).toBe(false);
  });

  it("parses untrusted string arguments without executing them", () => {
    expect(parseToolArguments("check_stock", '{"query":"gula"}')).toEqual({
      status: "ok",
      name: "check_stock",
      args: { query: "gula" },
    });
    expect(parseToolArguments("get_report", '{"period":"7d"}')).toEqual({
      status: "ok",
      name: "get_report",
      args: { period: "7d" },
    });
  });

  it("rejects malformed JSON and schema mismatches", () => {
    expect(parseToolArguments("check_stock", "{untrusted")).toEqual({ status: "invalid", name: "check_stock" });
    expect(parseToolArguments("check_stock", "")).toEqual({ status: "invalid", name: "check_stock" });
    expect(parseToolArguments("check_stock", "null")).toEqual({ status: "invalid", name: "check_stock" });
    expect(parseToolArguments("get_report", '{"period":"forever"}')).toEqual({ status: "invalid", name: "get_report" });
    expect(parseToolArguments("get_report", '{"period":"today","extra":true}')).toEqual({ status: "invalid", name: "get_report" });
  });

  it("ignores unknown tools, including write tools", () => {
    expect(parseToolArguments("create_sale", "{}")).toEqual({ status: "ignored", name: "create_sale" });
    expect(parseToolArguments("send_whatsapp", "{}")).toEqual({ status: "ignored", name: "send_whatsapp" });
  });

  it("validates the owner question with clear limits", () => {
    expect(questionSchema.safeParse("  Laporan hari ini  ").success).toBe(true);
    expect(questionSchema.safeParse("").success).toBe(false);
    expect(questionSchema.safeParse("  ").success).toBe(false);
    expect(questionSchema.safeParse("a".repeat(MAX_QUESTION_LENGTH + 1)).success).toBe(false);
  });
});

describe("tool result summaries", () => {
  it("summarizes a found product with unit and low-stock hint", () => {
    const result: ToolResult = {
      tool: "check_stock",
      available: true,
      found: true,
      name: "Gula pasir",
      unit: "kg",
      stockQty: "6",
      low: true,
    };
    expect(summarizeToolResult(result)).toBe("Stok Gula pasir: 6 kg (stok menipis).");
  });

  it("summarizes a product that is not found", () => {
    const result: ToolResult = { tool: "check_stock", available: true, found: false, query: "mie instan" };
    expect(summarizeToolResult(result)).toBe('Produk "mie instan" tidak ditemukan di data warung.');
  });

  it("summarizes a report with code-computed rupiah totals", () => {
    const result: ToolResult = {
      tool: "get_report",
      available: true,
      periodLabel: "Hari ini",
      income: "Rp150.000",
      expense: "Rp40.000",
      difference: "Rp110.000",
      count: 3,
    };
    expect(summarizeToolResult(result)).toBe(
      "Hari ini: uang masuk Rp150.000, uang keluar Rp40.000, selisih Rp110.000 dari 3 catatan.",
    );
  });

  it("never invents data when the source is unavailable", () => {
    expect(summarizeToolResult({ tool: "check_stock", available: false })).toBe(
      "Data belum dapat dibaca dari sistem saat ini. Coba lagi nanti.",
    );
    expect(summarizeToolResult({ tool: "get_report", available: false })).toBe(
      "Data belum dapat dibaca dari sistem saat ini. Coba lagi nanti.",
    );
  });
});

describe("configuration guard", () => {
  it("returns null when the API key or the model is missing", () => {
    expect(resolveAssistantConfig({})).toBeNull();
    expect(resolveAssistantConfig({ LLM_API_KEY: "synthetic", LLM_MODEL: "" })).toBeNull();
    expect(resolveAssistantConfig({ LLM_API_KEY: "   ", LLM_MODEL: "deepseek-flash" })).toBeNull();
    expect(resolveAssistantConfig({ LLM_API_KEY: "synthetic", LLM_MODEL: "   " })).toBeNull();
  });

  it("returns trimmed credentials when both are present", () => {
    expect(resolveAssistantConfig({ LLM_API_KEY: " synthetic-key ", LLM_MODEL: " deepseek-flash " })).toEqual({
      apiKey: "synthetic-key",
      model: "deepseek-flash",
    });
  });

  it("points the owner to server setup without exposing any secret", () => {
    expect(ASSISTANT_SETUP_GUIDANCE).toContain("LLM_API_KEY");
    expect(ASSISTANT_SETUP_GUIDANCE).toContain("LLM_MODEL");
    expect(ASSISTANT_SETUP_GUIDANCE).toContain("apps/web/.env.local");
  });

  it("keeps the tool loop bounded", () => {
    expect(ASSISTANT_TOOL_ROUND_LIMIT).toBeGreaterThan(0);
    expect(ASSISTANT_TOOL_ROUND_LIMIT).toBeLessThanOrEqual(3);
  });
});
