export type Transaction = {
  id: string;
  title: string;
  type: "income" | "expense";
  amount: number;
  date: string;
};

export type Summary = {
  income: number;
  expense: number;
  cashDifference: number;
};

const rupiahFormatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const MAX_ENTRY = 1_000_000_000;

export function formatRupiah(amount: number): string {
  return `Rp${rupiahFormatter.format(amount)}`;
}

export function summarize(transactions: readonly Transaction[]): Summary {
  const totals = transactions.reduce(
    (result, transaction) => {
      result[transaction.type] += transaction.amount;
      return result;
    },
    { income: 0, expense: 0 },
  );

  return { ...totals, cashDifference: totals.income - totals.expense };
}

export function validateAmount(value: string): string | null {
  if (!value.trim()) return "Isi nominal terlebih dahulu.";
  if (!/^[0-9]+$/.test(value)) return "Gunakan angka rupiah tanpa titik atau koma.";
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_ENTRY) {
    return "Masukkan nominal dari Rp1 sampai Rp1.000.000.000.";
  }
  return null;
}

export function validateTitle(value: string): string | null {
  if (!value.trim()) return "Isi keterangan terlebih dahulu.";
  if (value.trim().length > 60) return "Keterangan maksimal 60 karakter.";
  return null;
}
