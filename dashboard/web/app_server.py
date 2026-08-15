import threading
import os
import time
from werkzeug.utils import secure_filename
import pandas as pd
import numpy as np
import joblib
import shap
from flask import Flask, jsonify, render_template, request, send_from_directory

app = Flask(__name__)
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

pipelines = joblib.load("models/final_pipelines.pkl")
weights = joblib.load("models/final_weights.pkl")
input_cols = joblib.load("models/final_input_columns.pkl")

preds = pd.read_csv("data/all_predictions.csv")
MEMBER_VALUE_YEAR = 1800.0

CAT_COLS = ["Sex", "City", "Hereditary_Diseases", "Plan_Type"]
NUM_COLS = [c for c in input_cols if c not in CAT_COLS]
_train = pd.read_csv("data/final_train.csv")
MEDIANS = _train[NUM_COLS].median()
CAT_MODES = {c: _train[c].mode().iloc[0] for c in CAT_COLS}

def risk_label(p):
    if p >= 0.7:
        return "HIGH"
    if p >= 0.4:
        return "MEDIUM"
    return "LOW"

preds["Risk"] = preds["Churn_Probability"].apply(risk_label)

def map_action(feature):
    f = feature.lower()
    if "days_since_last_visit" in f or "satisfaction" in f or "missed_appointments" in f:
        return "Care Outreach", "Re-engage member via nurse line / care coordinator"
    if "cost" in f or "premium" in f or "billing" in f or "denial" in f or "prior_auth" in f:
        return "Benefit Education", "Explain coverage, savings programs, appeal denied claims"
    if "pharmacy" in f or "adherence" in f or "medication" in f:
        return "Pharmacy Support", "Medication adherence program / mail-order enrollment"
    if "grievance" in f or "service" in f or "star_rating" in f or "rural" in f:
        return "Service Recovery", "Resolve complaints, improve access, escalate to retention team"
    if "plan" in f:
        return "Benefit Education", "Educate on plan benefits and alternatives"
    return "Care Outreach", "Standard retention touchpoint"

DRIVER_CACHE = {}
ACTION_COUNTS = {}
GLOBAL_DRIVERS = []
_explainer = None

def clean_name(f):
    n = f.replace("num__", "").replace("cat__", "")
    return " ".join(w if w.isupper() else w.capitalize() for w in n.split("_"))

def get_explainer():
    if _explainer is None:
        build_shap_cache()
    return _explainer

def build_shap_cache():
    global _explainer
    pipe = pipelines["XGBoost"]
    _explainer = shap.TreeExplainer(pipe.named_steps["model"])
    x = preds[input_cols]
    x_t = pipe.named_steps["pre"].transform(x)
    sv = _explainer.shap_values(x_t)
    fnames = pipe.named_steps["pre"].get_feature_names_out()
    mean_abs = np.abs(sv).mean(axis=0)
    order = np.argsort(-mean_abs)
    GLOBAL_DRIVERS.extend([
        {"feature": clean_name(fnames[i]), "importance": round(float(mean_abs[i]), 4)}
        for i in order[:10]
    ])
    for pos, member_id in enumerate(preds["MemberID"]):
        top_idx = np.argsort(-sv[pos])[:3]
        drivers = []
        for i in top_idx:
            action, detail = map_action(fnames[i])
            drivers.append({"feature": clean_name(fnames[i]), "score": round(float(sv[pos, i]), 3),
                            "action": action, "detail": detail})
        DRIVER_CACHE[member_id] = drivers
        ACTION_COUNTS[drivers[0]["action"]] = ACTION_COUNTS.get(drivers[0]["action"], 0) + 1

print("App ready — upload a dataset to start")

def member_drivers(member_id):
    return ACTIVE["drivers"].get(member_id, [])

ACTIVE = {
    "source": None,
    "filename": None,
    "preds": None,
    "drivers": {},
    "actions": {},
    "global_drivers": [],
}

def set_active(frame, drivers, actions, global_drivers, source, filename):
    ACTIVE["preds"] = frame
    ACTIVE["drivers"] = drivers
    ACTIVE["actions"] = actions
    ACTIVE["global_drivers"] = global_drivers
    ACTIVE["source"] = source
    ACTIVE["filename"] = filename

def reset_active():
    ACTIVE["preds"] = None
    ACTIVE["drivers"] = {}
    ACTIVE["actions"] = {}
    ACTIVE["global_drivers"] = []
    ACTIVE["source"] = None
    ACTIVE["filename"] = None

@app.route("/api/dataset")
def dataset():
    p = ACTIVE["preds"]
    return jsonify({
        "source": ACTIVE["source"],
        "filename": ACTIVE["filename"],
        "total": len(p) if p is not None else 0,
        "has_data": p is not None,
    })

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/overview")
def overview():
    if ACTIVE["preds"] is None:
        return jsonify({"status": "nodata", "total": 0}), 200
    p = ACTIVE["preds"]
    n = len(p)
    high = int((p["Risk"] == "HIGH").sum())
    med = int((p["Risk"] == "MEDIUM").sum())
    low = int((p["Risk"] == "LOW").sum())
    action_counts = {}
    for member_id, drivers in ACTIVE["drivers"].items():
        action = drivers[0]["action"]
        action_counts[action] = action_counts.get(action, 0) + 1
    return jsonify({
        "total": n,
        "high": high,
        "medium": med,
        "low": low,
        "high_pct": round(high / n * 100, 1),
        "medium_pct": round(med / n * 100, 1),
        "low_pct": round(low / n * 100, 1),
        "action_counts": action_counts,
        "global_drivers": ACTIVE["global_drivers"],
    })

@app.route("/api/members")
def members():
    if ACTIVE["preds"] is None:
        return jsonify({"count": 0, "members": []}), 200
    risk = request.args.get("risk", "ALL")
    q = request.args.get("q", "").strip()
    view = ACTIVE["preds"].copy()
    if "MemberID" not in view.columns and len(view.columns) > 0:
        view = view.rename(columns={view.columns[0]: "MemberID"})
    if risk != "ALL":
        view = view[view["Risk"] == risk]
    if q:
        view = view[view["MemberID"].astype(str).str.contains(q, case=False, na=False)]
    view = view.sort_values("Churn_Probability", ascending=False)
    members = []
    for _, r in view.head(500).iterrows():
        drv = ACTIVE["drivers"].get(str(r["MemberID"]), [])
        members.append({
            "id": r["MemberID"], "age": int(r["Age"]) if "Age" in view.columns and pd.notna(r["Age"]) else 0,
            "plan": r["Plan_Type"] if "Plan_Type" in view.columns else "—",
            "city": r["City"] if "City" in view.columns else "—",
            "prob": round(float(r["Churn_Probability"]) * 100, 1),
            "risk": r["Risk"],
            "driver": drv[0]["feature"] if drv else "—",
            "action": drv[0]["action"] if drv else "—",
        })
    return jsonify({
        "count": len(view),
        "members": members,
    })

@app.route("/api/member/<member_id>")
def member(member_id):
    if ACTIVE["preds"] is None:
        return jsonify({"error": "no data"}), 404
    p = ACTIVE["preds"]
    row = p[p["MemberID"] == member_id].iloc[0]
    drivers = member_drivers(member_id)
    return jsonify({
        "id": row["MemberID"],
        "age": int(row["Age"]) if "Age" in p.columns and pd.notna(row["Age"]) else 0,
        "sex": row["Sex"] if "Sex" in p.columns else "—",
        "plan": row["Plan_Type"] if "Plan_Type" in p.columns else "—",
        "city": row["City"] if "City" in p.columns else "—",
        "prob": round(float(row["Churn_Probability"]) * 100, 1),
        "risk": row["Risk"],
        "drivers": drivers,
        "action": drivers[0]["action"] if drivers else "",
        "detail": drivers[0]["detail"] if drivers else "",
    })

@app.route("/api/impact")
def impact():
    if ACTIVE["preds"] is None:
        return jsonify({"high_flagged": 0, "success_rate": 30, "saved_members": 0,
                        "revenue": 0, "member_value": MEMBER_VALUE_YEAR}), 200
    success = int(request.args.get("success", 30))
    high = ACTIVE["preds"][ACTIVE["preds"]["Churn_Probability"] >= 0.7]
    saved = len(high) * success / 100
    revenue = saved * MEMBER_VALUE_YEAR
    return jsonify({
        "high_flagged": len(high),
        "success_rate": success,
        "saved_members": round(saved),
        "revenue": round(revenue),
        "member_value": MEMBER_VALUE_YEAR,
    })

@app.route("/api/reset", methods=["POST"])
def reset():
    reset_active()
    return jsonify({"status": "ok"})

@app.route("/api/predict", methods=["POST"])
def predict_upload():
    f = request.files.get("file")
    if f is None or not f.filename:
        return jsonify({"error": "No file uploaded"}), 400
    fname = secure_filename(f.filename)
    if not fname.endswith(".csv"):
        return jsonify({"error": "Only CSV files are supported"}), 400
    try:
        user = pd.read_csv(f)
    except Exception:
        return jsonify({"error": "Could not read CSV — check the format"}), 400
    if user.empty:
        return jsonify({"error": "The file has no rows"}), 400
    if len(user) > 50000:
        return jsonify({"error": "Too many rows — the open-source predictor is capped at 50,000 members"}), 400

    found = [c for c in input_cols if c in user.columns]
    warnings = []
    if len(found) < len(input_cols):
        missing = [c for c in input_cols if c not in user.columns]
        warnings.append(f"{len(missing)} columns missing — auto-filled with training medians/modes: {', '.join(missing[:8])}{'…' if len(missing) > 8 else ''}")

    id_col = user.columns[0] if user.shape[1] >= 1 else None
    ids = user.iloc[:, 0].astype(str) if id_col is not None else [f"ROW_{i}" for i in range(len(user))]

    X_u = pd.DataFrame(index=user.index)
    for c in NUM_COLS:
        X_u[c] = pd.to_numeric(user[c], errors="coerce") if c in user.columns else np.nan
        X_u[c] = X_u[c].fillna(MEDIANS[c])
    for c in CAT_COLS:
        X_u[c] = (user[c].fillna(CAT_MODES[c]).astype(str) if c in user.columns else CAT_MODES[c])

    proba = np.zeros(len(user))
    for name, pipe in pipelines.items():
        proba += weights[name] * pipe.predict_proba(X_u[input_cols])[:, 1]
    proba /= sum(weights.values())

    drivers_map = {}
    action_counts = {}
    global_drivers = []
    if len(user) <= 5000:
        x_t = pipelines["XGBoost"].named_steps["pre"].transform(X_u[input_cols])
        sv = get_explainer().shap_values(x_t)
        fnames = pipelines["XGBoost"].named_steps["pre"].get_feature_names_out()
        top3 = np.argsort(-sv, axis=1)[:, :3]
        mean_abs = np.abs(sv).mean(axis=0)
        order = np.argsort(-mean_abs)
        global_drivers = [{"feature": clean_name(fnames[i]), "importance": round(float(mean_abs[i]), 4)} for i in order[:10]]
        driver_col = [clean_name(fnames[top3[i, 0]]) for i in range(len(user))]
        action_col = [map_action(fnames[top3[i, 0]])[0] for i in range(len(user))]
        for i in range(len(user)):
            drv = []
            for j in range(3):
                feat = fnames[top3[i, j]]
                action, detail = map_action(feat)
                drv.append({"feature": clean_name(feat), "score": round(float(sv[i, top3[i, j]]), 3),
                            "action": action, "detail": detail})
            drivers_map[str(ids[i])] = drv
            action_counts[drv[0]["action"]] = action_counts.get(drv[0]["action"], 0) + 1
    else:
        driver_col = [""] * len(user)
        action_col = [""] * len(user)
        warnings.append("Driver explanation skipped — SHAP computed for up to 5,000 rows to keep the open-source service fast")

    risks = np.where(proba >= 0.7, "HIGH", np.where(proba >= 0.4, "MEDIUM", "LOW"))

    active_frame = X_u.copy()
    active_frame.insert(0, "MemberID", ids)
    active_frame["Churn_Probability"] = proba
    active_frame["Risk"] = risks
    set_active(active_frame, drivers_map, action_counts, global_drivers,
               f"your upload — {fname}", fname)

    out = pd.DataFrame({
        "MemberID": ids,
        "Churn_Probability": proba.round(4),
        "Risk_Tier": risks,
        "Top_Driver": driver_col,
        "Recommended_Action": action_col,
    })
    stamp = time.strftime("%Y%m%d_%H%M%S")
    out_path = os.path.join(UPLOAD_DIR, f"results_{stamp}.csv")
    out.to_csv(out_path, index=False)

    rows = []
    for i in range(len(out)):
        rows.append({
            "id": out.iloc[i]["MemberID"], "prob": round(float(proba[i]) * 100, 1),
            "risk": risks[i], "driver": driver_col[i] or "—", "action": action_col[i] or "—",
        })

    return jsonify({
        "total": int(len(user)),
        "high": int((risks == "HIGH").sum()),
        "medium": int((risks == "MEDIUM").sum()),
        "low": int((risks == "LOW").sum()),
        "rows": rows[:500],
        "warnings": warnings,
        "download_url": "/api/download/" + os.path.basename(out_path),
        "dataset": {"source": f"your upload — {fname}", "total": int(len(user))},
    })

@app.route("/api/predict_single", methods=["POST"])
def predict_single():
    data = request.get_json(silent=True) or {}
    member_id = str(data.get("MemberID", "SINGLE-001"))

    X_u = pd.DataFrame(index=[0])
    for c in NUM_COLS:
        v = data.get(c)
        if v is None:
            X_u[c] = MEDIANS[c]
        else:
            try:
                X_u[c] = float(v)
            except (TypeError, ValueError):
                X_u[c] = MEDIANS[c]
    for c in CAT_COLS:
        v = data.get(c)
        if v is None or str(v) == "":
            X_u[c] = CAT_MODES[c]
        else:
            X_u[c] = str(v)

    proba = np.zeros(1)
    for name, pipe in pipelines.items():
        proba += weights[name] * pipe.predict_proba(X_u[input_cols])[:, 1]
    proba /= sum(weights.values())
    p = float(proba[0])
    risk = risk_label(p)

    drivers = []
    contributions = []
    try:
        x_t = pipelines["XGBoost"].named_steps["pre"].transform(X_u[input_cols])
        sv = get_explainer().shap_values(x_t)[0]
        fnames = pipelines["XGBoost"].named_steps["pre"].get_feature_names_out()
        order = np.argsort(-np.abs(sv))
        top3 = order[:3]
        for i in top3:
            action, detail = map_action(fnames[i])
            drivers.append({"feature": clean_name(fnames[i]), "score": round(float(sv[i]), 3),
                            "action": action, "detail": detail})
        contributions = [{"feature": clean_name(fnames[i]), "score": round(float(sv[i]), 4)}
                         for i in order[:10]]
    except Exception:
        pass

    return jsonify({
        "id": member_id,
        "prob": round(p * 100, 1),
        "risk": risk,
        "drivers": drivers,
        "action": drivers[0]["action"] if drivers else "Care Outreach",
        "detail": drivers[0]["detail"] if drivers else "Standard retention touchpoint",
        "contributions": contributions,
        "member_value": MEMBER_VALUE_YEAR,
    })

@app.route("/api/download/<fname>")
def download(fname):
    return send_from_directory(UPLOAD_DIR, fname, as_attachment=True)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8501)), threaded=True)