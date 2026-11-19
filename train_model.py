"""Train a new CDOT hazard classifier from the supplied CSV (not the original notebook weights)."""
from pathlib import Path
import json
import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, f1_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

HERE = Path(__file__).resolve().parent
DATA = HERE / 'cdot_clean_dataset.csv'
NUMERIC = ['slope_height_ft','slope_angle_deg','slope_length_ft','ditch_slope_deg','ditch_width_ft','ditch_depth_ft','rockfall_freq_score','precip_score','freeze_thaw_score','seepage_score','aspect_score']
CATEGORICAL = ['rock_type','slope_type','region']
FEATURES = NUMERIC + CATEGORICAL

def main():
    df = pd.read_csv(DATA)
    if not set(FEATURES + ['hazard_class']).issubset(df.columns):
        raise ValueError('Dataset lacks required features or target')
    X = df[FEATURES].copy()
    X['region'] = X['region'].astype(str)
    y = df['hazard_class'].astype(int)
    if set(y.unique()) != {0,1,2}:
        raise ValueError('Expected 0=Low, 1=Moderate, 2=High labels')
    train_idx, test_idx = train_test_split(df.index, test_size=.2, random_state=42, stratify=y)
    prep = ColumnTransformer([
        ('num', SimpleImputer(strategy='median'), NUMERIC),
        ('cat', Pipeline([('impute',SimpleImputer(strategy='most_frequent')),('encode',OneHotEncoder(handle_unknown='ignore'))]), CATEGORICAL)
    ])
    model = Pipeline([('preprocessor',prep),('model',RandomForestClassifier(n_estimators=300,min_samples_leaf=2,random_state=42,n_jobs=-1,class_weight='balanced_subsample'))])
    model.fit(X.loc[train_idx],y.loc[train_idx])
    predictions = model.predict(X.loc[test_idx])
    metrics = {'note':'New model trained from provided CSV, not original notebook fitted pipeline. Random stratified holdout; not route-independent validation.', 'training_rows':len(train_idx),'test_rows':len(test_idx),'accuracy':round(float(accuracy_score(y.loc[test_idx],predictions)),4),'macro_f1':round(float(f1_score(y.loc[test_idx],predictions,average='macro')),4),'classification_report':classification_report(y.loc[test_idx],predictions,target_names=['Low','Moderate','High'],output_dict=True,zero_division=0)}
    bundle = {'pipeline':model,'features':FEATURES,'class_names':['Low','Moderate','High'],'alert_threshold':.24,'training_note':'Retrained from supplied CSV; threshold 0.24 from notebook, not recalibrated for this model.'}
    joblib.dump(bundle,HERE/'rockfall_cdot_model.joblib')
    (HERE/'evaluation.json').write_text(json.dumps(metrics,indent=2))
    print(json.dumps({k:v for k,v in metrics.items() if k!='classification_report'},indent=2))
if __name__ == '__main__': main()
