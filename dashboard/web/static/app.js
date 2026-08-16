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
  "Care Outreach": ["ac-care", `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"></path><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path></svg>`],
  "Benefit Education": ["ac-benefit", `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`],
  "Pharmacy Support": ["ac-pharmacy", `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 12h8"></path><path d="M12 8v8"></path></svg>`],
  "Service Recovery": ["ac-service", `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`],
};

function animateValue(obj, start, end, duration) {
  let startTimestamp = null;
  const isCurrency = obj.textContent.includes('$');
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const easeProgress = progress * (2 - progress);
    const current = Math.floor(easeProgress * (end - start) + start);
    obj.innerHTML = isCurrency ? '$' + current.toLocaleString() : current.toLocaleString();
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      obj.innerHTML = isCurrency ? '$' + end.toLocaleString() : end.toLocaleString();
    }
  };
  window.requestAnimationFrame(step);
}

function switchView(name) {
  VIEWS.forEach(v => {
    const el = $("view-" + v);
    if(v === name) {
        el.classList.add("active");
    } else {
        el.classList.remove("active");
    }
  });
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
  if(c.closest('#advisor-filters')) return;
  document.querySelectorAll(".chip:not(#advisor-filters .chip)").forEach(x => x.classList.remove("active"));
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
  el.innerHTML = `<span>${message}</span><button class="toast-x"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`;
  box.appendChild(el);
  el.querySelector(".toast-x").addEventListener("click", () => {
      el.classList.add('toast-fade-out');
      setTimeout(() => el.remove(), 300);
  });
  setTimeout(() => { 
      el.classList.add('toast-fade-out');
      setTimeout(() => el.remove(), 300); 
  }, 5000);
}

async function refreshDatasetBadge() {
  const d = await api("/api/dataset");
  hasData = d.has_data;
  const badge = $("dataset-badge");
  const uploaded = d.filename !== null;
  badge.classList.toggle("uploaded", uploaded);
  
  const icon = uploaded ? `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>` : `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

  badge.innerHTML = uploaded
    ? `${icon} Active: <b>${d.source}</b> (${d.total.toLocaleString()} members) <button id="reset-btn" class="reset-btn" title="Clear and start fresh"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg> Clear</button>`
    : `${icon} Active: <b>no dataset loaded</b>`;
  
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
  $("drop-text").innerHTML = "Drag & drop your member CSV here, or <u>click to browse</u>";
  $("show-results").classList.add("hidden");
  $("upload-status").innerHTML = "";
  await refreshDatasetBadge();
  showToast("Dataset cleared — start fresh with a new upload", "info");
}

async function loadOverview() {
  const d = await api("/api/overview");
  if (d.status === "nodata") return;
  
  animateValue($("kpi-total"), 0, d.total, 800);
  animateValue($("kpi-high"), 0, d.high, 800);
  animateValue($("kpi-medium"), 0, d.medium, 800);
  animateValue($("kpi-low"), 0, d.low, 800);
  
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
      animation: { duration: 1000, easing: 'easeOutQuart' }
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
      datasets: [{ data: tiers.map(t => t.v), backgroundColor: tiers.map(t => t.color), borderWidth: 0, hoverOffset: 4 }],
    },
    options: { plugins: { legend: { position: "bottom" } }, cutout: "68%", animation: { animateScale: true, animateRotate: true, duration: 1000, easing: 'easeOutQuart' } },
  });
}

function renderDrivers(drivers) {
  if (charts.drivers) charts.drivers.destroy();
  if (!drivers.length) {
    charts.drivers = new Chart($("chart-drivers"), {
      type: "bar",
      data: { labels: ["no driver data"], datasets: [{ data: [0], backgroundColor: "#e2e8f0" }] },
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
      animation: { duration: 1000, easing: 'easeOutQuart' }
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
  entries.forEach(([name, n], idx) => {
    const [cls, icon] = ACTION_META[name] || ["ac-care", ""];
    const el = document.createElement("div");
    el.className = "action-card " + cls;
    el.style.animationDelay = `${idx * 0.1}s`;
    el.style.animation = `viewEnter 0.5s ease backwards`;
    el.innerHTML = `<div class="ac-num">${icon} <span class="counter">${n.toLocaleString()}</span></div><div class="ac-lbl">${name}</div>`;
    box.appendChild(el);
  });
}

async function loadMembers() {
  const q = $("member-search").value.trim();
  const d = await api("/api/members?risk=" + currentRisk + "&q=" + encodeURIComponent(q));
  const tbody = $("member-rows");
  tbody.innerHTML = "";
  d.members.forEach((m, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.id = m.id;
    tr.style.animationDelay = `${idx * 0.03}s`;
    tr.innerHTML = `<td><strong>${m.id}</strong></td><td>${m.age}</td><td>${m.plan}</td><td>${m.city}</td>
      <td><strong>${m.prob}%</strong></td><td><span class="badge badge-${m.risk.toLowerCase()}">${m.risk}</span></td>`;
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
  
  let currentP = 0;
  const pInterval = setInterval(() => {
      currentP += Math.ceil(p / 20);
      if(currentP >= p) {
          currentP = p;
          clearInterval(pInterval);
      }
      $("gauge-val").textContent = currentP + "%";
  }, 30);

  renderDriversList($("d-drivers"), d.drivers);

  const [cls, icon] = ACTION_META[d.action] || ["ac-care", ""];
  const badge = $("d-action");
  badge.innerHTML = `${icon} ${d.action || "No action"}`;
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
  drivers.forEach((drv, idx) => {
    const row = document.createElement("div");
    row.className = "driver-row";
    row.style.animation = `viewEnter 0.4s ease backwards`;
    row.style.animationDelay = `${idx * 0.05}s`;
    row.innerHTML = `
      <div class="driver-name">${drv.feature}</div>
      <div style="text-align:right"><span class="driver-val">${drv.score > 0 ? '+' : ''}${drv.score.toFixed(2)}</span></div>
    `;
    const bar = document.createElement("div");
    bar.className = "driver-bar";
    const targetWidth = Math.max(5, Math.min(100, Math.abs(drv.score) / maxScore * 100));
    bar.innerHTML = `<i style="width: 0%"></i>`;
    box.appendChild(row);
    box.appendChild(bar);
    setTimeout(() => {
        bar.querySelector('i').style.width = targetWidth + '%';
    }, 50 + (idx * 50));
  });
}

async function loadAdvisor() {
  const d = await api("/api/members?risk=ALL");
  const summary = {};
  const ORDER = ["Care Outreach", "Benefit Education", "Pharmacy Support", "Service Recovery"];
  d.members.forEach(m => { summary[m.action] = (summary[m.action] || 0) + 1; });
  const box = $("advisor-summary");
  box.innerHTML = "";
  ORDER.forEach((name, idx) => {
    const n = summary[name] || 0;
    const [cls, icon] = ACTION_META[name] || ["ac-care", ""];
    const el = document.createElement("div");
    el.className = "action-card " + cls;
    el.style.animationDelay = `${idx * 0.1}s`;
    el.style.animation = `viewEnter 0.5s ease backwards`;
    el.innerHTML = `<div class="ac-num">${icon} ${n.toLocaleString()}</div><div class="ac-lbl">${name}</div>`;
    box.appendChild(el);
  });

  const rows = d.members.filter(m => currentAction === "ALL" || m.action === currentAction);
  const tbody = $("advisor-rows");
  tbody.innerHTML = "";
  rows.forEach((m, idx) => {
    const tr = document.createElement("tr");
    tr.style.animationDelay = `${idx * 0.03}s`;
    tr.innerHTML = `<td><strong>${m.id}</strong></td><td><strong>${m.prob}%</strong></td>
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
  animateValue($("imp-flagged"), 0, d.high_flagged, 500);
  animateValue($("imp-saved"), 0, d.saved_members, 500);
  
  const revEl = $("imp-revenue");
  if(!revEl.textContent.includes('$')) revEl.textContent = '$0';
  animateValue(revEl, parseInt(revEl.textContent.replace(/\\$|,/g, '')), d.revenue, 500);
  
  $("imp-note").innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" style="vertical-align: middle; margin-right: 5px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>Assumes average member value of $${d.member_value.toLocaleString()}/year. At a ${v}% outreach success rate, ${d.saved_members.toLocaleString()} of ${d.high_flagged.toLocaleString()} high-risk members are retained — worth <strong>$${d.revenue.toLocaleString()}</strong> in preserved annual premium.`;
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
  d.members.slice(0, 500).forEach((m, idx) => {
    const tr = document.createElement("tr");
    tr.style.animationDelay = `${idx * 0.03}s`;
    tr.innerHTML = `<td><strong>${m.id}</strong></td><td><strong>${m.prob}%</strong></td>
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

$("patient-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const st = $("pf-status");
  st.className = "pf-status loading";
  st.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" class="spin"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="4.93" x2="19.07" y2="7.76"></line></svg> Assessing risk...`;

  const req = {};
  for (const [id, col] of Object.entries(PF_FIELDS)) {
    const v = $(id).value;
    if (v !== "") req[col] = parseFloat(v);
  }

  try {
    const res = await fetch("/api/predict_single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req)
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error);

    st.className = "pf-status";
    st.textContent = "";
    lastPatient = { id: $("pf-id").value || "Unknown", ...d };
    showToast("Assessment complete", "success");
    switchView("single");
  } catch (err) {
    st.className = "pf-status error";
    st.textContent = "Error: " + err.message;
  }
});

function renderSingle(d) {
  $("single-empty").classList.add("hidden");
  $("single-data").classList.remove("hidden");
  $("s-id").textContent = d.id;
  
  const probEl = $("s-prob");
  probEl.innerHTML = '';
  animateValue(probEl, 0, d.prob, 800);
  setTimeout(() => probEl.innerHTML += '%', 850);
  
  $("s-risk").textContent = d.risk;
  $("s-saved").textContent = "$1,800";
  
  renderDriversList($("s-drivers"), d.drivers);
  
  const [cls, icon] = ACTION_META[d.action] || ["ac-care", ""];
  const badge = $("s-action");
  badge.innerHTML = `${icon} ${d.action || "No action"}`;
  badge.style.background = cls === "ac-care" ? "linear-gradient(135deg,#0e7490,#0891b2)"
    : cls === "ac-benefit" ? "linear-gradient(135deg,#4338ca,#6366f1)"
    : cls === "ac-pharmacy" ? "linear-gradient(135deg,#6d28d9,#8b5cf6)"
    : "linear-gradient(135deg,#b45309,#d97706)";
  $("s-detail").textContent = d.detail || "";
}

function renderFeatureChart(contribs) {
  $("feature-empty").classList.add("hidden");
  $("feature-data").classList.remove("hidden");
  if (charts.feature) charts.feature.destroy();
  if (!contribs.length) return;
  const labels = contribs.map(c => c.feature);
  const data = contribs.map(c => c.score);
  const colors = data.map(v => v > 0 ? "#ef4444" : "#22c55e");

  charts.feature = new Chart($("feature-chart"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{ data: data, backgroundColor: colors, borderRadius: 4 }]
    },
    options: {
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => (c.raw > 0 ? "+" : "") + c.raw.toFixed(3) } }
      },
      scales: {
        x: { grid: { color: "#eef2f7" } },
        y: { grid: { display: false } }
      },
      animation: { duration: 1000, easing: 'easeOutQuart' }
    }
  });
}

$("s-trigger")?.addEventListener("click", () => {
  showToast("Outreach triggered for " + $("s-id").textContent, "info");
});

// ============ UPLOAD LOGIC ============
const drop = $("upload-drop");
const fileIn = $("upload-file");
drop.addEventListener("click", () => fileIn.click());
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("dragover"); });
drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
drop.addEventListener("drop", (e) => {
  e.preventDefault(); drop.classList.remove("dragover");
  if (e.dataTransfer.files.length) handleSelect(e.dataTransfer.files[0]);
});
fileIn.addEventListener("change", (e) => {
  if (e.target.files.length) handleSelect(e.target.files[0]);
});

function handleSelect(f) {
  if (!f.name.endsWith(".csv")) {
    $("upload-status").innerHTML = `<div class="upload-error"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Please upload a CSV file</div>`;
    return;
  }
  pendingFile = f;
  $("drop-text").innerHTML = `Selected: <b>${f.name}</b> (${(f.size/1024).toFixed(1)} KB)`;
  $("show-results").classList.remove("hidden");
  $("upload-status").innerHTML = "";
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  $("show-results").classList.add("hidden");
  $("upload-status").innerHTML = `<div class="upload-loading"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" class="spin"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="4.93" x2="19.07" y2="7.76"></line></svg> Scoring members with 4-model ensemble...</div>`;
  
  try {
    const res = await fetch("/api/predict", { method: "POST", body: fd });
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    
    $("upload-status").innerHTML = `<div class="upload-ok"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> Success! Scored ${d.rows_scored.toLocaleString()} members.</div>`;
    lastDownloadUrl = d.download_url;
    pendingFile = null;
    await refreshDatasetBadge();
    showToast(`Scored ${d.rows_scored.toLocaleString()} members successfully`, "success");
  } catch (err) {
    $("upload-status").innerHTML = `<div class="upload-error"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Error: ${err.message}</div>`;
    $("show-results").classList.remove("hidden");
  }
}

// Add CSS for spin animation dynamically
const style = document.createElement('style');
style.textContent = \`
@keyframes spin { 100% { transform: rotate(360deg); } }
.spin { animation: spin 2s linear infinite; }
\`;
document.head.appendChild(style);

document.addEventListener("DOMContentLoaded", refreshDatasetBadge);