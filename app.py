 
"""Flask backend for Highway Rockfall Hazard Classification."""

import math
import os
from pathlib import Path

import joblib
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
 
ROOT = Path(__file__).resolve().parent

app = Flask(
    __name__,
    static_folder=str(ROOT),
    static_url_path=""
)

app.config["MAX_CONTENT_LENGTH"] = 32 * 1024

origins = [
    x.strip()
    for x in os.environ.get(
        "FRONTEND_ORIGINS",
        "http://127.0.0.1:5000,http://localhost:5000"
    ).split(",")
    if x.strip()
]

CORS(
    app,
    resources={r"/predict": {"origins": origins}},
    supports_credentials=False
)

MODEL_PATH = Path(
    os.environ.get(
        "MODEL_PATH",
        str(ROOT / "rockfall_cdot_model.joblib")
    )
)

 

NUMERIC = [
    "slope_height_ft",
    "slope_angle_deg",
    "slope_length_ft",
    "ditch_slope_deg",
    "ditch_width_ft",
    "ditch_depth_ft"
]

RATINGS = [
    "rockfall_freq_score",
    "precip_score",
    "freeze_thaw_score",
    "seepage_score",
    "aspect_score"
]

REQUIRED = NUMERIC + RATINGS + [
    "rock_type",
    "slope_type",
    "region"
]

_bundle = None

def get_bundle():
    global _bundle

    if _bundle is None:

        if not MODEL_PATH.is_file():
            raise FileNotFoundError(
                "Model file not found: "
                + str(MODEL_PATH)
            )

        # Load only a trusted model file.
        candidate = joblib.load(MODEL_PATH)

        required_keys = {
            "pipeline",
            "features",
            "class_names",
            "alert_threshold"
        }

        if (
            not isinstance(candidate, dict)
            or not required_keys.issubset(candidate)
        ):
            raise ValueError(
                "Invalid model bundle format."
            )

        if (
            len(candidate["features"]) != len(REQUIRED)
            or set(candidate["features"]) != set(REQUIRED)
        ):
            raise ValueError(
                "Model features do not match the API."
            )

        if candidate["class_names"] != [
            "Low", "Moderate", "High"
        ]:
            raise ValueError(
                "Unexpected hazard class names."
            )

        threshold = float(
            candidate["alert_threshold"]
        )

        if (
            not math.isfinite(threshold)
            or not 0 <= threshold <= 1
        ):
            raise ValueError(
                "Invalid model threshold."
            )

        _bundle = candidate

    return _bundle

 
def validate(payload):

    if not isinstance(payload, dict):
        raise ValueError(
            "Expected one JSON object."
        )

    missing = set(REQUIRED) - payload.keys()

    if missing:
        raise ValueError(
            "Missing fields: "
            + ", ".join(sorted(missing))
        )

    row = {
        key: payload[key]
        for key in REQUIRED
    }

    for key in NUMERIC + RATINGS:

        if isinstance(row[key], bool):
            raise ValueError(
                key + " must be numeric."
            )

        try:
            value = float(row[key])
        except (TypeError, ValueError):
            raise ValueError(
                key + " must be numeric."
            ) from None

        if not math.isfinite(value) or value < 0:
            raise ValueError(
                key + " must be a finite nonnegative number."
            )

        if key in (
            "slope_angle_deg",
            "ditch_slope_deg"
        ) and value > 90:
            raise ValueError(
                key + " must be between 0 and 90 degrees."
            )

        if key in RATINGS and value not in (
            3, 9, 27, 81
        ):
            raise ValueError(
                key + " must be 3, 9, 27 or 81."
            )

        row[key] = value

    if row["rock_type"] not in (
        "Crystalline",
        "Sedimentary",
        "Block in matrix"
    ):
        raise ValueError(
            "Unknown rock type."
        )

    if row["slope_type"] not in (
        "Cut", "Total"
    ):
        raise ValueError(
            "Unknown slope type."
        )

    try:
        region = float(row["region"])
    except (TypeError, ValueError):
        raise ValueError(
            "Region must be a positive integer."
        ) from None

    if (
        isinstance(row["region"], bool)
        or not math.isfinite(region)
        or region < 1
        or not region.is_integer()
    ):
        raise ValueError(
            "Region must be a positive integer."
        )

    row["region"] = str(int(region))

    return row

 

@app.get("/")
def index():
    return send_from_directory(
        app.static_folder,
        "index.html"
    )

 

@app.get("/health")
def health():

    bundle = get_bundle()

    return jsonify({
        "status": "ok",
        "model": "Random Forest",
        "feature_count": len(bundle["features"]),
        "classes": bundle["class_names"]
    })

 

@app.post("/predict")
def predict():

    if not request.is_json:
        return jsonify({
            "error": "Content-Type must be application/json."
        }), 415

    try:
        row = validate(
            request.get_json(silent=True)
        )

    except ValueError as exc:
        return jsonify({
            "error": str(exc)
        }), 400

    try:
        bundle = get_bundle()

        input_df = pd.DataFrame([row])[
            bundle["features"]
        ]

        probabilities = (
            bundle["pipeline"]
            .predict_proba(input_df)[0]
        )

        labels = bundle["pipeline"].classes_

        class_map = {
            int(label): float(prob)
            for label, prob in zip(
                labels, probabilities
            )
        }

        if set(class_map) != {0, 1, 2}:
            raise ValueError(
                "Unexpected model class labels."
            )

        winner = max(
            class_map,
            key=class_map.get
        )

        names = bundle["class_names"]

        result = {
            "hazard_class": names[winner],

            "class_probabilities_pct": {
                names[k]: round(
                    100 * class_map[k], 1
                )
                for k in (0, 1, 2)
            },

            "p_high_pct": round(
                100 * class_map[2], 1
            ),

            "alert": (
                class_map[2]
                >= float(
                    bundle["alert_threshold"]
                )
            ),

            "threshold_pct": (
                100 * float(
                    bundle["alert_threshold"]
                )
            )
        }

        return jsonify(result)

    except Exception:
        app.logger.exception(
            "Prediction failed"
        )

        return jsonify({
            "error": (
                "Model inference failed. "
                "Check model compatibility and inputs."
            )
        }), 500

 

# Load the model once before serving requests.
get_bundle()

if __name__ == "__main__":

    port = int(
        os.environ.get("PORT", 5000)
    )

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )
