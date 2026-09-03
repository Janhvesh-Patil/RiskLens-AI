"""
Standalone fraud model service. No FastAPI here on purpose — test this
directly in a Python shell before any HTTP layer touches it.

Depends on preprocessing.py being importable BEFORE joblib.load(model.pkl)
runs, because model.pkl was pickled with a ColumnTransformer step that
references preprocessing.AmountTransformer by class identity.
"""

import numpy as np
import pandas as pd
import joblib
from preprocessing import AmountTransformer  # noqa: F401 — required before joblib.load

THRESHOLD = 0.359
RAW_FEATURE_ORDER = ["Time"] + [f"V{i}" for i in range(1, 29)] + ["Amount"]
TOP_N_FEATURES = 7


class FraudModelService:
    def __init__(
        self,
        model_path="model.pkl",
        feature_names_path="feature_names.pkl",
        explainer_path="shap_explainer.pkl",
    ):
        self.model = joblib.load(model_path)
        self.feature_names = joblib.load(feature_names_path)
        self.explainer = joblib.load(explainer_path)

        # Verified against notebook cells 72/92 — these are the actual
        # named_steps keys, not a guess. If this raises KeyError, the
        # model.pkl you're loading was NOT built by this notebook's
        # pipeline, and nothing below this point can be trusted.
        self.preprocessor = self.model.named_steps["preprocessor"]
        self.classifier = self.model.named_steps["model"]

    def predict_one(self, transaction: dict) -> dict:
        """
        transaction: dict with keys Time, V1..V28, Amount (raw, untransformed).
        Returns probability, readable prediction label, and top-N SHAP features.
        Does NOT know about transaction_id or actual_class — that's the
        API layer's job, since those come from the CSV, not the model.
        """
        missing = [c for c in RAW_FEATURE_ORDER if c not in transaction]
        if missing:
            raise ValueError(f"Missing required raw features: {missing}")

        row = pd.DataFrame([transaction], columns=RAW_FEATURE_ORDER)

        proba = float(self.model.predict_proba(row)[0, 1])
        is_fraud = proba >= THRESHOLD

        transformed = self.preprocessor.transform(row)
        shap_values = self.explainer.shap_values(transformed)

        # Ported verbatim from notebook cell 99 (calculate_shap_values) —
        # not a guess, this already handles both old-SHAP (list) and
        # new-SHAP (3D array) return shapes.
        if isinstance(shap_values, list):
            sv = shap_values[1][0]
        elif shap_values.ndim == 3:
            sv = shap_values[0, :, 1]
        else:
            sv = shap_values[0]

        if len(sv) != len(self.feature_names):
            raise RuntimeError(
                f"SHAP values length ({len(sv)}) doesn't match "
                f"feature_names length ({len(self.feature_names)}) — "
                f"the shap_values branch above picked the wrong shape."
            )

        top = sorted(
            zip(self.feature_names, sv), key=lambda pair: abs(pair[1]), reverse=True
        )[:TOP_N_FEATURES]

        return {
            "fraud_probability": round(proba, 4),
            "prediction": "fraud" if is_fraud else "legit",
            "threshold": THRESHOLD,
            "top_features": [
                {
                    "feature": name,
                    "shap_value": round(float(val), 4),
                    "direction": "fraud" if val > 0 else "legit",
                }
                for name, val in top
            ],
        }


if __name__ == "__main__":
    # Quick standalone smoke test. Run this file directly:
    #   python ml_service.py
    # from inside backend/, with model.pkl / feature_names.pkl /
    # shap_explainer.pkl / test_transactions.csv all present.

    service = FraudModelService()
    print("Loaded model:", type(service.model))
    print("Preprocessor:", type(service.preprocessor))
    print("Classifier:", type(service.classifier))
    print("Feature count:", len(service.feature_names))
    print("First 5 feature names:", service.feature_names[:5])
    print()

    df = pd.read_csv("test_transactions.csv")

    # One legit and one fraud row, deterministic — same two rows every run.
    legit_row = df[df["Class"] == 0].iloc[0]
    fraud_row = df[df["Class"] == 1].iloc[0]

    for label, row in [("LEGIT (actual)", legit_row), ("FRAUD (actual)", fraud_row)]:
        txn = {col: row[col] for col in RAW_FEATURE_ORDER}
        result = service.predict_one(txn)
        print(f"--- {label} — transaction_id {int(row['transaction_id'])} ---")
        print("  fraud_probability:", result["fraud_probability"])
        print("  prediction:", result["prediction"])
        print("  actual_class:", int(row["Class"]))
        print("  top_features:")
        for f in result["top_features"]:
            print(f"    {f['feature']:20s} shap={f['shap_value']:+.4f}  ({f['direction']})")
        print()