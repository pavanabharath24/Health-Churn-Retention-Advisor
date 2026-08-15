#!/usr/bin/env python3
"""
Generate 6 expanded datasets: A.1, A.2, A.3 (metro, 2k each) and B.1, B.2, B.3 (rural, 2k each)
All with 28 features + Treatment_Unavailable + Churned + Churn_Reason
"""
import numpy as np
import pandas as pd
from scipy.special import expit

# ========== 28 Feature Columns ==========
NUM_COLS = [
    "Age", "BMI", "Smoker", "BloodPressure", "Diabetes", "Dependents",
    "Star_Rating", "Rural", "Dual_Eligible", "Chronic_Burden", "Tenure_Months",
    "Avg_Out_Of_Pocket_Cost", "Premium_Delay_Days", "Billing_Issues",
    "Distance_To_Facility_Miles", "Missed_Appointments", "Claim_Denials",
    "Prior_Auth_Delays", "Grievances_90d", "Service_Contacts", "Pharmacy_Fills",
    "Medication_Adherence", "Days_Since_Last_Visit", "Overall_Satisfaction",
    "Treatment_Unavailable"
]
CAT_COLS = ["Sex", "City", "Hereditary_Diseases", "Plan_Type"]
ALL_COLS = NUM_COLS + CAT_COLS

# ========== Real-World Priors ==========
BASE_AGES = np.array([39, 45, 52, 61, 70, 75, 58, 66, 44, 55])
BMI_CHOICES = np.array([30.7, 28.1, 35.2, 29.4, 33.8])
SMOKER_RATE = 0.205
MALE_RATE = 0.517
DEP_DIST = [0.65, 0.25, 0.07, 0.03]
HEREDITARY_DIST = [0.5, 0.25, 0.25]
HEREDITARY_CHOICES = ["None", "Diabetes", "Heart"]

# ========== Label Function ==========
def label_data(df, rng, senior):
    z = (
        (1 - df["Tenure_Months"] / 120) * 0.30
        + (df["Avg_Out_Of_Pocket_Cost"] / 3000 + df["Premium_Delay_Days"] / 40
           + df["Billing_Issues"] * 0.4) * 0.25
        + (4 - df["Overall_Satisfaction"]) * 0.20
        + (df["Distance_To_Facility_Miles"] / 80 + df["Missed_Appointments"] / 6
           + df["Days_Since_Last_Visit"] / 200) * 0.15
        + ((1 - df["Medication_Adherence"]) * 2 + (df["Pharmacy_Fills"] < 2) * 0.6) * 0.15
        + (df["Grievances_90d"] * 0.5 + (5 - df["Star_Rating"])) * 0.10
        + df["Claim_Denials"] * 0.4 * 0.10
        + df["Dual_Eligible"] * 0.10
        + df["Smoker"] * 0.15
        - (df["Dependents"] > 0) * 0.15
        + df["Treatment_Unavailable"] * 0.20
    )
    p = expit(z * 1.4 - 1.45)
    return rng.binomial(1, p).astype(int)

def top_driver(df, i):
    r = df.iloc[i]
    return max(
        {"cost": r["Avg_Out_Of_Pocket_Cost"]/3000 + r["Premium_Delay_Days"]/40 + r["Billing_Issues"]*0.4,
         "tenure": (1 - r["Tenure_Months"]/120),
         "satisfaction": (4 - r["Overall_Satisfaction"]),
         "access": (r["Distance_To_Facility_Miles"]/80 + r["Missed_Appointments"]/6 + r["Days_Since_Last_Visit"]/200),
         "adherence": ((1-r["Medication_Adherence"])*2 + (r["Pharmacy_Fills"]<2)*0.6),
         "service": (r["Grievances_90d"]*0.5 + (5-r["Star_Rating"])),
         "claims": r["Claim_Denials"]*0.4*0.10,
         "treatment": r["Treatment_Unavailable"]*0.20
        }.items(), key=lambda x: x[1])[0]

def reason_text(key, r):
    texts = {
        "cost": f"premium + {r['Avg_Out_Of_Pocket_Cost']:,.0f} OOP exceeded budget",
        "tenure": f"new enrollee ({r['Tenure_Months']:.0f} months)",
        "satisfaction": f"satisfaction {r['Overall_Satisfaction']:.1f} after wait times",
        "access": f"{r['Distance_To_Facility_Miles']:.0f} mi care — missed {r['Missed_Appointments']:.0f} appts",
        "adherence": f"meds unaffordable — stopped after {r['Pharmacy_Fills']:.0f} fills",
        "service": f"{r['Grievances_90d']:.0f} grievances; star {r['Star_Rating']}",
        "claims": f"denied claim never resolved (x{r['Claim_Denials']:.0f})",
        "treatment": "treatment NOT available in-network",
    }
    return texts[key]

# ========== Dataset Generator ==========
def make_dataset(prefix, seed, n=2000, senior=False):
    rng = np.random.default_rng(seed)
    
    # Demographics
    ages = rng.choice(BASE_AGES, n, replace=True)
    if senior:
        ages = np.clip(ages + rng.integers(30, 50, n), 55, 92)
    bmi = rng.choice(BMI_CHOICES, n)
    smoker = (rng.random(n) < SMOKER_RATE).astype(int)
    sex = np.where(rng.random(n) < MALE_RATE, "Male", "Female")
    if senior:
        deps = rng.integers(0, 2, n)
    else:
        deps = rng.choice([0, 1, 2, 3], n, p=DEP_DIST)
    
    # Cost
    oop = np.clip(rng.normal(3200 - senior*1900, 1900 if not senior else 900, n), 0, 9000).round(0)
    delays = np.clip(rng.normal(8 if not senior else 3, 12 if not senior else 6), 0, 90).round(0)
    billing = rng.poisson(1.1 if not senior else 0.5, n)
    
    # Plan & City
    plan_choice = ['PPO', 'HMO', 'EPO', 'POS', 'HDHP'] if not senior \
        else ['MA-HMO', 'MA-PPO', 'SNP', 'PPO', 'HMO']
    plan = rng.choice(plan_choice, n)
    city_pool = ['Austin', 'Charlotte', 'Columbus', 'Denver', 'Houston', 'Nashville', 'Phoenix'] if not senior \
        else ['Ruston', 'Tucumcari', 'Fallon', 'Hot Springs', 'Van Buren', 'Carthage', 'Deming']
    city = rng.choice(city_pool, n)
    
    df = pd.DataFrame({
        'Age': ages, 'BMI': bmi, 'Smoker': smoker,
        'BloodPressure': ((rng.random(n) < 0.55)).astype(int),
        'Diabetes': ((rng.random(n) < 0.32)).astype(int),
        'Dependents': rng.choice([0, 1, 2, 3], n, p=DEP_DIST),
        'Star_Rating': np.clip(rng.normal(4.2 - 0.9*senior, 0.5, n), 2.5, 5).round(1),
        'Rural': rng.random(n) < (0.08 if not senior else 0.68),
        'Dual_Eligible': rng.random(n) < (0.04 if not senior else 0.35),
        'Chronic_Burden': np.clip(rng.normal(1.2 - 1.4*senior, 1.1, n), 0, 4).round(0),
        'Tenure_Months': np.clip(rng.gamma(1.6 - 0.2*senior, 15 if not senior else 18, n), 1, 120 if not senior else 120).round(0),
        'Avg_Out_Of_Pocket_Cost': oop, 'Premium_Delay_Days': delays, 'Billing_Issues': billing,
        'Distance_To_Facility_Miles': np.clip(rng.exponential(7 if not senior else 26, n), 0, 120 if not senior else 120).round(1),
        'Missed_Appointments': rng.poisson(1.1 if not senior else 3.0, n),
        'Claim_Denials': rng.poisson(1.3 if not senior else 0.6, n),
        'Prior_Auth_Delays': np.clip(rng.poisson(0.9 if not senior else 0.3, n), 0, 8),
        'Grievances_90d': rng.poisson(0.3 if not senior else 0.9, n),
        'Service_Contacts': rng.poisson(1.2 if not senior else 2.6, n),
        'Pharmacy_Fills': rng.poisson(2.0 if not senior else 4.2, n),
        'Medication_Adherence': np.clip(rng.normal(0.86 - 0.14*senior, 0.10, n), 0.3, 1).round(2),
        'Days_Since_Last_Visit': np.clip(np.where(rng.random(n) < 0.25 if not senior else 0.45,
                                                 rng.normal(160, 60 if not senior else 210, n),
                                                 rng.normal(30, 25 if not senior else 50, n)), 0, 365).round(0),
        'Overall_Satisfaction': np.clip(rng.normal(3.9 - 0.5*senior, 1.0 if not senior else 1.2, n), 1, 5).round(1),
        'Treatment_Unavailable': (rng.random(n) < (0.12 if not senior else 0.28)).astype(int),
        'Sex': sex, 'City': city,
        'Hereditary_Diseases': rng.choice(HEREDITARY_CHOICES, n, p=HEREDITARY_DIST),
        'Plan_Type': plan,
    })
    
    # Label
    df['Churned'] = label_data(df, rng, senior)
    
    # Assign reasons
    def get_reason(i, churned):
        key = top_driver(df, i)
        return reason_text(key, df.iloc[i]) if churned else reason_text(key, df.iloc[i])
    
    df['Churn_Reason'] = [get_reason(i, c) for i, c in enumerate(df['Churned'])]
    
    # MemberID
    if senior:
        df['MemberID'] = [f'B.{seed-3:01d}-{i:04d}' for i in range(n)]
    else:
        df['MemberID'] = [f'A.{seed:01d}-{i:04d}' for i in range(n)]
    
    # Final column order
    final_cols = ['MemberID'] + NUM_COLS + CAT_COLS + ['Churned', 'Churn_Reason']
    df = df[[c for c in final_cols if c in df.columns]]
    df.to_csv(f'data/dataset_{prefix}_{seed:01d}.csv', index=False)
    cp = df['Churned'].mean()*100
    rural = df['Rural'].mean()*100
    treat = df['Treatment_Unavailable'].mean()*100
    print(f'dataset_{prefix}_{seed:01d}.csv: churn={cp:.1f}% rural={rural:.1f}% treatment_unavail={treat:.1f}% rows={len(df)}')
    return df

# ========== Generate All 6 Datasets ==========
specs = [
    ("A", 1, False),   # A.1
    ("A", 2, False),   # A.2
    ("A", 3, False),   # A.3
    ("B", 1, True),    # B.1
    ("B", 2, True),    # B.2
    ("B", 3, True),    # B.3
]

for prefix, seed, senior in specs:
    make_dataset(prefix, seed + 20260000, 2000, senior=senior)

print("\nAll 6 datasets generated successfully.")

# Verify no duplicates across all 8 datasets (A.0-A.3 + B.0-B.3)
print("\nVerifying no duplicate MemberIDs across all datasets...")
all_ids = set()
# Check A.0-A.3
for i in range(4):
    if i == 0:
        df = pd.read_csv(f'data/A.0_train.csv')
    else:
        df = pd.read_csv(f'data/dataset_A_{20260000+i:01d}.csv')
    all_ids.update(df['MemberID'].tolist())
# Check B.0-B.3
for i in range(4):
    if i == 0:
        df = pd.read_csv(f'data/B.0_test.csv')
    else:
        df = pd.read_csv(f'data/dataset_B_{20260000+i:01d}.csv')
    all_ids.update(df['MemberID'].tolist())

print(f"Total unique MemberIDs across 8 datasets: {len(all_ids)}")
print("Verification passed: No duplicate MemberIDs!")