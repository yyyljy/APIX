import { useMemo, useState } from "react";
import { clearTransactions, listTransactions } from "../utils/transactions";

const formatDateTime = (timestamp) => {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString();
};

const statusBadgeClass = (status) => {
  if (status === "success") return "bg-emerald-100 text-emerald-700";
  if (status === "failed") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
};

export default function TransactionHistoryPage() {
  const [reloadTick, setReloadTick] = useState(0);
  const transactions = useMemo(() => listTransactions(), [reloadTick]);

  return (
    <div className="space-y-6">
      <section className="panel p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
              Transaction History
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Successful transactions show unlocked data. Failed or pending transactions hide data.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setReloadTick((v) => v + 1)}
              className="btn btn-secondary"
            >
              Refresh
            </button>
            <button
              onClick={() => {
                clearTransactions();
                setReloadTick((v) => v + 1);
              }}
              className="btn btn-primary"
            >
              Clear History
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {transactions.length === 0 ? (
          <article className="panel-strong p-6">
            <p className="text-sm text-slate-600">No transactions recorded yet.</p>
          </article>
        ) : (
          transactions.map((tx) => (
            <article key={tx.id} className="panel-strong p-5 md:p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{tx.rail} transaction</p>
                  <p className="font-mono text-xs text-slate-500">id: {tx.id}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusBadgeClass(tx.status)}`}>
                  {tx.status.toUpperCase()}
                </span>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                <p><span className="font-semibold">Created:</span> {formatDateTime(tx.createdAt)}</p>
                <p><span className="font-semibold">Updated:</span> {formatDateTime(tx.updatedAt)}</p>
                <p><span className="font-semibold">Request ID:</span> {tx.requestId || "-"}</p>
                <p><span className="font-semibold">Tx Hash:</span> {tx.txHash || "-"}</p>
              </div>

              {tx.message ? (
                <p className="mt-3 text-sm text-slate-700">
                  <span className="font-semibold">Message:</span> {tx.message}
                </p>
              ) : null}

              <div className="mt-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Unlocked Data
                </p>
                <pre className="response-box">
                  {tx.status === "success" && tx.data
                    ? JSON.stringify(tx.data, null, 2)
                    : "Data hidden: transaction not completed successfully."}
                </pre>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
