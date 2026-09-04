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

document.getElementById("transaction-select").addEventListener("change", async (e) => {
  const details = document.getElementById("transaction-details");
  const id = e.target.value;

  if (!id) {
    details.innerHTML = "";
    return;
  }

  details.innerHTML = "Loading...";

  try {
    const res = await fetch(`${API_BASE}/transaction/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const txn = await res.json();

    details.innerHTML = `
      <p>ID: ${txn.transaction_id}</p>
      <p>Amount: ₹${txn.Amount}</p>
      <p>Time: ${txn.Time}</p>
    `;
  } catch (err) {
    details.innerHTML = "Failed to load transaction details.";
    console.error("transaction fetch failed:", err);
  }
});

document.getElementById("analyze-btn").addEventListener("click", async () => {
  const id = document.getElementById("transaction-select").value;
  const result = document.getElementById("risk-result");

  if (!id) {
    result.innerHTML = "Select a transaction first.";
    return;
  }

  result.innerHTML = "Analyzing...";

  try {
    const res = await fetch(`${API_BASE}/predict/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pred = await res.json();

    result.innerHTML = `
      <p>Prediction: ${pred.prediction.toUpperCase()}</p>
      <p>Fraud probability: ${pred.fraud_probability}</p>
      <p>Threshold: ${pred.threshold}</p>
      <p>Actual class: ${pred.actual_class === 1 ? "FRAUD" : "LEGIT"}</p>
    `;
  } catch (err) {
    result.innerHTML = "Failed to analyze transaction.";
    console.error("predict fetch failed:", err);
  }
});