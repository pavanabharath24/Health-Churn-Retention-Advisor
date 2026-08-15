# Project Memory — Health Plan Member Churn Prediction & Retention Advisor

Hackathon (NPN/Cognizant-style) project. Goal: predict which health-plan members will churn, explain WHY (SHAP), and recommend a retention ACTION per member. Web dashboard = the final deliverable.

## Golden rules (do NOT break)
- **NO Streamlit, NO React build step.** The frontend is vanilla JS + Chart.js served by Flask (hackathon rule bans Streamlit; Vercel can't run this app).
- **The app must start with NO data loaded.** Users upload their own CSV in Overview → "Show Results" → their data becomes active across ALL views. Reset/clear returns to empty state.
- **Only edit `dashboard/web/` for app changes.** Scratch scripts (0x_*.py at repo root) are gitignored and stay local only.
- **Deployments**: Render (free tier) auto-deploys from GitHub push. Start command must be:
  `gunicorn -w 1 --threads 4 --timeout 300 -b 0.0.0.0:${PORT:-8501} dashboard.web.app_server:app`

## What the app is
Flask single-file backend + single-page vanilla-JS frontend. Model: **4-model weighted ensemble** (Logistic Regression, Gradient Boosting, Random Forest, XGBoost) trained on Dataset A (4k metro working adults) and tested on Dataset B (4k rural seniors — **zero shared rows**, KS-distinct distributions). Cross-population result: **0.781 AUC / 0.855 recall** on the never-seen population (threshold 0.37 tuned out-of-fold on A only). Explanations via SHAP (TreeExplainer on XGBoost). Member value $1,800/yr for impact math.

## Repo layout
```
dashboard/web/app_server.py      ← Flask backend (ALL endpoints live here)
dashboard/web/templates/index.html   ← all views in one page
dashboard/web/static/app.js          ← all frontend logic (vanilla JS)
dashboard/web/static/style.css       ← design (dark navy sidebar + light cards)
models/    ← final_pipelines.pkl, final_weights.pkl, final_preprocessor.pkl, final_input_columns.pkl
data/      ← dataset_a_train.csv (4k TRAIN: metro) · dataset_b_test.csv (4k TEST: rural seniors)
             · demo_member_churn_data.csv (200-member demo: 120 rural + 80 metro)
             · all_predictions.csv (Dataset B scored, used by the app at boot)
             · real_world/ (fetched sources: IBM Telco Churn + Kaggle medical insurance)
render.yaml ← Render blueprint config (pythonVersion 3.12.0 — REQUIRED: shap has no 3.13 wheels)
README.md  ← full docs: frontend/backend/training
```

## The two datasets (do not confuse)
- **Dataset A — MetroPlan (TRAIN)**: 4,000 urban/suburban working adults (avg 39, 8% rural, high OOP ~$3,200, PPO/HMO/EPO/POS/HDHP). Leaves = COST & CLAIMS (premium, denials, prior-auth, billing, satisfaction, short tenure). Stays = affordability, dependents, claims paid, tenure.
- **Dataset B — RuralCare (TEST)**: 4,000 rural/senior Medicare members (avg 77, 68% rural, low OOP ~$1,350, MA-HMO/MA-PPO/SNP). Leaves = ACCESS & ENGAGEMENT (distance, missed visits, stopped refills, grievances, low star rating). Stays = proximity, covered meds, star rating, tenure.
- Both share ONE real-world churn behavior (cost+tenure+satisfaction+access+adherence+service) with population-specific intensity; each member has a ground-truth `Churn_Reason` matched to their true dominant driver. Priors measured from real fetched data (telco: 26.5% churn, tenure Q1 50%→Q4 8%, e-check 45%; insurance: smoker 20.5%, real cost uplift).
- Verification: disjoint IDs, 0 duplicate rows, KS p<1e-6 on age/cost/distance/adherence/satisfaction/tenure.

## Backend API (app_server.py)
- `GET /api/dataset` — active dataset info (source, total, has_data)
- `POST /api/predict` — CSV upload → scores ensemble → sets ACTIVE → returns summary + download_url. Cap 50,000 rows; missing columns auto-filled (training medians/modes). SHAP drivers ALWAYS computed: ≤3,000 rows full per-member SHAP, larger files → stratified sample (500 top-risk + 2,500 random) + a warning that says so.
- `POST /api/predict_single` — JSON patient (partial features OK, rest imputed) → prob, risk, SHAP drivers, action, contributions (for Feature Chart)
- `GET /api/overview` — tier counts/%, action counts, global drivers
- `GET /api/members?risk=&q=` — risk-filtered/searchable/sorted list (500 max) with driver+action per member
- `GET /api/member/<id>` — single member detail (prob, drivers, action, detail)
- `GET /api/impact?success=` — simulation: flagged, saved, revenue
- `POST /api/reset` — clears ACTIVE (back to empty)
- `GET /api/download/<fname>` — results CSV

Risk tiers: HIGH ≥70%, MEDIUM 40–70%, LOW <40%. Actions from top SHAP driver: DaysSinceVisit/Satisfaction/MissedAppointments → Care Outreach; Cost/Premium/Billing/Denial/PriorAuth → Benefit Education; Pharmacy/Adherence/Medication → Pharmacy Support; Grievance/Service/StarRating/Rural → Service Recovery. `clean_name()` humanizes snake_case → Title Case (keeps acronyms like BMI).

## Frontend (7 sidebar views)
Overview (upload + KPIs + bar/donut/driver charts + action cards) · Member Risk List (table, chips, search, click → detail w/ gauge) · Single Patient (result card: prob, risk, drivers, action, Trigger Outreach) · Retention Advisor (action summary + filterable table) · Business Impact (slider simulation) · Feature Chart (SHAP horizontal bar: red=up/green=down) · Batch Results (summary + table + download).
Sidebar has the Patient Input form (8 fields) → POST /api/predict_single. Toasts bottom-right (upload success, assessment, outreach, reset). Empty states on every view when no data.

## Demo / judging flow
1. Open site → empty states everywhere (proves open-source BYOD).
2. Overview → upload `data/demo_member_churn_data.csv` (200 members: 120 rural + 80 metro; 26 HIGH/67 MEDIUM/107 LOW; actions: Care Outreach 140, Benefit Education 31, Service Recovery 23, Pharmacy Support 6) → Show Results.
3. Explore tabs; sidebar single-patient form; Feature Chart; Impact slider.
4. Judge line: our ensemble is trained on Dataset A and tested on Dataset B — a population with **zero shared rows** and statistically different distributions — and still catches 85% of real churners (0.781 AUC).

## How the model was trained
Real-world-grounded data (priors measured from fetched IBM Telco Churn + Kaggle medical insurance, in data/real_world/): Dataset A train 4k metro (cost-driven) + Dataset B test 4k rural seniors (access-driven), shared real churn behavior, KS-distinct, 0 overlapping rows. 28 features (Age, BMI, Smoker, BloodPressure, Diabetes, Dependents, Star_Rating, Rural, Dual_Eligible, Chronic_Burden, Tenure_Months, Avg_Out_Of_Pocket_Cost, Premium_Delay_Days, Billing_Issues, Distance_To_Facility_Miles, Missed_Appointments, Claim_Denials, Prior_Auth_Delays, Grievances_90d, Service_Contacts, Pharmacy_Fills, Medication_Adherence, Days_Since_Last_Visit, Overall_Satisfaction, Sex, City, Hereditary_Diseases, Plan_Type). Preprocessing: median impute + scale numerics, mode impute + one-hot categoricals, baked into each model's Pipeline. Weights = 5-fold CV AUC on A; decision threshold 0.37 tuned out-of-fold on A only. Reproducible: 16_create_real_world_datasets.py → 17_retrain_on_a_test_b.py (both gitignored scratch).

## Running & testing
```bash
cd /home/pavana/NPN_HACKTHON
# dev server (Python 3.14, deps installed):
python dashboard/web/app_server.py      # http://localhost:8501
# production-style test:
gunicorn -w 1 --threads 4 --timeout 300 -b 0.0.0.0:8501 dashboard.web.app_server:app
```
- Server restart pattern: `pkill -f gunicorn` FIRST in its own command, then launch with `setsid -f` (combining them makes the shell timeout kill the child).
- Test upload file: `/tmp/opencode/test_upload.csv` (40 rows, partial columns — tests imputation).
- After editing: `git add -A && git commit -m "..." && git push` → Render auto-deploys (~2 min).
- First request after Render cold start is slow (~1 min, model load); first upload after cold start may 504 → retry.

## Gotchas learned
- Render ignores `envVars.PYTHON_VERSION` — use `pythonVersion:` field in render.yaml.
- Render manual Web Service defaults to `gunicorn app:app` → must set Start Command or use Blueprint deploy.
- Free-tier RAM is 512MB: keep startup light (no eager SHAP precompute — it's lazy via get_explainer()).
- Feature names shown to users must be humanized; action mapping keys off raw preprocessor names (e.g. "num__Medication_Adherence").