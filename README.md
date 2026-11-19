# Highway Rockfall Hazard Classification — Professional Edition

## Run on Windows (PowerShell)

From the `rockfall-insight` directory:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe backend\app.py
```

Open **http://127.0.0.1:5000**. The frontend automatically uses the local `/predict` API. If you previously configured a remote endpoint, opening the local site on port 5000 overrides it.

Check **http://127.0.0.1:5000/health** to verify the loaded model and scikit-learn version.

## Version mismatch resolved

The model was saved with **scikit-learn 1.8.0**. The requirements pin `scikit-learn==1.8.0` so Python does not silently install a different version. Stop your old server (Ctrl+C) before installing the updated requirements.

If you are reusing an existing `.venv`, run:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -c "import sklearn; print(sklearn.__version__)"
.\.venv\Scripts\python.exe backend\app.py
```

The version must print `1.8.0`. The model is a **separately retrained model from the supplied CSV**, not the original fitted estimator from the PDF notebook. Results are hazard-class scores, not event probabilities. The holdout evaluation is not independent-route validation.

## Project folders

- `dist/` — professional responsive frontend
- `backend/app.py` — Flask app and API
- `backend/rockfall_cdot_model.joblib` — trained model
- `backend/train_model.py` — reproducible training script
- `backend/evaluation.json` — model evaluation
- `backend/cdot_clean_dataset.csv` — supplied dataset

Use the development server locally only.
