# Health Plan Member Churn Prediction & Retention Advisor

> NPN Hackathon entry — an open-source web tool that predicts which health-plan members are about to leave, explains **why** in plain language, and tells the retention team **what to do** for each member.

Live dashboard: **http://localhost:8501**

---

## What it does

| Step | What happens |
|---|---|
| **1. Bring your data** | Drop in any member CSV (≤ 50,000 rows). The app fills in any missing columns automatically from the training distribution, so even a partial file works. |
| **2. Predict** | A 4-algorithm weighted ensemble scores every member's churn probability and assigns a risk tier. |
| **3. Explain** | SHAP (Shapley values) picks each member's top-3 churn drivers in plain English — e.g. *"claimed more than usual"*, *"long time since last visit"*. |
| **4. Act** | Each member gets a recommended retention action: Care Outreach, Benefit Education, Pharmacy Support, or Service Recovery. |

No default dataset is bundled — the user's upload **becomes** the active dataset across the whole dashboard (Overview, Member Risk List, Business Impact), and a **↺ Clear** button resets it.

---

## Quick start

```bash
pip install -r requirements.txt
python dashboard/web/app_server.py      # run from the project root
# open http://localhost:8501
```

Try it instantly with the bundled demo file: upload `data/all_predictions.csv` (4,000 fully-featured members) and click **🚀 Show Results**.

---

## Frontend (dashboard/web/templates/index.html + static/)

A single-page, dark-themed app rendered by **static/app.js** (Chart.js for all charts). No Streamlit.

| View | Contents |
|---|---|
| **Overview** | Upload box + **Show Results** button at the top; KPI cards (total / high / medium / low risk), risk-distribution bar chart, **percentage doughnut** (share of each tier with % labels, center shows the largest tier), top-10 portfolio churn drivers, recommended-action cards |
| **Member Risk List** | Searchable, filterable table (All / High / Medium / Low chips), sorted by risk. Click a row → member detail with a churn-probability **gauge**, SHAP driver bars, and the recommended action |
| **Business Impact** | Retention slider (5–60% success rate) → live math: high-risk members flagged, members retained, **revenue preserved** (assumes $1,800 avg member value/year) |

Behavior rules implemented in JS:

- No data loaded → each view shows an **empty-state prompt**; charts are destroyed, not shown empty.
- Selecting a file shows it as *"ready — click Show Results"*; the upload only fires on the button click.
- After upload, the dataset badge in the header shows the active source, and all views refresh from the API.
- **↺ Clear** (header badge) resets the server state → back to empty states.

---

## Backend (dashboard/web/app_server.py)

Flask single-file server on port 8501. State lives in a module-level `ACTIVE` dict (`source`, `filename`, `preds`, `drivers`, `actions`, `global_drivers`) — empty at startup. Models and training artifacts are loaded once at boot.

### API endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/` | GET | Serves the SPA |
| `/api/dataset` | GET | Active dataset info: source, filename, total, `has_data` |
| `/api/predict` | POST | Accepts CSV upload → scores with ensemble → sets it ACTIVE → returns summary + download URL |
| `/api/overview` | GET | Totals + percentages per tier, action counts, top-10 global drivers |
| `/api/members?risk=&q=` | GET | Risk-filtered, searchable, risk-sorted member list (max 500 rows) |
| `/api/member/<id>` | GET | Single member: probability, tier, SHAP drivers, recommended action |
| `/api/impact?success=` | GET | Simulation math: flagged, retained, revenue preserved |
| `/api/download/<fname>` | GET | CSV of full scoring results (MemberID, probability, tier, top driver, action) |
| `/api/reset` | POST | Clears ACTIVE state → empty dashboard |

### Scoring pipeline (per uploaded file)

1. Coerce numeric columns (`errors="coerce"`); fill missing numerics with **training medians**, categoricals with **training modes**.
2. `proba = Σ (weightᵢ × modelᵢ.predict_proba)` over the 4 models, normalized by the weight sum.
3. Risk tiers: **HIGH ≥ 70%**, **MEDIUM 40–70%**, **LOW < 40%**.
4. If ≤ 5,000 rows: SHAP TreeExplainer on the XGBoost model → per-member top-3 drivers + portfolio top-10; larger files skip SHAP for speed (and say so).
5. Action mapping from the #1 driver's feature family (days since visit / satisfaction → Care Outreach; cost / premium / billing / denials → Benefit Education; pharmacy / adherence → Pharmacy Support; grievances / service / star rating / rural → Service Recovery).

Files uploaded never leave the server; scored results are saved to `dashboard/web/uploads/` for download.

---

## How the model was trained

### Dataset

Synthetic health-plan member data — **15,000 members**, 21% churn (realistic-to-class, generated from clinical/claims-style variables with churn-related dependencies). Split into **Train 4,000 / Validate 4,000 / Test 4,000** by stratified sampling (12,000 used; the remaining 3,000 reserved for the full-15k benchmark). The 29 model inputs:

`Age, BMI, Smoker, BloodPressure, Diabetes, Dependents, Star_Rating, Rural, Dual_Eligible, Chronic_Burden, Tenure_Months, Avg_Out_Of_Pocket_Cost, Premium_Delay_Days, Billing_Issues, Distance_To_Facility_Miles, Missed_Appointments, Claim_Denials, Prior_Auth_Delays, Grievances_90d, Service_Contacts, Pharmacy_Fills, Medication_Adherence, Days_Since_Last_Visit, Overall_Satisfaction, Sex, City, Hereditary_Diseases, Plan_Type`

### Preprocessing

Numeric features: median-imputed, scaled. Categorical features (Sex, City, Hereditary_Diseases, Plan_Type): mode-imputed, one-hot encoded. Same transforms are baked into each model's `Pipeline` (`pre` + `model`), so scoring an uploaded file is exactly the training-time transform.

### The 4-model weighted ensemble

| Model | Weight (fit on validation) |
|---|---|
| Logistic Regression | 0.84 |
| Gradient Boosting | 0.84 |
| Random Forest | 0.83 |
| XGBoost | 0.81 |

Weights were tuned on the validation set; the final blend is judged on the **held-out test set** (4,000 members the models never saw during training or weight-fitting):

- **Accuracy: 0.836**
- **AUC: 0.837**

### Generalization check

The same ensemble run on the full 15,000-member pool reaches **0.847 AUC / 84% accuracy** — consistent with the test-set numbers, no leakage between splits.

### Why SHAP

Churn risk alone doesn't tell a retention team what to do. Shapley values decompose each member's prediction into per-feature contributions, which the app converts into the plain-language "Why?" panel and the recommended action — turning a black-box probability into an actionable, explainable intervention for every member.

---

## Repo layout

```
dashboard/web/            ← the entire app (Flask server, templates, static assets)
models/                   ← final ensemble artifacts (pipelines, weights, preprocessor, input columns)
data/                     ← train / validate / test splits + demo upload file (all_predictions.csv)
requirements.txt
```