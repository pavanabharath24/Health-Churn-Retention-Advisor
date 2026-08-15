const $ = (id) => document.getElementById(id);
const TITLES = {
  overview: ["Overview", "Upload your member data — get churn risk insights"],
  members: ["Member Risk List", "Risk records for your uploaded members — click a row for details"],
  single: ["Single Patient", "Assess one patient — sidebar form or click a member"],
  advisor: ["Retention Advisor", "Recommended retention action for every member — the 'Act' step"],
  impact: ["Business Impact", "What the model's alerts are worth"],
  feature: ["Feature Chart", "SHAP contributions for the selected patient"],
  batch: ["Batch Results", "Scoring summary and downloadable results for your upload"],
};

const VIEWS = ["overview", "members", "single", "advisor", "impact", "feature", "batch"];
let currentRisk = "ALL";
let currentAction = "ALL";
let charts = {};
let hasData = false;
let pendingFile = null;
let lastPatient = null;
let lastDownloadUrl = null;

const ACTION_META = {
  "Care Outreach": ["ac-care", "🌱"],
  "Benefit Education": ["ac-benefit", "📘"],
  "Pharmacy Support": ["ac-pharmacy", "💊"],
  "Service Recovery": ["ac-service", "🛠️"],
};

function switchView(name) {
  VIEWS.forEach(v => $("view-" + v).classList.toggle("active", v === name));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  $("page-title").textContent = TITLES[name][0];
  $("page-sub").textContent = TITLES[name][1];
  if (name === "overview" && hasData) loadOverview();
  if (name === "members" && hasData) loadMembers();
  if (name === "single" && lastPatient) renderSingle(lastPatient);
  if (name === "advisor" && hasData) loadAdvisor();
  if (name === "impact" && hasData) loadImpact();
  if (name === "feature" && lastPatient) renderFeatureChart(lastPatient.contributions || []);
  if (name === "batch" && hasData) loadBatch();
}

document.querySelectorAll(".nav-item").forEach(b => b.addEventListener("click", () => switchView(b.dataset.view)));
document.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => {
  document.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
  c.classList.add("active");
  currentRisk = c.dataset.risk;
  loadMembers();
}));
document.querySelectorAll("#advisor-filters .chip").forEach(c => c.addEventListener("click", () => {
  document.querySelectorAll("#advisor-filters .chip").forEach(x => x.classList.remove("active"));
  c.classList.add("active");
  currentAction = c.dataset.action;
  loadAdvisor();
}));
$("member-search").addEventListener("input", debounce(loadMembers, 300));
$("success-rate").addEventListener("input", loadImpact);
$("show-results").addEventListener("click", () => {
  if (pendingFile) uploadFile(pendingFile);
});

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

async function api(path) {
  const r = await fetch(path);
  return r.json();
}

function showToast(message, type = "success") {
  const box = $("toast-container");
  const el = document.createElement("div");
  el.className = "toast toast-" + type;
  el.innerHTML = `<span>${message}</span><button class="toast-x">✕</button>`;
  box.appendChild(el);
  el.querySelector(".toast-x").addEventListener("click", () => el.remove());
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 5000);
}

async function refreshDatasetBadge() {
  const d = await api("/api/dataset");
  hasData = d.has_data;
  const badge = $("dataset-badge");
  const uploaded = d.filename !== null;
  badge.classList.toggle("uploaded", uploaded);
  badge.innerHTML = uploaded
    ? `Active: <b>${d.source}</b> (${d.total.toLocaleString()} members) <button id="reset-btn" class="reset-btn" title="Clear and start fresh">↺ Clear</button>`
    : "Active: <b>no dataset loaded</b>";
  if (uploaded) {
    $("reset-btn").addEventListener("click", resetDataset);
    showDataViews();
  } else {
    showEmptyViews();
  }
}

function showDataViews() {
  $("overview-data").classList.remove("hidden");
  $("overview-empty").classList.add("hidden");
  $("members-data").classList.remove("hidden");
  $("members-empty").classList.add("hidden");
  $("advisor-data").classList.remove("hidden");
  $("advisor-empty").classList.add("hidden");
  $("impact-data").classList.remove("hidden");
  $("impact-empty").classList.add("hidden");
  $("batch-data").classList.remove("hidden");
  $("batch-empty").classList.add("hidden");
  loadOverview();
  loadMembers();
  loadAdvisor();
  loadImpact();
  loadBatch();
}

function showEmptyViews() {
  $("overview-data").classList.add("hidden");
  $("overview-empty").classList.remove("hidden");
  $("members-data").classList.add("hidden");
  $("members-empty").classList.remove("hidden");
  $("advisor-data").classList.add("hidden");
  $("advisor-empty").classList.remove("hidden");
  $("impact-data").classList.add("hidden");
  $("impact-empty").classList.remove("hidden");
  $("batch-data").classList.add("hidden");
  $("batch-empty").classList.remove("hidden");
  $("member-detail").classList.add("hidden");
  $("feature-data").classList.add("hidden");
  $("feature-empty").classList.remove("hidden");
  Object.keys(charts).forEach(k => { if (charts[k]) charts[k].destroy(); });
  charts = {};
}

async function resetDataset() {
  await fetch("/api/reset", { method: "POST" });
  pendingFile = null;
  $("drop-text").textContent = "Drag & drop your member CSV here, or click to browse";
  $("show-results").classList.add("hidden");
  $("upload-status").innerHTML = "";
  await refreshDatasetBadge();
  showToast("Dataset cleared — start fresh with a new upload", "info");
}

async function loadOverview() {
  const d = await api("/api/overview");
  if (d.status === "nodata") return;
  $("kpi-total").textContent = d.total.toLocaleString();
  $("kpi-high").textContent = d.high.toLocaleString();
  $("kpi-medium").textContent = d.medium.toLocaleString();
  $("kpi-low").textContent = d.low.toLocaleString();
  $("kpi-high-pct").textContent = d.high_pct + "% of members";
  $("kpi-medium-pct").textContent = d.medium_pct + "% of members";
  $("kpi-low-pct").textContent = d.low_pct + "% of members";

  renderRiskChart(d);
  renderDonut(d);
  renderDrivers(d.global_drivers);
  renderActions(d.action_counts);
}

function renderRiskChart(d) {
  if (charts.risk) charts.risk.destroy();
  charts.risk = new Chart($("chart-risk"), {
    type: "bar",
    data: {
      labels: ["Low (0-40%)", "Medium (40-70%)", "High (70-100%)"],
      datasets: [{
        data: [d.low, d.medium, d.high],
        backgroundColor: ["#22c55e", "#f97316", "#ef4444"],
        borderRadius: 8, maxBarThickness: 90,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, grid: { color: "#eef2f7" } }, x: { grid: { display: false } } },
    },
  });
}

function renderDonut(d) {
  if (charts.donut) charts.donut.destroy();
  const tiers = [
    { label: "Low risk", v: d.low, color: "#22c55e" },
    { label: "Medium risk", v: d.medium, color: "#f97316" },
    { label: "High risk", v: d.high, color: "#ef4444" },
  ].filter(t => t.v > 0);
  const largest = tiers.reduce((a, b) => (a.v >= b.v ? a : b), tiers[0]);
  $("donut-pct").textContent = largest ? Math.round(largest.v / d.total * 100) + "%" : "—";
  $("donut-pct").style.color = largest ? largest.color : "var(--muted)";
  document.querySelector(".donut-lbl").textContent = largest ? largest.label : "no data";
  charts.donut = new Chart($("chart-donut"), {
    type: "doughnut",
    data: {
      labels: tiers.map(t => `${t.label} — ${(t.v / d.total * 100).toFixed(1)}%`),
      datasets: [{ data: tiers.map(t => t.v), backgroundColor: tiers.map(t => t.color), borderWidth: 0 }],
    },
    options: { plugins: { legend: { position: "bottom" } }, cutout: "64%" },
  });
}

function renderDrivers(drivers) {
  if (charts.drivers) charts.drivers.destroy();
  if (!drivers.length) {
    charts.drivers = new Chart($("chart-drivers"), {
      type: "bar",
      data: { labels: ["no driver data"], datasets: [{ data: [0], backgroundColor: "#c7d0e0" }] },
      options: { plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } },
    });
    return;
  }
  charts.drivers = new Chart($("chart-drivers"), {
    type: "bar",
    data: {
      labels: drivers.map(x => x.feature),
      datasets: [{
        data: drivers.map(x => x.importance),
        backgroundColor: drivers.map(() => "#4f46e5"),
        borderRadius: 6, maxBarThickness: 22,
      }],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: { x: { grid: { color: "#eef2f7" } }, y: { grid: { display: false } } },
    },
  });
}

function renderActions(counts) {
  const box = $("action-cards");
  box.innerHTML = "";
  const entries = Object.entries(counts);
  if (!entries.length) {
    box.innerHTML = '<div class="upload-hint">No driver data (SHAP skipped for very large files).</div>';
    return;
  }
  entries.forEach(([name, n]) => {
    const [cls, icon] = ACTION_META[name] || ["ac-care", "•"];
    const el = document.createElement("div");
    el.className = "action-card " + cls;
    el.innerHTML = `<div class="ac-num">${icon} ${n.toLocaleString()}</div><div class="ac-lbl">${name}</div>`;
    box.appendChild(el);
  });
}

async function loadMembers() {
  const q = $("member-search").value.trim();
  const d = await api("/api/members?risk=" + currentRisk + "&q=" + encodeURIComponent(q));
  const tbody = $("member-rows");
  tbody.innerHTML = "";
  d.members.forEach(m => {
    const tr = document.createElement("tr");
    tr.dataset.id = m.id;
    tr.innerHTML = `<td><strong>${m.id}</strong></td><td>${m.age}</td><td>${m.plan}</td><td>${m.city}</td>
      <td>${m.prob}%</td><td><span class="badge badge-${m.risk.toLowerCase()}">${m.risk}</span></td>`;
    tr.addEventListener("click", () => showMember(m.id, tr));
    tbody.appendChild(tr);
  });
  $("member-count").textContent = `${d.count.toLocaleString()} members — sorted by risk, highest first`;
}

async function showMember(id, tr) {
  document.querySelectorAll("#member-rows tr").forEach(r => r.classList.remove("selected"));
  tr.classList.add("selected");
  const d = await api("/api/member/" + id);
  const detail = $("member-detail");
  detail.classList.remove("hidden");
  $("d-name").textContent = d.id;
  $("d-meta").textContent = `${d.age} yrs · ${d.sex} · ${d.plan} · ${d.city} · ${d.risk} RISK`;

  const arc = $("gauge-arc");
  const p = d.prob;
  arc.style.stroke = p >= 70 ? "#ef4444" : p >= 40 ? "#f97316" : "#22c55e";
  setTimeout(() => { arc.style.strokeDashoffset = 327 - (327 * p / 100); }, 60);
  $("gauge-val").textContent = p + "%";

  renderDriversList($("d-drivers"), d.drivers);

  const [cls, icon] = ACTION_META[d.action] || ["ac-care", "•"];
  const badge = $("d-action");
  badge.textContent = `${icon} ${d.action || "No action"}`;
  badge.style.background = cls === "ac-care" ? "linear-gradient(135deg,#0e7490,#0891b2)"
    : cls === "ac-benefit" ? "linear-gradient(135deg,#4338ca,#6366f1)"
    : cls === "ac-pharmacy" ? "linear-gradient(135deg,#6d28d9,#8b5cf6)"
    : "linear-gradient(135deg,#b45309,#d97706)";
  $("d-detail").textContent = d.detail || "";
  detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderDriversList(box, drivers) {
  box.innerHTML = "";
  if (!drivers || !drivers.length) {
    box.innerHTML = '<div class="upload-hint">Driver explanation unavailable for this file size.</div>';
    return;
  }
  const maxScore = drivers.reduce((m, x) => Math.max(m, Math.abs(x.score)), 0.01);
  drivers.forEach(drv => {
    const row = document.createElement("div");
    row.className = "driver-row";
    row.innerHTML = `
      <div class="driver-name">${drv.feature}</div>
      <div style="text-align:right"><span class="driver-val">+${drv.score.toFixed(2)}</span></div>
    `;
    const bar = document.createElement("div");
    bar.className = "driver-bar";
    bar.innerHTML = `<i style="width:${Math.max(5, Math.min(100, Math.abs(drv.score) / maxScore * 100))}%"></i>`;
    box.appendChild(row);
    box.appendChild(bar);
  });
}

async function loadAdvisor() {
  const d = await api("/api/members?risk=ALL");
  const summary = {};
  const ORDER = ["Care Outreach", "Benefit Education", "Pharmacy Support", "Service Recovery"];
  d.members.forEach(m => { summary[m.action] = (summary[m.action] || 0) + 1; });
  const box = $("advisor-summary");
  box.innerHTML = "";
  ORDER.forEach(name => {
    const n = summary[name] || 0;
    const [cls, icon] = ACTION_META[name] || ["ac-care", "•"];
    const el = document.createElement("div");
    el.className = "action-card " + cls;
    el.innerHTML = `<div class="ac-num">${icon} ${n.toLocaleString()}</div><div class="ac-lbl">${name}</div>`;
    box.appendChild(el);
  });

  const rows = d.members.filter(m => currentAction === "ALL" || m.action === currentAction);
  const tbody = $("advisor-rows");
  tbody.innerHTML = "";
  rows.forEach(m => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><strong>${m.id}</strong></td><td>${m.prob}%</td>
      <td><span class="badge badge-${m.risk.toLowerCase()}">${m.risk}</span></td>
      <td>${m.driver}</td><td>${m.action}</td>`;
    tbody.appendChild(tr);
  });
  $("advisor-count").textContent = `${rows.length.toLocaleString()} of ${d.count.toLocaleString()} members — sorted by risk, highest first`;
}

async function loadImpact() {
  const v = parseInt($("success-rate").value, 10);
  $("success-val").textContent = v;
  const d = await api("/api/impact?success=" + v);
  $("imp-flagged").textContent = d.high_flagged.toLocaleString();
  $("imp-saved").textContent = d.saved_members.toLocaleString();
  $("imp-revenue").textContent = "$" + d.revenue.toLocaleString();
  $("imp-note").textContent = `Assumes average member value of $${d.member_value.toLocaleString()}/year. At a ${v}% outreach success rate, ${d.saved_members.toLocaleString()} of ${d.high_flagged.toLocaleString()} high-risk members are retained — worth $${d.revenue.toLocaleString()} in preserved annual premium.`;
}

async function loadBatch() {
  const d = await api("/api/members?risk=ALL&q=");
  $("batch-total").textContent = d.count.toLocaleString();
  const highs = d.members.filter(m => m.risk === "HIGH").length;
  const meds = d.members.filter(m => m.risk === "MEDIUM").length;
  const lows = d.members.filter(m => m.risk === "LOW").length;
  $("batch-high").textContent = highs.toLocaleString();
  $("batch-medium").textContent = meds.toLocaleString();
  $("batch-low").textContent = lows.toLocaleString();
  const tbody = $("batch-rows");
  tbody.innerHTML = "";
  d.members.slice(0, 500).forEach(m => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><strong>${m.id}</strong></td><td>${m.prob}%</td>
      <td><span class="badge badge-${m.risk.toLowerCase()}">${m.risk}</span></td>
      <td>${m.driver}</td><td>${m.action}</td>`;
    tbody.appendChild(tr);
  });
  $("batch-count").textContent = `${d.count.toLocaleString()} members scored`;
  const dl = $("batch-download");
  if (lastDownloadUrl) {
    dl.classList.remove("hidden");
    dl.href = lastDownloadUrl;
  } else {
    dl.classList.add("hidden");
  }
}

// ============ SINGLE PATIENT ============

const PF_FIELDS = {
  pf_age: "Age",
  pf_days: "Days_Since_Last_Visit",
  pf_sat: "Overall_Satisfaction",
  pf_cost: "Avg_Out_Of_Pocket_Cost",
  pf_denials: "Claim_Denials",
  pf_adherence: "Medication_Adherence",
  pf_contacts: "Service_Contacts",
  pf_rural: "Rural",
};

$("patient-form").addEventListener("submit", async e => {
  e.preventDefault();
  const payload = { MemberID: $("pf-id").value || "SINGLE-001" };
  Object.entries(PF_FIELDS).forEach(([inputId, col]) => {
    const v = $(inputId).value;
    if (v !== "") payload[col] = parseFloat(v);
  });
  const status = $("pf-status");
  status.textContent = "⚙️ Scoring with the 4-algorithm ensemble…";
  status.className = "pf-status loading";
  try {
    const r = await fetch("/api/predict_single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (d.error) {
      status.textContent = "⚠️ " + d.error;
      status.className = "pf-status error";
      return;
    }
    status.textContent = "";
    status.className = "pf-status";
    lastPatient = d;
    renderSingle(d);
    renderFeatureChart(d.contributions || []);
    switchView("single");
    showToast(`${d.id} assessed — ${d.risk} risk, ${d.prob.toFixed(1)}%`, d.risk === "HIGH" ? "warning" : "success");
  } catch (err) {
    status.textContent = "⚠️ Server error — try again";
    status.className = "pf-status error";
  }
});

function renderSingle(d) {
  $("single-empty").classList.add("hidden");
  $("single-data").classList.remove("hidden");
  $("s-id").textContent = d.id;
  $("s-prob").textContent = d.prob.toFixed(1) + "%";
  $("s-risk").textContent = d.risk;
  $("s-risk").style.color = d.risk === "HIGH" ? "#ef4444" : d.risk === "MEDIUM" ? "#f97316" : "#22c55e";
  $("s-saved").textContent = "$" + d.member_value.toLocaleString();
  renderDriversList($("s-drivers"), d.drivers);
  const [cls, icon] = ACTION_META[d.action] || ["ac-care", "•"];
  const badge = $("s-action");
  badge.textContent = `${icon} ${d.action || "No action"}`;
  badge.style.background = cls === "ac-care" ? "linear-gradient(135deg,#0e7490,#0891b2)"
    : cls === "ac-benefit" ? "linear-gradient(135deg,#4338ca,#6366f1)"
    : cls === "ac-pharmacy" ? "linear-gradient(135deg,#6d28d9,#8b5cf6)"
    : "linear-gradient(135deg,#b45309,#d97706)";
  $("s-detail").textContent = d.detail || "";
  $("s-trigger").onclick = () => {
    showToast(`📞 Outreach triggered for ${d.id}: ${d.action} logged.`, "info");
  };
}

function renderFeatureChart(contributions) {
  if (!contributions || !contributions.length) {
    $("feature-data").classList.add("hidden");
    $("feature-empty").classList.remove("hidden");
    return;
  }
  $("feature-empty").classList.add("hidden");
  $("feature-data").classList.remove("hidden");
  if (charts.feature) charts.feature.destroy();
  const sorted = contributions.slice().sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  const show = sorted.slice(0, 10).reverse();
  charts.feature = new Chart($("feature-chart"), {
    type: "bar",
    data: {
      labels: show.map(x => x.feature),
      datasets: [{
        data: show.map(x => x.score),
        backgroundColor: show.map(x => x.score >= 0 ? "#ef4444" : "#22c55e"),
        borderRadius: 6, maxBarThickness: 22,
      }],
    },
    options: {
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `+${ctx.raw.toFixed(3)} (toward churn)` } },
      },
      scales: { x: { grid: { color: "#eef2f7" } }, y: { grid: { display: false } } },
    },
  });
}

// ============ UPLOAD ============

const dropZone = $("upload-drop");
const fileInput = $("upload-file");

["dragenter", "dragover"].forEach(ev => dropZone.addEventListener(ev, e => {
  e.preventDefault();
  dropZone.classList.add("dragover");
}));
["dragleave", "drop"].forEach(ev => dropZone.addEventListener(ev, e => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
}));
dropZone.addEventListener("drop", e => {
  const f = e.dataTransfer.files[0];
  if (f) selectFile(f);
});
dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", e => {
  if (e.target.files[0]) selectFile(e.target.files[0]);
});

function selectFile(file) {
  if (!file.name.endsWith(".csv")) {
    $("upload-status").innerHTML = '<div class="upload-error">Please choose a CSV file.</div>';
    return;
  }
  pendingFile = file;
  $("drop-text").textContent = `📄 ${file.name} ready — click Show Results`;
  $("show-results").classList.remove("hidden");
  $("upload-status").innerHTML = "";
}

async function uploadFile(file) {
  $("upload-status").innerHTML = '<div class="upload-loading">⚙️ Scoring members with the 4-algorithm ensemble…</div>';
  const fd = new FormData();
  fd.append("file", file);
  try {
    const r = await fetch("/api/predict", { method: "POST", body: fd });
    const d = await r.json();
    if (d.error) {
      $("upload-status").innerHTML = `<div class="upload-error">⚠️ ${d.error}</div>`;
      if (d.required) $("upload-status").innerHTML += `<div class="upload-hint">Model needs: ${d.required.join(", ")}</div>`;
      return;
    }
    $("upload-status").innerHTML = `<div class="upload-ok">✅ ${d.total.toLocaleString()} members scored — ${d.high.toLocaleString()} high risk, ${d.medium.toLocaleString()} medium, ${d.low.toLocaleString()} low. This dataset is now active across the dashboard.</div>`;
    if (d.warnings && d.warnings.length) {
      $("upload-status").innerHTML += `<div class="upload-hint">${d.warnings.join("<br>")}<br><a href="${d.download_url}" class="reset-btn">⬇️ Download full results (CSV)</a></div>`;
    } else {
      $("upload-status").innerHTML += `<div class="upload-hint"><a href="${d.download_url}" class="reset-btn">⬇️ Download full results (CSV)</a></div>`;
    }
    lastDownloadUrl = d.download_url;
    showToast(`✅ ${d.total.toLocaleString()} members scored and activated`);
    await refreshDatasetBadge();
  } catch (err) {
    $("upload-status").innerHTML = '<div class="upload-error">⚠️ Server error — please try again.</div>';
  }
}

refreshDatasetBadge();
switchView("overview");