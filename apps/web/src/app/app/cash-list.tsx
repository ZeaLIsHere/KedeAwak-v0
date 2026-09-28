import { formatJakartaDateTime, formatRupiah } from "@/lib/ledger";
import type { CashTransaction } from "./data";

export function CashList({ transactions }: { transactions: readonly CashTransaction[] }) {
  return (
    <ul className="transaction-list">
      {transactions.map((transaction) => (
        <li className="transaction-row" key={transaction.id}>
          <span className={`transaction-mark ${transaction.type}`} aria-hidden="true">{transaction.type === "income" ? "+" : "−"}</span>
          <span className="transaction-detail">
            <strong>{transaction.description}</strong>
            <span>{formatJakartaDateTime(transaction.occurredAt)} · {transaction.type === "income" ? "Uang masuk" : "Uang keluar"}</span>
          </span>
          <strong className={`transaction-amount ${transaction.type}`}>
            {transaction.type === "income" ? "+" : "−"}{formatRupiah(transaction.amount)}
          </strong>
        </li>
      ))}
    </ul>
  );
}
