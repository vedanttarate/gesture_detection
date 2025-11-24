from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
import os
import logging
import numpy as np

try:
    import joblib
except Exception:
    joblib = None
import pickle
import pandas as pd

app = FastAPI(title="Gesture Model API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL = None
MODEL_PATH = os.path.join(os.path.dirname(__file__) or ".", "gesture_detection.pkl")
LAST_LOAD_ERROR = None
MODEL_PATH_TRIED = None


def load_model(path: str = None):
    global MODEL
    global LAST_LOAD_ERROR, MODEL_PATH_TRIED
    if path is None:
        path = MODEL_PATH
    if not os.path.exists(path):
        # try to find any .pkl or .joblib file
        cwd = os.path.dirname(__file__) or "."
        for f in os.listdir(cwd):
            if f.endswith('.pkl') or f.endswith('.joblib') or f.endswith('.sav'):
                path = os.path.join(cwd, f)
                break
    MODEL_PATH_TRIED = path
    if not os.path.exists(path):
        logging.warning("Model file not found: %s", path)
        MODEL = None
        LAST_LOAD_ERROR = f"Model file not found: {path}"
        return None

    try:
        if joblib is not None and path.endswith((".joblib", ".pkl", ".sav")):
            MODEL = joblib.load(path)
        else:
            with open(path, 'rb') as fh:
                MODEL = pickle.load(fh)
        logging.info(f"Loaded model from {path}")
    except Exception as ex:
        logging.exception(f"Failed to load model from {path}: {ex}")
        MODEL = None
        LAST_LOAD_ERROR = str(ex)
    return MODEL


@app.get("/model_info")
def model_info():
    """Return debug info about model load for diagnosing 503 errors."""
    return {
        "model_loaded": MODEL is not None,
        "model_path_tried": MODEL_PATH_TRIED,
        "last_load_error": LAST_LOAD_ERROR,
    }


@app.on_event("startup")
def startup_event():
    load_model()


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": MODEL is not None}


@app.post("/predict")
async def predict(rows: List[Dict[str, Any]]):
    if MODEL is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    if not isinstance(rows, list) or len(rows) == 0:
        raise HTTPException(status_code=400, detail="Request body must be a non-empty JSON array of objects")

    try:
        df = pd.DataFrame(rows)
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"Failed to parse input rows into DataFrame: {ex}")

    try:
        preds = MODEL.predict(df)
    except Exception as e1:
        try:
            preds = MODEL.predict(df.values)
        except Exception as e2:
            logging.exception("Prediction failed")
            raise HTTPException(status_code=500, detail=f"Model prediction failed: {e1}; {e2}")

    confidences = None
    if hasattr(MODEL, 'predict_proba'):
        try:
            probs = MODEL.predict_proba(df)
            if isinstance(probs, list):
                probs = np.array(probs)
            confidences = probs.max(axis=1).tolist()
        except Exception:
            confidences = None

    out = []
    for i, p in enumerate(preds):
        # Convert numpy types to Python native types for JSON serialization
        if isinstance(p, (np.integer, np.floating)):
            p = p.item()
        entry = {"prediction": p}
        if confidences is not None:
            try:
                entry["confidence"] = float(confidences[i])
            except Exception:
                entry["confidence"] = None
        out.append(entry)
    return out


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000, reload=True)
