#!/usr/bin/env python3
"""
Retrain the model on combined A.0 + A.1 + A.2 + A.3 (10k training data)
"""
import joblib
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from xgboost import XGBClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score

# Load all A datasets
dfs = []
for i in range(4):
    if i == 0:
        df = pd.read_csv("data/A.0_train.csv")
    else:
        df = pd.read_csv(f"data/A.{i}_train.csv")
    dfs.append(df)
A_all = pd.concat(dfs, ignore_index=True)
print(f"A training data: {len(A_all)} rows, churn={A_all['Churned'].mean():.1%}")

# Load all B datasets for testing
b_dfs = []
for i in range(4):
    if i == 0:
        df = pd.read_csv("data/B.0_test.csv")
    else:
        df = pd.read_csv(f"data/B.{i}_test.csv")
    b_dfs.append(df)
B_all = pd.concat(b_dfs, ignore_index=True)
print(f"B test data: {len(B_all)} rows, churn={B_all['Churned'].mean():.1%}")

# 28 features + Treatment_Unavailable
NUM_COLS = ["Age", "BMI", "Smoker", "BloodPressure", "Diabetes", "Dependents",
            "Star_Rating", "Rural", "Dual_Eligible", "Chronic_Burden", "Tenure_Months",
            "Avg_Out_Of_Pocket_Cost", "Premium_Delay_Days", "Billing_Issues",
            "Distance_To_Facility_Miles", "Missed_Appointments", "Claim_Denials",
            "Prior_Auth_Delays", "Grievances_90d", "Service_Contacts", "Pharmacy_Fills",
            "Medication_Adherence", "Days_Since_Last_Visit", "Overall_Satisfaction",
            "Treatment_Unavailable"]
CAT_COLS = ["Sex", "City", "Hereditary_Diseases", "Plan_Type"]
ALL_COLS = NUM_COLS + CAT_COLS

preprocessor = ColumnTransformer([
    ("num", StandardScaler(), NUM_COLS),
    ("cat", OneHotEncoder(handle_unknown="ignore"), CAT_COLS),
])

churn_rate = A_all["Churned"].mean()
MODELS = {
    "Logistic Regression": LogisticRegression(max_iter=2000, random_state=42, class_weight="balanced"),
    "Random Forest": RandomForestClassifier(n_estimators=300, random_state=42, class_weight="balanced_subsample", min_samples_leaf=4),
    "Gradient Boosting": GradientBoostingClassifier(random_state=42, learning_rate=0.05, n_estimators=500),
    "XGBoost": XGBClassifier(n_estimators=400, random_state=42, eval_metric="logloss", n_jobs=-1,
                             scale_pos_weight=(1-churn_rate)/churn_rate, learning_rate=0.06, max_depth=4, subsample=0.9),
}

X_train, X_test, y_train, y_test = train_test_split(A_all[ALL_COLS], A_all["Churned"], test_size=0.2, random_state=42, stratify=A_all["Churned"])

results = {}
for name, model in MODELS.items():
    pipe = Pipeline([("pre", preprocessor), ("model", model)])
    pipe.fit(X_train, y_train)
    y_proba = pipe.predict_proba(X_test)[:, 1]
    y_pred = (y_proba >= 0.37).astype(int)
    results[name] = {
        "AUC": roc_auc_score(y_test, y_proba),
        "Acc": accuracy_score(y_test, y_pred),
        "Prec": precision_score(y_test, y_pred),
        "Rec": recall_score(y_test, y_pred),
        "F1": f1_score(y_test, y_pred),
    }
    print(f'{name}: AUC={results[name]["AUC"]:.3f} Acc={results[name]["Acc"]:.3f} Prec={results[name]["Prec"]:.3f} Rec={results[name]["Rec"]:.3f} F1={results[name]["F1"]:.3f}')

# Ensemble on A test
ens_proba = np.mean([pipe.predict_proba(X_test)[:, 1] for pipe in 
                     [Pipeline([("pre", preprocessor), ("model", m)]) for m in MODELS.values()]], axis=0)
ens_pred = (ens_proba >= 0.37).astype(int)
print(f'\nEnsemble on A test: Acc={accuracy_score(y_test, ens_pred):.3f} Prec={precision_score(y_test, ens_pred):.3f} Rec={recall_score(y_test, ens_pred):.3f} F1={f1_score(y_test, ens_pred):.3f} AUC={roc_auc_score(y_test, ens_proba):.3f}')

# Test on B datasets
Xb = B_all[ALL_COLS]
yb = B_all["Churned"]
ens_proba_b = np.mean([pipe.predict_proba(Xb)[:, 1] for pipe in 
                       [Pipeline([("pre", preprocessor), ("model", m)]) for m in MODELS.values()]], axis=0)
ens_pred_b = (ens_proba_b >= 0.37).astype(int)
print(f'\nEnsemble on B (never seen): Acc={accuracy_score(yb, ens_pred_b):.3f} Prec={precision_score(yb, ens_pred_b):.3f} Rec={recall_score(yb, ens_pred_b):.3f} F1={f1_score(yb, ens_pred_b):.3f} AUC={roc_auc_score(yb, ens_proba_b):.3f}')

# Train final models on full A data
final_models = {}
for name, model in MODELS.items():
    pipe = Pipeline([("pre", preprocessor), ("model", model)])
    pipe.fit(A_all[ALL_COLS], A_all["Churned"])
    final_models[name] = pipe

# Save artifacts
joblib.dump({
    'preprocessor': preprocessor,
    'models': final_models,
    'NUM_COLS': NUM_COLS,
    'CAT_COLS': CAT_COLS,
    'best_thr': 0.37
}, "models/expanded_final_pipelines.pkl")

# Save ensemble weights (use CV AUC on A as weights)
cv_weights = {}
for name, model in MODELS.items():
    pipe = Pipeline([("pre", preprocessor), ("model", model)])
    from sklearn.model_selection import cross_val_score
    cv_auc = cross_val_score(pipe, A_all[ALL_COLS], A_all["Churned"], cv=5, scoring="roc_auc").mean()
    cv_weights[name] = cv_auc

joblib.dump(cv_weights, "models/final_weights.pkl")
joblib.dump(preprocessor, "models/final_preprocessor.pkl")
joblib.dump(ALL_COLS, "models/final_input_columns.pkl")

print("\nModel artifacts saved to models/")
print("Weights:", {k: f"{v:.3f}" for k, v in cv_weights.items()})