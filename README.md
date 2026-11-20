# Highway Rockfall Hazard Classification

**Previous version — Random Forest model**

[Live Website](https://highway-rockfall-hazard-classification.onrender.com) · [GitHub Repository](https://github.com/navneet23154036/highway-rockfall-hazard-classification)

## Overview

Highway Rockfall Hazard Classification is a web-based machine learning project designed to support preliminary assessment of rockfall hazards along highway slopes. Users enter slope characteristics and geological assessment information, and the application uses a trained **Random Forest** model to return a hazard classification.

This repository documents the **earlier version** of the project. A newer k=9 ensemble-based version is available separately.

## Features

- Web-based form for entering slope and site assessment data.
- Machine-learning-assisted rockfall hazard classification.
- Clear results interface for reviewing model predictions.
- Responsive frontend connected to a Python Flask backend.
- CDOT-derived slope assessment dataset used for model development.

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | HTML, CSS, JavaScript |
| Backend | Python, Flask |
| Machine learning | scikit-learn, Random Forest |
| Data processing | pandas, NumPy |
| Model serialization | joblib |
| Hosting | Render |

## Repository Structure

```text
highway-rockfall-hazard-classification/
├── app.py                       # Flask web server and prediction API
├── app.js                       # Frontend behavior and API integration
├── index.html                   # Main website
├── style.css                    # Website styling
├── train_model.py               # Model training script
├── rockfall_cdot_model.joblib   # Serialized trained model
├── cdot_clean_dataset.csv       # Processed dataset
├── evaluation.json              # Model evaluation output
├── slope-measurement.gif        # Slope measurement illustration
├── requirements.txt             # Python dependencies
└── README.md
```

> The file listing reflects the earlier project structure. If the repository has changed, update this section accordingly.

## Run Locally

**Requirements:** Python 3 and pip.

```bash
git clone https://github.com/navneet23154036/highway-rockfall-hazard-classification.git
cd highway-rockfall-hazard-classification
python -m venv .venv
```

**Windows PowerShell:**

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:5000` in your browser.

## How It Works

1. Enter the required site, slope geometry and assessment inputs.
2. Submit the assessment from the website.
3. The frontend sends the input data to the Flask prediction endpoint.
4. The trained Random Forest model processes the supplied values.
5. The website displays the resulting hazard assessment.

## Deployment

The project is deployed as a Python web service on Render. With the Flask app exposed as `app` in `app.py`, a typical deployment configuration is:

- **Build command:** `pip install -r requirements.txt`
- **Start command:** `gunicorn app:app`

Ensure `gunicorn` is included in `requirements.txt` and the serialized model is present at the path expected by the application.

## Limitations and Responsible Use

The output is a **model-based screening result**, not a guarantee that a rockfall will or will not occur. Predictions depend on the training data and quality of submitted measurements. Do not use this tool as a substitute for professional geotechnical inspection or safety decisions.

## Updated Version

The newer website uses a **v4 k=9 Gradient Boosting + Ridge ensemble** and provides more detailed score interpretation and PDF reporting.

[Explore the Updated k=9 Website](https://highway-rockfall-k9-hazard-prediction.onrender.com)

## Developer

**Navneet Gupta**

---

*Academic project for highway rockfall hazard assessment and machine learning research.*
 
