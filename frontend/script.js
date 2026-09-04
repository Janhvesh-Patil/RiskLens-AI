const API_BASE = "http://127.0.0.1:8000";

/**
 * Loads deterministic 20 sample transactions into the select dropdown on page load.
 */
async function loadSampleTransactions() {
  const select = document.getElementById("transaction-select");
  select.innerHTML = `<option value="">Loading sample transactions...</option>`;

  try {
    const res = await fetch(`${API_BASE}/sample-transactions`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    select.innerHTML = `<option value="">-- Select a transaction --</option>`;
    for (const txn of data.samples) {
      const opt = document.createElement("option");
      opt.value = txn.transaction_id;
      const amountStr = typeof txn.Amount === "number" ? txn.Amount.toFixed(2) : txn.Amount;
      opt.textContent = `Transaction ${txn.transaction_id} — ₹${amountStr}`;
      select.appendChild(opt);
    }
  } catch (err) {
    select.innerHTML = `<option value="">Failed to load transactions (Check API)</option>`;
    console.error("loadSampleTransactions failed:", err);
  }
}

window.addEventListener("DOMContentLoaded", loadSampleTransactions);

/**
 * Handle transaction selection change.
 * Fetches transaction details and resets any stale risk result.
 */
document.getElementById("transaction-select").addEventListener("change", async (e) => {
  const details = document.getElementById("transaction-details");
  const result = document.getElementById("risk-result");
  const id = e.target.value;

  // Clear stale prediction results when selection changes
  result.innerHTML = `
    <div class="empty-state">
      <p>Click <strong>Analyze Risk</strong> to evaluate Transaction ${id ? id : ""}.</p>
    </div>
  `;

  if (!id) {
    details.innerHTML = `
      <div class="empty-state">
        <p>Select a transaction above to view details.</p>
      </div>
    `;
    return;
  }

  details.innerHTML = `<div class="loading-text">Loading transaction details...</div>`;

  try {
    const res = await fetch(`${API_BASE}/transaction/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const txn = await res.json();

    const formattedAmount = typeof txn.Amount === "number" 
      ? `₹${txn.Amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `₹${txn.Amount}`;

    details.innerHTML = `
      <div class="details-container">
        <div class="detail-row">
          <span class="detail-label">Transaction ID</span>
          <span class="detail-value id-value">#${txn.transaction_id}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Amount</span>
          <span class="detail-value amount-value">${formattedAmount}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Time (Seconds)</span>
          <span class="detail-value time-value">${txn.Time}s</span>
        </div>
      </div>
    `;
  } catch (err) {
    details.innerHTML = `<div class="error-text">Failed to load transaction details. Ensure backend API is running.</div>`;
    console.error("transaction fetch failed:", err);
  }
});

/**
 * Handle Analyze Risk button click.
 * Calls /predict/{id} and renders prediction, probability meter, ground truth, and SHAP explanation.
 */
document.getElementById("analyze-btn").addEventListener("click", async () => {
  const id = document.getElementById("transaction-select").value;
  const result = document.getElementById("risk-result");

  if (!id) {
    result.innerHTML = `<div class="error-text">Please select a transaction first.</div>`;
    return;
  }

  result.innerHTML = `
    <div class="loading-text">
      <div class="spinner"></div>
      <span>Analyzing transaction with AI Model & SHAP Explainer...</span>
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE}/predict/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pred = await res.json();

    const isFraud = pred.prediction === "fraud";
    const probPct = (pred.fraud_probability * 100).toFixed(2);
    const threshPct = (pred.threshold * 100).toFixed(1);

    // Max absolute SHAP value for scaling the bar tracks proportionally
    const maxAbs = Math.max(...pred.top_features.map(f => Math.abs(f.shap_value))) || 1;

    // Generate 7 SHAP rows
    const shapRows = pred.top_features.map(f => {
      const widthPct = Math.min(100, Math.max(5, (Math.abs(f.shap_value) / maxAbs) * 100)).toFixed(1);
      const isFeatureFraud = f.direction === "fraud";
      const barClass = isFeatureFraud ? "bar-fraud" : "bar-legit";
      const dirClass = isFeatureFraud ? "direction-fraud" : "direction-legit";
      const dirSymbol = isFeatureFraud ? "→ Fraud" : "→ Legit";
      const sign = f.shap_value > 0 ? "+" : "";

      // Clean feature label (remove num__ prefix if present)
      const cleanFeatureName = f.feature.replace(/^num__/, '');

      return `
        <div class="shap-row">
          <span class="shap-feature" title="${f.feature}">${cleanFeatureName}</span>
          <div class="shap-bar-track">
            <div class="shap-bar-fill ${barClass}" style="width: ${widthPct}%;"></div>
          </div>
          <span class="shap-value">${sign}${f.shap_value.toFixed(4)}</span>
          <span class="shap-direction ${dirClass}">${dirSymbol}</span>
        </div>
      `;
    }).join("");

    const verdictBadge = isFraud
      ? `<div class="verdict-badge badge-fraud"><span class="badge-dot"></span> HIGH RISK &bull; FRAUD DETECTED</div>`
      : `<div class="verdict-badge badge-legit"><span class="badge-dot"></span> LOW RISK &bull; LEGITIMATE</div>`;

    const actualClassLabel = pred.actual_class === 1 ? "FRAUD" : "LEGITIMATE";
    const actualClassClass = pred.actual_class === 1 ? "state-fraud" : "state-legit";

    result.innerHTML = `
      <div class="result-wrapper ${isFraud ? 'state-fraud' : 'state-legit'}">
        <div class="verdict-section">
          ${verdictBadge}
        </div>

        <div class="meter-section">
          <div class="section-label">Fraud Probability Assessment</div>
          <div class="meter-track">
            <div class="meter-fill ${isFraud ? 'bar-fraud' : 'bar-legit'}" style="width: ${probPct}%;"></div>
            <div class="meter-threshold" style="left: ${threshPct}%;" title="Production Threshold: ${threshPct}%">
              <div class="meter-threshold-pin"></div>
            </div>
          </div>
          <div class="meter-caption">
            <span class="prob-caption">${probPct}% probability</span>
            <span class="thresh-caption">35.9% threshold</span>
          </div>
        </div>

        <div class="actual-result">
          <span class="actual-label">Actual result (Ground Truth):</span>
          <span class="actual-value ${actualClassClass}">${actualClassLabel}</span>
        </div>

        <div class="shap-container">
          <div class="shap-heading">WHY DID THE MODEL DECIDE THIS?</div>
          <div class="shap-list">
            ${shapRows}
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    result.innerHTML = `<div class="error-text">Failed to analyze transaction. Ensure backend API is active.</div>`;
    console.error("predict fetch failed:", err);
  }
});