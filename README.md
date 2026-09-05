# RiskLens-AI

**Razorpay AI Buildathon — AI Risk Manager track**

A transaction-level fraud classifier with SHAP-based explainability, served through a FastAPI backend and a light, judge-facing web dashboard.

## What this is (and isn't)

RiskLens-AI demonstrates the _decisioning and evaluation methodology_ a production fraud system needs — honest held-out metrics, a cost-aware decision threshold, and per-transaction explainability — not a deployable Razorpay production model. Real feature engineering from raw payment data is proprietary infrastructure, out of scope for a public dataset project.

The dataset (`mlg-ulb/creditcardfraud` on Kaggle) contains real, PCA-anonymized European credit card transactions (`V1`–`V28`), plus `Time` and `Amount` in **euros** — not rupees, despite the demo's Razorpay-adjacent styling. Amounts are shown in `€` throughout to avoid misrepresenting the source data.

Because `V1`–`V28` are opaque PCA components, there is no way for a user to meaningfully type them into a form. The UI instead lets a user pick or search a real transaction from the held-out test set and see the model's live decision on it.

## Model

- **Random Forest** inside a single scikit-learn `Pipeline` (custom `AmountTransformer` for `log1p` + scaling, wrapped with a `ColumnTransformer`, feeding a `RandomForestClassifier`).
- **Decision threshold: 0.359** — not the default 0.5. Chosen via a cost model (false negative = actual amount lost, false positive = flat €50 manual-review cost), picking the cheapest threshold that still holds ≥75% recall.
- Compared against Logistic Regression and Naive Bayes; Random Forest won clearly on precision, F1, and total cost.

**Held-out test set metrics** (56,746 transactions, 95 actual fraud cases):

| Metric    | Value  |
| --------- | ------ |
| Precision | 0.902  |
| Recall    | 0.779  |
| F1        | 0.836  |
| Accuracy  | 0.9995 |

These are reproduced independently by evaluating the saved `model.pkl` end-to-end against the exported test set — not copied from training-time notebook output — and matched exactly.

## Architecture

```
backend/
├── main.py              # FastAPI app — 4 endpoints, loads artifacts once at startup
├── ml_service.py         # Model loading, prediction, SHAP explanation — no FastAPI dependency
├── preprocessing.py      # AmountTransformer — must be imported before joblib.load(model.pkl)
├── model.pkl              # Fitted sklearn Pipeline (preprocessing + classifier)
├── feature_names.pkl      # Transformed feature names, in ColumnTransformer's fitted order
├── shap_explainer.pkl     # Pre-built shap.TreeExplainer on the RF step
├── test_transactions.csv  # Exported held-out test set, with transaction_id + Class
└── requirements.txt

frontend/
├── index.html
├── style.css
└── script.js              # Vanilla JS — no build step, no framework
```

`ml_service.py` is deliberately independent of `transaction_id` and `actual_class` — those belong to the data/API layer, not the model layer. It was tested standalone (via a throwaway script, not shipped) before any HTTP layer was built on top of it.

## API

| Endpoint                   | Purpose                                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`              | Liveness check                                                                                                                     |
| `GET /sample-transactions` | 20 deterministic transactions (10 legit + 10 fraud, `random_state=42`) for the dropdown, plus the full valid ID range              |
| `GET /transaction/{id}`    | Raw transaction fields (`Class` withheld) for any of the 56,746 test-set IDs                                                       |
| `GET /predict/{id}`        | Fraud probability, `fraud`/`legit` label at threshold 0.359, ground-truth `actual_class`, and the top 7 SHAP feature contributions |

CORS is wide open (`allow_origins=["*"]`) — this is a local-only demo, not a deployment-hardened API.

## Running it

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Open `frontend/index.html` directly in a browser (no server required — verified working over `file://`, including CORS).

A Bruno API collection (`bruno/`) covers all four endpoints, including invalid-ID error cases, and was used to independently verify the API outside of Swagger UI.

## Explainability

Each prediction returns the top 7 SHAP feature contributions (by absolute value) from a pre-built `TreeExplainer`, with sign indicating direction (positive → pushes toward fraud, negative → pushes toward legit). The SHAP baseline sits near 0.498 rather than the true ~0.17% fraud rate — an expected consequence of `class_weight='balanced'` shifting the model's decision function, verified correct via the additivity check (`base_value + sum(shap_values) == predict_proba output`).

## What broke, and how I caught it

I'm documenting these instead of polishing them away, because catching them was as much the point of this build as shipping the feature itself.

- **`pandas` was silently upcasting `transaction_id` to a float** (`936` turning into `936.0`) whenever a single mixed-dtype row was pulled with `.loc[id]` and dumped via `.to_dict()`. Swagger's rendered response view showed a clean `936` and I almost signed off on it — the bug only showed up once I bypassed the UI and hit the endpoint with a raw HTTP call and read the actual JSON bytes. Fixed by explicitly re-casting the ID field after the dict conversion, and it taught me not to trust a pretty-printed response panel over the wire format.
- **I misjudged the test set's fraud count by eyeballing a filtered spreadsheet** — saw what looked like 4 fraud rows and almost built the demo's sample selection around that number. It didn't survive contact with my own earlier metrics: a recall of 0.779 is mathematically impossible with only 4 actual fraud cases in the denominator. Running `value_counts()` instead of scrolling a filtered view gave the real number — 95 — and was the reminder I needed that a spreadsheet filter narrows what you _see_, not what exists.
- **A UI caption was displaying a hardcoded `"35.9%"` string instead of the live threshold value** coming back from the API. It looked completely correct on screen because the two numbers happened to match — the bug was only visible by reading the actual line of code, not by looking at the rendered page.
- **Currency mismatch** — the dataset is European, and my first UI pass defaulted to `₹` with Indian-style digit grouping applied on top of Euro amounts. Caught before it shipped by remembering the actual provenance of the dataset instead of leaning on the demo's Razorpay-adjacent branding.

## Known limitations

- Dropdown sample set is fixed and curated (10 legit + 10 fraud); the search box allows querying any of the 56,746 real test-set transactions directly.
- No authentication, database, or POST endpoints — intentionally out of scope for this demo.
- Not a production-ready fraud pipeline — see "What this is (and isn't)" above.
