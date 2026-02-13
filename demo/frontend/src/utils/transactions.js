const STORAGE_KEY = "apix_demo_transactions_v1";

const readAll = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
};

const writeAll = (transactions) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
};

export const listTransactions = () => {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
};

export const createTransaction = (input) => {
  const now = Date.now();
  const transaction = {
    id: input.id || `txn_${now}_${Math.floor(Math.random() * 100000)}`,
    createdAt: now,
    updatedAt: now,
    rail: input.rail || "apix",
    status: input.status || "pending",
    requestId: input.requestId || null,
    txHash: input.txHash || null,
    message: input.message || "",
    // Security rule: only store data when status is success.
    data: input.status === "success" ? input.data || null : null,
  };

  const all = readAll();
  all.push(transaction);
  writeAll(all);
  return transaction;
};

export const updateTransaction = (id, patch) => {
  const all = readAll();
  const idx = all.findIndex((t) => t.id === id);
  if (idx < 0) return null;

  const next = {
    ...all[idx],
    ...patch,
    updatedAt: Date.now(),
  };

  // Security rule: failed/pending transactions never expose payload data.
  if (next.status !== "success") {
    next.data = null;
  }

  all[idx] = next;
  writeAll(all);
  return next;
};

export const clearTransactions = () => {
  localStorage.removeItem(STORAGE_KEY);
};
