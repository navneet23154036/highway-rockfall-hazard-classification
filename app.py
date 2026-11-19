"""Local adapter for the model bundle exported by the supplied CDOT notebook."""
import math
import os
from pathlib import Path
import joblib
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

ROOT = Path(__file__).resolve().parents[1]
app = Flask(__name__, static_folder=str(ROOT / 'dist'), static_url_path='')
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024
origins = [x.strip() for x in os.environ.get('FRONTEND_ORIGINS', 'http://127.0.0.1:5000,http://localhost:5000').split(',') if x.strip()]
CORS(app, resources={r'/predict': {'origins': origins}}, supports_credentials=False)
MODEL_PATH = Path(os.environ.get('MODEL_PATH', str(Path(__file__).with_name('rockfall_cdot_model.joblib'))))
NUMERIC = ['slope_height_ft', 'slope_angle_deg', 'slope_length_ft', 'ditch_slope_deg', 'ditch_width_ft', 'ditch_depth_ft']
RATINGS = ['rockfall_freq_score', 'precip_score', 'freeze_thaw_score', 'seepage_score', 'aspect_score']
REQUIRED = NUMERIC + RATINGS + ['rock_type', 'slope_type', 'region']
_bundle = None

def get_bundle():
    global _bundle
    if _bundle is None:
        if not MODEL_PATH.is_file():
            raise FileNotFoundError('Place rockfall_cdot_model.joblib in the backend directory.')
        # Only load your own trusted notebook export; never accept an uploaded pickle.
        candidate = joblib.load(MODEL_PATH)
        if not isinstance(candidate, dict) or not {'pipeline', 'features', 'class_names', 'alert_threshold'} <= candidate.keys():
            raise ValueError('The file must be the dictionary bundle exported by the supplied notebook.')
        if set(candidate['features']) != set(REQUIRED) or candidate['class_names'] != ['Low', 'Moderate', 'High']:
            raise ValueError('The model bundle does not match the 14-feature CDOT interface.')
        threshold = float(candidate['alert_threshold'])
        if not math.isfinite(threshold) or not 0 <= threshold <= 1:
            raise ValueError('Invalid threshold in model bundle.')
        _bundle = candidate
    return _bundle

def validate(payload):
    if not isinstance(payload, dict):
        raise ValueError('Expected one JSON object.')
    missing = set(REQUIRED) - payload.keys()
    if missing:
        raise ValueError('Missing fields: ' + ', '.join(sorted(missing)))
    row = {key: payload[key] for key in REQUIRED}
    for key in NUMERIC + RATINGS:
        if isinstance(row[key], bool):
            raise ValueError(key + ' must be numeric.')
        try:
            value = float(row[key])
        except (TypeError, ValueError):
            raise ValueError(key + ' must be numeric.') from None
        if not math.isfinite(value) or value < 0:
            raise ValueError(key + ' must be a finite nonnegative number.')
        if key in ('slope_angle_deg', 'ditch_slope_deg') and value > 90:
            raise ValueError(key + ' must be between 0 and 90 degrees.')
        if key in RATINGS and value not in (3, 9, 27, 81):
            raise ValueError(key + ' must be 3, 9, 27 or 81.')
        row[key] = value
    if row['rock_type'] not in ('Crystalline', 'Sedimentary', 'Block in matrix'):
        raise ValueError('Unknown rock type.')
    if row['slope_type'] not in ('Cut', 'Total'):
        raise ValueError('Unknown slope type.')
    try:
        region = float(row['region'])
    except (TypeError, ValueError):
        raise ValueError('Region must be a positive integer.') from None
    if isinstance(row['region'], bool) or not math.isfinite(region) or region < 1 or not region.is_integer():
        raise ValueError('Region must be a positive integer.')
    row['region'] = str(int(region))
    return row

# Load once during application startup rather than on the first prediction.
get_bundle()

@app.get('/health')
def health():
    bundle = get_bundle()
    return jsonify(status='ok', model='Random Forest', sklearn_version=__import__('sklearn').__version__, feature_count=len(bundle['features']))

@app.get('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.post('/predict')
def predict():
    if not request.is_json:
        return jsonify(error='Content-Type must be application/json.'), 415
    try:
        row = validate(request.get_json(silent=True))
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    try:
        bundle = get_bundle()
    except FileNotFoundError as exc:
        return jsonify(error=str(exc)), 503
    except Exception:
        app.logger.exception('Model load failed')
        return jsonify(error='Could not load the model. Check the export and training package versions.'), 503
    try:
        probabilities = bundle['pipeline'].predict_proba(pd.DataFrame([row])[bundle['features']])[0]
        labels = bundle['pipeline'].classes_
        class_map = {int(label): float(p) for label, p in zip(labels, probabilities)}
        if set(class_map) != {0, 1, 2}:
            raise ValueError('Unexpected model class labels.')
        winner = max(class_map, key=class_map.get)
        names = bundle['class_names']
        return jsonify(hazard_class=names[winner], class_probabilities_pct={names[k]: round(100 * class_map[k], 1) for k in (0, 1, 2)}, p_high_pct=round(100 * class_map[2], 1), alert=class_map[2] >= float(bundle['alert_threshold']), threshold_pct=100 * float(bundle['alert_threshold']))
    except Exception:
        app.logger.exception('Prediction failed')
        return jsonify(error='Model inference failed. Check the model feature schema and training environment.'), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=False)
