"""
Train XGBoost on combined A.0-A.3 (10k members) - ML Engineer's final model.
Trains the churn probability model + saves artifact.
"""
import pandas as pd, numpy as np, joblib, time, os
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.metrics import roc_auc_score, accuracy_score, precision_score, recall_score, f1_score

t0 = time.time()
dfs = [pd.read_csv(f"data/real_world/A.{i}_train.csv") for i in range(4)]
A = pd.concat(dfs, ignore_index=True)
print(f"Data: {len(A)} rows, churn={A['Churned'].mean():.1%}")

NUM_COLS = ["Age","BMI","Smoker","BloodPressure","Diabetes","Dependents","Star_Rating","Rural",
            "Dual_Eligible","Chronic_Burden","Tenure_Months","Avg_Out_Of_Pocket_Cost",
            "Premium_Delay_Days","Billing_Issues","Distance_To_Facility_Miles","Missed_Appointments",
            "Claim_Denials","Prior_Auth_Delays","Grievances_90d","Service_Contacts","Pharmacy_Fills",
            "Medication_Adherence","Days_Since_Last_Visit","Overall_Satisfaction","Treatment_Unavailable"]
CAT_COLS = ["Sex","City","Hereditary_Diseases","Plan_Type"]

pre = ColumnTransformer([("num", StandardScaler(), NUM_COLS),
                         ("cat", OneHotEncoder(handle_unknown="ignore"), CAT_COLS)])
X = A[NUM_COLS+CAT_COLS]; y = A["Churned"]
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
Xtr_p = pre.fit_transform(Xtr); Xte_p = pre.transform(Xte)

churn_rate = ytr.mean()
model = XGBClassifier(n_estimators=400, random_state=42, eval_metric="logloss", n_jobs=-1,
                      scale_pos_weight=(1-churn_rate)/churn_rate, learning_rate=0.06, max_depth=4, subsample=0.9)
model.fit(Xtr_p, ytr)
t1 = time.time()
print(f"TRAINING TIME: {t1-t0:.1f}s ({(t1-t0)/60:.2f} min)")

p = model.predict_proba(Xte_p)[:,1]
pred = (p>=0.37).astype(int)
print(f"AUC:{roc_auc_score(yte,p):.4f} Acc:{accuracy_score(yte,pred):.4f} "
      f"Prec:{precision_score(yte,pred):.4f} Rec:{recall_score(yte,pred):.4f} F1:{f1_score(yte,pred):.4f}")

os.makedirs("models", exist_ok=True)
joblib.dump({"model":model, "preprocessor":pre, "NUM_COLS":NUM_COLS, "CAT_COLS":CAT_COLS, "best_thr":0.37},
            "models/xgboost_combined.pkl")
print("[OK] Saved models/xgboost_combined.pkl")
