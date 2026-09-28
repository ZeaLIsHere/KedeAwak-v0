import type { Transaction } from "./finance";

export const DEMO_DATE = "18 Juni 2026";

export const sampleTransactions: readonly Transaction[] = [
  { id: "tx-1", title: "Nasi goreng dan es teh", type: "income", amount: 42000, date: "18 Jun · 11.45" },
  { id: "tx-2", title: "Belanja beras", type: "expense", amount: 85000, date: "18 Jun · 10.20" },
  { id: "tx-3", title: "Nasi ayam 3 porsi", type: "income", amount: 90000, date: "18 Jun · 09.40" },
  { id: "tx-4", title: "Isi ulang gas", type: "expense", amount: 22000, date: "18 Jun · 08.55" },
  { id: "tx-5", title: "Kopi susu 2 gelas", type: "income", amount: 36000, date: "18 Jun · 08.15" },
  { id: "tx-6", title: "Nasi uduk 4 porsi", type: "income", amount: 80000, date: "18 Jun · 07.30" },
  { id: "tx-7", title: "Belanja telur", type: "expense", amount: 32000, date: "18 Jun · 06.45" },
];

export const sampleProducts = [
  { name: "Beras", stock: 2, unit: "kg", minimum: 5 },
  { name: "Telur", stock: 6, unit: "butir", minimum: 10 },
  { name: "Teh celup", stock: 25, unit: "sachet", minimum: 10 },
  { name: "Kopi bubuk", stock: 12, unit: "sachet", minimum: 10 },
] as const;

export const sampleOrders = [
  { id: "ORD-003", items: "2 nasi goreng, 1 es teh", amount: 42000, status: "Selesai", time: "11.45" },
  { id: "ORD-002", items: "2 ayam bakar", amount: 64000, status: "Menunggu pembayaran", time: "10.05" },
  { id: "ORD-001", items: "4 nasi uduk", amount: 80000, status: "Selesai", time: "07.30" },
] as const;
