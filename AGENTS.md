# Project Memory — Health Plan Member Churn Prediction & Retention Advisor

Hackathon (NPN/Cognizant-style) project. Goal: predict which health-plan members will churn, explain WHY (SHAP), and recommend a retention ACTION per member. Web dashboard = the final deliverable.

## Golden rules (do NOT break)
- **NO Streamlit, NO React build step.** The frontend is vanilla JS + Chart.js served by Flask (hackathon rule bans Streamlit; Vercel can't run this app).
- **The app must start with NO data loaded.** Users upload their own CSV in Overview → "Show Results" → their data becomes active across ALL views. Reset/clear returns to empty state.
- **Only edit `dashboard/web/` for app changes.** Scratch scripts (0x_*.py at repo root) are gitignored and stay local only.
- **Deployments**: Render (free tier) auto-deploys from GitHub push. Start command must be:
  `gunicorn -w 1 --threads 4 --timeout 300 -b 0.0.0.0:${PORT:-8501} dashboard.web.app_server:app`

## What the app is
Flask single-file backend + single-page vanilla-JS frontend. Model: **4-model weighted ensemble** (Logistic Regression 0.84, Gradient Boosting 0.84, Random Forest 0.83, XGBoost 0.81) → 0.836 accuracy / 0.837 AUC on held-out test, 0.847 AUC full-15k. Explanations via SHAP (TreeExplainer on XGBoost). Member value $1,800/yr for impact math.

## Repo layout
```
dashboard/web/app_server.py      ← Flask backend (ALL endpoints live here)
dashboard/web/templates/index.html   ← all views in one page
dashboard/web/static/app.js          ← all frontend logic (vanilla JS)
dashboard/web/static/style.css       ← design (dark navy sidebar + light cards)
models/    ← final_pipelines.pkl, final_weights.pkl, final_preprocessor.pkl, final_input_columns.pkl
data/      ← final_train/validate/test.csv (4k each), all_predictions.csv (demo upload), demo_member_churn_data.csv (200-member demo)
render.yaml ← Render blueprint config (pythonVersion 3.12.0 — REQUIRED: shap has no 3.13 wheels)
README.md  ← full docs: frontend/backend/training
```

## Backend API (app_server.py)
- `GET /api/dataset` — active dataset info (source, total, has_data)
- `POST /api/predict` — CSV upload → scores ensemble → sets ACTIVE → returns summary + download_url. Cap 50,000 rows; missing columns auto-filled (training medians/modes); SHAP drivers only if ≤5,000 rows.
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
2. Overview → upload `data/demo_member_churn_data.csv` (200 members: 66 HIGH/28 MEDIUM/106 LOW; actions: Care Outreach 62, Benefit Education 54, Service Recovery 81, Pharmacy Support 3) → Show Results.
3. Explore tabs; sidebar single-patient form; Feature Chart; Impact slider.
4. Judge line: our ensemble beats the single-RF reference app on the same data (swap the data, not the models).

## How the model was trained
15,000 synthetic members (21% churn) → stratified Train/Validate/Test 4k/4k/4k. 28 features (Age, BMI, Smoker, BloodPressure, Diabetes, Dependents, Star_Rating, Rural, Dual_Eligible, Chronic_Burden, Tenure_Months, Avg_Out_Of_Pocket_Cost, Premium_Delay_Days, Billing_Issues, Distance_To_Facility_Miles, Missed_Appointments, Claim_Denials, Prior_Auth_Delays, Grievances_90d, Service_Contacts, Pharmacy_Fills, Medication_Adherence, Days_Since_Last_Visit, Overall_Satisfaction, Sex, City, Hereditary_Diseases, Plan_Type). Preprocessing: median impute + scale numerics, mode impute + one-hot categoricals, baked into each model's Pipeline. Weights fit on validation. All reproducible locally with 09_final_model.py (gitignored).

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