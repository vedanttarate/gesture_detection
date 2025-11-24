# Gesture Detection — Real-time Prediction

This project contains a frontend (`index.html`, `app.js`) and a small FastAPI server to run predictions with a trained model saved as `gesture_detection.pkl`.

Quick steps

1. Put your model file `gesture_detection.pkl` in the project root `d:\CMI_gesture_detection_final`.
2. Install dependencies and run the API (PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python server.py
# or
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

3. Open `index.html` in a browser. In `app.js` the `API_URL` defaults to `http://localhost:8000/predict`.

Usage notes

- The frontend sends a JSON array of objects to `/predict`. Each object keys must match the feature names expected by your model.
- If your model requires preprocessing (scalers, encoders), save a pipeline (sklearn Pipeline) that includes preprocessing so the server can use it directly.
- The server will return an array of objects like `[{"prediction":"label","confidence":0.92}, ...]` when possible.

Security

- CORS is wide open for local testing. Restrict origins before deploying.

Troubleshooting

- If predictions fail due to column mismatch, ensure the incoming JSON columns match the model's expected features (or save a pipeline that handles this). If needed, provide the feature order and I can add automatic reordering.
 uvicorn server:app --reload --host 0.0.0.0 --port 8000