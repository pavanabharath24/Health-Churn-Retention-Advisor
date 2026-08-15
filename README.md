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

Try it instantly with the bundled demo file: upload `data/demo_member_churn_data.csv` (200 members: 120 rural seniors + 80 metro adults) and click **🚀 Show Results**.

---

## Frontend (dashboard/web/templates/index.html + static/)

A single-page, dark-themed app rendered by **static/app.js** (Chart.js for all charts). No Streamlit.

| View | Contents |
|---|---|
| **Overview** | Upload box + **Show Results** button at the top; KPI cards (total / high / medium / low risk), risk-distribution bar chart, **percentage doughnut** (share of each tier with % labels, center shows the largest tier), top-10 portfolio churn drivers, recommended-action cards |
| **Member Risk List** | Searchable, filterable table (All / High / Medium / Low chips), sorted by risk. Click a row → member detail with a churn-probability **gauge**, SHAP driver bars, and the recommended action |
| **Single Patient** | Result of the sidebar input form: churn %, risk tier, SHAP "why?" drivers, recommended action, **Trigger Outreach** button |
| **Retention Advisor** | Action summary cards + filterable table of every member's recommended action (Care Outreach / Benefit Education / Pharmacy Support / Service Recovery) |
| **Business Impact** | Retention slider (5–60% success rate) → live math: high-risk members flagged, members retained, **revenue preserved** (assumes $1,800 avg member value/year) |
| **Feature Chart** | SHAP horizontal bar chart for the assessed patient (red = pushes churn up, green = down) |
| **Batch Results** | Scoring summary KPIs + results table + CSV download link from the upload |

Behavior rules implemented in JS:

- No data loaded → each view shows an **empty-state prompt**; charts are destroyed, not shown empty.
- Selecting a file shows it as *"ready — click Show Results"*; the upload only fires on the button click.
- After upload, the dataset badge in the header shows the active source, and all views refresh from the API.
- **↺ Clear** (header badge) resets the server state → back to empty states.
- **Sidebar Patient Input** form (8 key fields, rest imputed) → `/api/predict_single`; results land in the Single Patient view with toasts.

---

## Backend (dashboard/web/app_server.py)

Flask single-file server on port 8501. State lives in a module-level `ACTIVE` dict (`source`, `filename`, `preds`, `drivers`, `actions`, `global_drivers`) — empty at startup. Models and training artifacts are loaded once at boot.

### API endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/` | GET | Serves the SPA |
| `/api/dataset` | GET | Active dataset info: source, filename, total, `has_data` |
| `/api/predict` | POST | Accepts CSV upload → scores with ensemble → sets it ACTIVE → returns summary + download URL |
| `/api/predict_single` | POST | JSON patient (partial features OK, rest imputed) → prob, risk, SHAP drivers, action, contributions |
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
4. SHAP TreeExplainer on the XGBoost model → per-member top-3 drivers + portfolio top-10. **Drivers are always computed**: files up to 3,000 rows get full per-member SHAP; larger files get a stratified sample (500 top-risk members + 2,500 random), and the UI says so instead of silently skipping.
5. Action mapping from the #1 driver's feature family (days since visit / satisfaction → Care Outreach; cost / premium / billing / denials → Benefit Education; pharmacy / adherence → Pharmacy Support; grievances / service / star rating / rural → Service Recovery).

Files uploaded never leave the server; scored results are saved to `dashboard/web/uploads/` for download.

---

## How the model was trained

### Two real-world-grounded datasets — train and test never match

We fetched **real public data from the internet** to ground the populations (`data/real_world/`):

- **IBM Telco Customer Churn** — 7,043 real customers; measured priors: 26.5% churn, tenure quartiles 50% → 8%, month-to-month contracts 43%, autopay 16% vs electronic-check 45%, no-dependents 31%, seniors 42%.
- **Kaggle medical insurance** — 1,338 real insured US adults; age, BMI, smoker (20.5%), sex, dependents distributions, and smoking's real cost uplift (4.7× charges).

Those priors drive two **4,000-member populations** with genuinely different members, distributions, and churn reasons:

| | **Dataset A (TRAIN)** — MetroPlan | **Dataset B (TEST)** — RuralCare |
|---|---|---|
| Population | Urban/suburban working adults (avg 39) | Rural & senior Medicare members (avg 77) |
| Rural share | 8% | 68% |
| Out-of-pocket | High (avg ~$3,200; commercial) | Low (avg ~$1,350; MA cost caps) |
| Distance to care | 0–60 mi (median ~5) | 0–120 mi (median ~18) |
| Medication adherence | ~0.86 | ~0.72 |
| Plan types | PPO/HMO/EPO/POS/HDHP | MA-HMO/MA-PPO/SNP + PPO/HMO |
| **Why members leave** | **Cost & claims**: premium exceeds budget, claim denials, prior-auth delays, billing errors, satisfaction drop, short-tenure price shopping | **Access & engagement**: too far from providers, missed appointments, stopped refills, grievances, low star rating |
| **Why members stay** | Affordable OOP, family/dependents lock-in, claims paid fast, satisfaction, long tenure | Clinic nearby, meds covered at low copay, strong star rating, quick service, long tenure |

Every member carries a ground-truth **`Churn_Reason`** (leave or stay) matched to their true dominant driver — so reasons genuinely differ per member and per population. Guarantees, verified programmatically:

- Disjoint MemberIDs (MET-xxxxx vs RUR-xxxxx), **0 duplicate feature rows** across datasets.
- Kolmogorov–Smirnov: age, cost, distance, adherence, satisfaction, tenure all differ with p < 1e-6.
- One shared real-world churn behavior (cost + tenure + satisfaction + access + adherence + service) with population-specific intensity — exactly how urban vs rural health-plan churn works in reality.

### Preprocessing

Numeric features: median-imputed, scaled. Categorical features (Sex, City, Hereditary_Diseases, Plan_Type): mode-imputed, one-hot encoded. Same transforms are baked into each model's `Pipeline` (`pre` + `model`), so scoring an uploaded file is exactly the training-time transform.

### The 4-model weighted ensemble

| Model | Weight (5-fold CV AUC on Dataset A) |
|---|---|
| Logistic Regression | 0.803 |
| Random Forest | 0.789 |
| Gradient Boosting | 0.788 |
| XGBoost | 0.777 |

The final blend is trained **only on Dataset A** and judged on **Dataset B — a 4,000-member population it has never seen and that shares zero rows** (this is the honest cross-population test; the decision threshold 0.37 is tuned out-of-fold on A only):

- **AUC: 0.781**
- **Recall: 0.855** (catches 883 of 1,033 real churners in the unseen population)
- Precision 0.386 · F1 0.532 · Accuracy 0.611

### Why SHAP

Churn risk alone doesn't tell a retention team what to do. Shapley values decompose each member's prediction into per-feature contributions, which the app converts into the plain-language "Why?" panel and the recommended action — turning a black-box probability into an actionable, explainable intervention for every member.

---

## Repo layout

```
dashboard/web/            ← the entire app (Flask server, templates, static assets)
models/                   ← final ensemble artifacts (pipelines, weights, preprocessor, input columns)
data/                     ← dataset_a_train.csv (4k metro) · dataset_b_test.csv (4k rural seniors)
                            · demo_member_churn_data.csv (200-member demo upload)
                            · all_predictions.csv (Dataset B scored) · real_world/ (fetched sources)
requirements.txt
```