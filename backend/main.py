from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from ml_service import FraudModelService, RAW_FEATURE_ORDER


# Project structure:
#
# RiskLens-AI/
# ├── backend/
# │   ├── main.py
# │   ├── ml_service.py
# │   ├── model.pkl
# │   ├── feature_names.pkl
# │   ├── shap_explainer.pkl
# │   └── test_transactions.csv
# └── frontend/
#     └── index.html
#
# BASE_DIR points to the project root: RiskLens-AI/
BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR / "backend"


app = FastAPI(title="RiskLens-AI")


# Local-only hackathon demo.
# The frontend may be opened via file:// or served separately.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Load the model artifacts once when the API starts.
service = FraudModelService(
    model_path=BACKEND_DIR / "model.pkl",
    feature_names_path=BACKEND_DIR / "feature_names.pkl",
    explainer_path=BACKEND_DIR / "shap_explainer.pkl",
)


# Load the test transactions once when the API starts.
DATA = pd.read_csv(BACKEND_DIR / "test_transactions.csv")
DATA_BY_ID = DATA.set_index("transaction_id", drop=False)


# Deterministic sample for the frontend/demo.
# The same 20 transactions are returned every time.
SAMPLE_IDS = sorted(
    DATA["transaction_id"].sample(n=20, random_state=42).tolist()
)

MIN_ID = int(DATA["transaction_id"].min())
MAX_ID = int(DATA["transaction_id"].max())


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/sample-transactions")
def sample_transactions():
    rows = DATA_BY_ID.loc[
        SAMPLE_IDS,
        ["transaction_id", "Time", "Amount"],
    ]

    return {
        "id_range": {
            "min": MIN_ID,
            "max": MAX_ID,
        },
        "samples": rows.to_dict(orient="records"),
    }


@app.get("/transaction/{transaction_id}")
def get_transaction(transaction_id: int):
    if transaction_id not in DATA_BY_ID.index:
        raise HTTPException(
            status_code=404,
            detail=f"transaction_id must be between {MIN_ID} and {MAX_ID}",
        )

    row = DATA_BY_ID.loc[transaction_id]

    # Return the raw model input features.
    # Class is intentionally excluded so the endpoint does not
    # reveal the ground truth before prediction.
    fields = ["transaction_id"] + RAW_FEATURE_ORDER

    result = row[fields].to_dict()
    result["transaction_id"] = int(transaction_id)  # <-- added: undo pandas' row-wide float upcast
    return result


@app.get("/predict/{transaction_id}")
def predict(transaction_id: int):
    if transaction_id not in DATA_BY_ID.index:
        raise HTTPException(
            status_code=404,
            detail=f"transaction_id must be between {MIN_ID} and {MAX_ID}",
        )

    row = DATA_BY_ID.loc[transaction_id]

    # Extract only the raw features expected by the ML service.
    txn = {
        col: row[col]
        for col in RAW_FEATURE_ORDER
    }

    result = service.predict_one(txn)

    return {
        "transaction_id": int(transaction_id),
        "fraud_probability": result["fraud_probability"],
        "prediction": result["prediction"],
        "threshold": result["threshold"],
        "actual_class": int(row["Class"]),
        "top_features": result["top_features"],
    }