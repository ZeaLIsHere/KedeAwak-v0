import { describe, expect, it } from "vitest";
import {
  formatReportDay,
  groupByJakartaDay,
  periodKindFromParam,
  periodKindToParam,
  periodLabel,
  resolvePeriod,
  summarize,
  topProducts,
} from "./reports";

const NOW = new Date("2026-09-28T03:00:00Z");

describe("period resolution in Asia/Jakarta", () => {
  it("maps period kinds to query params and labels", () => {
    expect(periodKindToParam("today")).toBe("hari-ini");
    expect(periodKindToParam("last7")).toBe("7-hari");
    expect(periodLabel("thisMonth")).toBe("Bulan ini");
  });

  it("parses the query param with a safe default", () => {
    expect(periodKindFromParam("7-hari")).toBe("last7");
    expect(periodKindFromParam("bulan-ini")).toBe("thisMonth");
    expect(periodKindFromParam(["30-hari", "hari-ini"])).toBe("last30");
    expect(periodKindFromParam(undefined)).toBe("today");
    expect(periodKindFromParam("tidak-dikenal")).toBe("today");
  });

  it("brackets today in UTC", () => {
    const range = resolvePeriod("today", NOW);
    expect(range.start.toISOString()).toBe("2026-09-27T17:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-28T17:00:00.000Z");
  });

  it("covers seven and thirty Jakarta days ending today", () => {
    expect(resolvePeriod("last7", NOW).start.toISOString()).toBe("2026-09-21T17:00:00.000Z");
    expect(resolvePeriod("last7", NOW).end.toISOString()).toBe("2026-09-28T17:00:00.000Z");
    expect(resolvePeriod("last30", NOW).start.toISOString()).toBe("2026-08-29T17:00:00.000Z");
    expect(resolvePeriod("last30", NOW).end.toISOString()).toBe("2026-09-28T17:00:00.000Z");
  });

  it("covers the Jakarta calendar month and rolls over December", () => {
    const month = resolvePeriod("thisMonth", NOW);
    expect(month.start.toISOString()).toBe("2026-08-31T17:00:00.000Z");
    expect(month.end.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    const december = resolvePeriod("thisMonth", new Date("2026-12-15T03:00:00Z"));
    expect(december.start.toISOString()).toBe("2026-11-30T17:00:00.000Z");
    expect(december.end.toISOString()).toBe("2026-12-31T17:00:00.000Z");
  });
});

describe("summary totals", () => {
  it("sums integer rupiah without floating point", () => {
    const summary = summarize([{ total: "1000", occurred_at: "x" }, { total: 2000, occurred_at: "y" }], [{ amount: "500", occurred_at: "z" }]);
    expect(summary.income).toBe(BigInt(3000));
    expect(summary.expense).toBe(BigInt(500));
    expect(summary.difference).toBe(BigInt(2500));
    expect(summary.count).toBe(3);
  });

  it("reports a negative difference when expenses exceed income", () => {
    const summary = summarize([], [{ amount: "1000", occurred_at: "z" }]);
    expect(summary.difference).toBe(BigInt(-1000));
    expect(summary.count).toBe(1);
  });
});

describe("daily Jakarta bucketing", () => {
  it("returns one ordered bucket per day in the period", () => {
    const period = resolvePeriod("last7", NOW);
    const buckets = groupByJakartaDay([], [], period);
    expect(buckets.map((bucket) => bucket.day)).toEqual([
      "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28",
    ]);
  });

  it("places rows in the correct Jakarta day and computes bar percentages", () => {
    const period = resolvePeriod("today", NOW);
    const buckets = groupByJakartaDay(
      [
        { total: "50000", occurred_at: "2026-09-27T18:00:00Z" },
        { total: "25000", occurred_at: "2026-09-27T16:00:00Z" },
      ],
      [{ amount: "20000", occurred_at: "2026-09-28T02:00:00Z" }],
      period,
    );
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({ day: "2026-09-28", income: BigInt(50000), expense: BigInt(20000) });
    expect(buckets[0].incomePercent).toBe(100);
    expect(buckets[0].expensePercent).toBe(40);
  });

  it("keeps percentages at zero when there is no data", () => {
    const buckets = groupByJakartaDay([], [], resolvePeriod("last7", NOW));
    for (const bucket of buckets) {
      expect(bucket.income).toBe(BigInt(0));
      expect(bucket.expense).toBe(BigInt(0));
      expect(bucket.incomePercent).toBe(0);
      expect(bucket.expensePercent).toBe(0);
    }
  });

  it("formats a day key for display in Jakarta", () => {
    expect(formatReportDay("2026-09-28")).toBe("28 Sep");
  });
});

describe("top products", () => {
  const names = new Map([
    ["a", "Kopi"],
    ["b", "Teh"],
  ]);

  it("aggregates quantity and integer rupiah revenue, then sorts by quantity", () => {
    const items = [
      { product_id: "a", qty: "2.000", unit_price: 5000 },
      { product_id: "a", qty: "1", unit_price: 5000 },
      { product_id: "b", qty: "4", unit_price: 2000 },
    ];
    const result = topProducts(items, names, 5);
    expect(result.map((product) => product.productId)).toEqual(["b", "a"]);
    expect(result[0]).toMatchObject({ name: "Teh", qtyMilli: 4000, revenue: BigInt(8000) });
    expect(result[1]).toMatchObject({ name: "Kopi", qtyMilli: 3000, revenue: BigInt(15000) });
  });

  it("rounds revenue half up and falls back to a generic name", () => {
    const result = topProducts([{ product_id: "c", qty: "0.001", unit_price: 1500 }], names, 5);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Produk");
    expect(result[0].revenue).toBe(BigInt(2));
  });

  it("respects the limit and skips non-positive quantities", () => {
    const items = [
      { product_id: "a", qty: "5", unit_price: 1000 },
      { product_id: "b", qty: "0", unit_price: 1000 },
      { product_id: "c", qty: null, unit_price: 1000 },
    ];
    expect(topProducts(items, names, 1)).toHaveLength(1);
    expect(topProducts(items, names, 1)[0].productId).toBe("a");
  });
});
