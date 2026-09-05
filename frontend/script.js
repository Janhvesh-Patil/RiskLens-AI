const API_BASE = "http://127.0.0.1:8000";

let validMinId = null;
let validMaxId = null;

// ─── Sample Transactions ───────────────────────────────────────────────────

/**
 * Loads the deterministic 20 sample transactions into the dropdown on page
 * load and populates the ID range hint.
 */
async function loadSampleTransactions() {
  const select = document.getElementById("transaction-select");
  const hint = document.getElementById("range-hint");
  select.innerHTML = `<option value="">Loading sample transactions...</option>`;

  try {
    const res = await fetch(`${API_BASE}/sample-transactions`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.id_range) {
      validMinId = data.id_range.min;
      validMaxId = data.id_range.max;
      if (hint) {
        hint.textContent = `Valid range: ${validMinId}–${validMaxId}`;
      }
    }

    select.innerHTML = `<option value="">-- Select a transaction --</option>`;
    for (const txn of data.samples) {
      const opt = document.createElement("option");
      opt.value = txn.transaction_id;
      const amountStr = typeof txn.Amount === "number" ? txn.Amount.toFixed(2) : txn.Amount;
      opt.textContent = `Transaction ${txn.transaction_id} — €${amountStr}`;
      select.appendChild(opt);
    }
  } catch (err) {
    select.innerHTML = `<option value="">Failed to load transactions (Check API)</option>`;
    console.error("loadSampleTransactions failed:", err);
  }
}

// ─── Mutual Exclusivity ────────────────────────────────────────────────────

/**
 * Updates the visual active/diminished state of the dropdown and search input.
 * State is based purely on whether the search input contains a value:
 *   - Search has a value  → search is active, dropdown is diminished/disabled.
 *   - Search is empty     → dropdown is fully usable, search is available.
 */
function updateMutualExclusiveState() {
  const searchInput = document.getElementById("transaction-search-input");
  const selectWrapper = document.querySelector(".select-wrapper");
  const select = document.getElementById("transaction-select");

  const hasSearchValue = searchInput && searchInput.value.trim() !== "";

  if (hasSearchValue) {
    selectWrapper.classList.add("select-diminished");
    select.disabled = true;
  } else {
    selectWrapper.classList.remove("select-diminished");
    select.disabled = false;
  }
}

// ─── Transaction Details (dropdown selection only) ─────────────────────────

/**
 * Fetches and renders transaction details (ID, Amount, Time) for a given ID.
 * Used when the user selects from the dropdown without triggering prediction.
 * Clears any stale risk result and prompts the user to run Analyze Risk.
 */
async function loadTransactionDetails(id) {
  const details = document.getElementById("transaction-details");
  const result = document.getElementById("risk-result");

  result.innerHTML = `
    <div class="empty-state">
      <p>Click <strong>Analyze Risk</strong> to evaluate Transaction ${id}.</p>
    </div>
  `;

  details.innerHTML = `<div class="loading-text">Loading transaction details...</div>`;

  try {
    const res = await fetch(`${API_BASE}/transaction/${id}`);
    if (!res.ok) {
      if (res.status === 404) {
        const rangeText = (validMinId !== null && validMaxId !== null)
          ? ` Must be between ${validMinId} and ${validMaxId}.`
          : "";
        throw new Error(`Transaction ID ${id} not found.${rangeText}`);
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const txn = await res.json();

    const formattedAmount = typeof txn.Amount === "number"
      ? `€${txn.Amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `€${txn.Amount}`;

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
    details.innerHTML = `<div class="error-text">${err.message || "Failed to load transaction details."}</div>`;
    console.error("transaction fetch failed:", err);
  }
}

// ─── Canonical Analyze Function ────────────────────────────────────────────

/**
 * The single canonical function for analyzing a transaction end-to-end.
 *
 *   1. Shows loading state in both panels immediately.
 *   2. Fetches /transaction/{id} and renders the details panel.
 *      Aborts on any error (including 404) without calling predict.
 *   3. Fetches /predict/{id} and renders the full risk result:
 *      verdict badge, probability meter, ground-truth row, SHAP factors.
 *
 * Both the Analyze Risk button and the search form Enter key call this
 * function directly — no intermediate steps or shared mutable state required.
 */
async function analyzeTransaction(id) {
  const details = document.getElementById("transaction-details");
  const result = document.getElementById("risk-result");

  // Show loading state in both panels immediately
  details.innerHTML = `<div class="loading-text">Loading transaction details...</div>`;
  result.innerHTML = `
    <div class="loading-text">
      <div class="spinner"></div>
      <span>Analyzing transaction...</span>
    </div>
  `;

  // ── Step 1: Fetch and render transaction details ──────────────────────────
  try {
    const res = await fetch(`${API_BASE}/transaction/${id}`);
    if (!res.ok) {
      if (res.status === 404) {
        const rangeText = (validMinId !== null && validMaxId !== null)
          ? ` Must be between ${validMinId} and ${validMaxId}.`
          : "";
        throw new Error(`Transaction ID ${id} not found.${rangeText}`);
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const txn = await res.json();

    const formattedAmount = typeof txn.Amount === "number"
      ? `€${txn.Amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `€${txn.Amount}`;

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
    details.innerHTML = `<div class="error-text">${err.message || "Failed to load transaction details."}</div>`;
    result.innerHTML = `<div class="empty-state"><p>Transaction data could not be loaded.</p></div>`;
    console.error("transaction fetch failed:", err);
    return; // Abort — do not call predict if details failed
  }

  // ── Step 2: Fetch prediction and render risk result ───────────────────────
  try {
    const res = await fetch(`${API_BASE}/predict/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pred = await res.json();

    const isFraud = pred.prediction === "fraud";
    const probPct = (pred.fraud_probability * 100).toFixed(2);
    const threshPct = (pred.threshold * 100).toFixed(1);

    // Max absolute SHAP value for proportional bar scaling
    const maxAbs = Math.max(...pred.top_features.map(f => Math.abs(f.shap_value))) || 1;

    // Build 7 SHAP rows
    const shapRows = pred.top_features.map(f => {
      const widthPct = Math.min(100, Math.max(5, (Math.abs(f.shap_value) / maxAbs) * 100)).toFixed(1);
      const isFeatureFraud = f.direction === "fraud";
      const barClass = isFeatureFraud ? "bar-fraud" : "bar-legit";
      const dirClass = isFeatureFraud ? "direction-fraud" : "direction-legit";
      const dirSymbol = isFeatureFraud ? "→ Fraud" : "→ Legit";
      const sign = f.shap_value > 0 ? "+" : "";

      // Strip technical pipeline prefix (e.g. num__V14 → V14)
      const cleanFeatureName = f.feature.replace(/^num__/, "");

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
      <div class="result-wrapper ${isFraud ? "state-fraud" : "state-legit"}">
        <div class="verdict-section">
          ${verdictBadge}
        </div>

        <div class="meter-section">
          <div class="section-label">Fraud Probability Assessment</div>
          <div class="meter-track">
            <div class="meter-fill ${isFraud ? "bar-fraud" : "bar-legit"}" style="width: ${probPct}%;"></div>
            <div class="meter-threshold" style="left: ${threshPct}%;" title="Decision Threshold: ${threshPct}%">
              <div class="meter-threshold-pin"></div>
            </div>
          </div>
          <div class="meter-caption">
            <span class="prob-caption">${probPct}% probability</span>
            <span class="thresh-caption">${threshPct}% threshold</span>
          </div>
        </div>

        <div class="actual-result">
          <span class="actual-label">Actual result (Ground Truth):</span>
          <span class="actual-value ${actualClassClass}">${actualClassLabel}</span>
        </div>

        <div class="shap-container">
          <div class="shap-heading">KEY RISK FACTORS</div>
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
}

// ─── Event Wiring ──────────────────────────────────────────────────────────

window.addEventListener("DOMContentLoaded", () => {
  loadSampleTransactions();

  const select = document.getElementById("transaction-select");
  const searchInput = document.getElementById("transaction-search-input");
  const searchForm = document.getElementById("search-form");
  const analyzeBtn = document.getElementById("analyze-btn");

  // ── Dropdown change ──────────────────────────────────────────────────────
  select.addEventListener("change", (e) => {
    // Clearing search makes dropdown the active control
    searchInput.value = "";
    updateMutualExclusiveState();

    const id = e.target.value;
    if (!id) {
      // Placeholder selected — reset both panels to their idle states
      document.getElementById("transaction-details").innerHTML = `
        <div class="empty-state">
          <p>Select or search a transaction above to view details.</p>
        </div>
      `;
      document.getElementById("risk-result").innerHTML = `
        <div class="empty-state">
          <p>Click <strong>Analyze Risk</strong> to trigger prediction and SHAP explanation.</p>
        </div>
      `;
      return;
    }

    // Load details only — prediction requires an explicit Analyze Risk click
    loadTransactionDetails(id);
  });

  // ── Search input typing — update mutual exclusive state on every keystroke ─
  searchInput.addEventListener("input", () => {
    updateMutualExclusiveState();
  });

  // ── Search form submit (Enter key in the search field) ───────────────────
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const rawVal = searchInput.value.trim();

    if (!rawVal || isNaN(rawVal) || !Number.isInteger(Number(rawVal))) {
      document.getElementById("transaction-details").innerHTML = `
        <div class="error-text">Please enter a valid numeric Transaction ID.</div>
      `;
      document.getElementById("risk-result").innerHTML = `
        <div class="empty-state">
          <p>Click <strong>Analyze Risk</strong> to trigger prediction and SHAP explanation.</p>
        </div>
      `;
      return;
    }

    // Reset dropdown to placeholder — search is now the active control
    select.value = "";
    updateMutualExclusiveState(); // search has value → dropdown diminished

    analyzeTransaction(rawVal);
  });

  // ── Analyze Risk button ──────────────────────────────────────────────────
  analyzeBtn.addEventListener("click", () => {
    const result = document.getElementById("risk-result");
    const searchVal = searchInput.value.trim();
    const dropdownVal = select.value;

    if (searchVal) {
      // Search input is the active control
      if (isNaN(searchVal) || !Number.isInteger(Number(searchVal))) {
        result.innerHTML = `<div class="error-text">Please enter a valid numeric Transaction ID.</div>`;
        return;
      }
      // Reset dropdown, keep search as the active control
      select.value = "";
      updateMutualExclusiveState();
      analyzeTransaction(searchVal);
    } else if (dropdownVal) {
      // Dropdown is the active control
      analyzeTransaction(dropdownVal);
    } else {
      // Neither control has a selection
      result.innerHTML = `<div class="error-text">Select a transaction first.</div>`;
    }
  });
});