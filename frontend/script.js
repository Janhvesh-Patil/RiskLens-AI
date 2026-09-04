const API_BASE = "http://127.0.0.1:8000";

async function loadSampleTransactions() {
  const select = document.getElementById("transaction-select");
  select.innerHTML = `<option value="">Loading...</option>`;

  try {
    const res = await fetch(`${API_BASE}/sample-transactions`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    select.innerHTML = `<option value="">-- Select a transaction --</option>`;
    for (const txn of data.samples) {
      const opt = document.createElement("option");
      opt.value = txn.transaction_id;
      opt.textContent = `Transaction ${txn.transaction_id} — ₹${txn.Amount}`;
      select.appendChild(opt);
    }
  } catch (err) {
    select.innerHTML = `<option value="">Failed to load transactions</option>`;
    console.error("loadSampleTransactions failed:", err);
  }
}

window.addEventListener("DOMContentLoaded", loadSampleTransactions);