import { useState, useEffect, useCallback } from 'react';
import { useApi } from './hooks/useApi';
import Overview from './views/Overview';
import MemberRiskList from './views/MemberRiskList';
import SinglePatient from './views/SinglePatient';
import RetentionAdvisor from './views/RetentionAdvisor';
import BusinessImpact from './views/BusinessImpact';
import FeatureChart from './views/FeatureChart';
import BatchResults from './views/BatchResults';
import './App.css';

const VIEWS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'members', label: 'Member Risk List', icon: '👥' },
  { id: 'single', label: 'Single Patient', icon: '👤' },
  { id: 'advisor', label: 'Retention Advisor', icon: '📋' },
  { id: 'impact', label: 'Business Impact', icon: '💰' },
  { id: 'feature', label: 'Feature Chart', icon: '📈' },
  { id: 'batch', label: 'Batch Results', icon: '📤' },
];

function Sidebar({ activeView, onViewChange, hasData, onUpload, onReset, onPredictSingle }) {
  const { upload, predictSingle, loading } = useApi();
  const [sidebarForm, setSidebarForm] = useState({
    MemberID: 'SINGLE-001',
    Age: 50,
    Days_Since_Last_Visit: 30,
    Overall_Satisfaction: 3.5,
    Avg_Out_Of_Pocket_Cost: 2000,
    Claim_Denials: 1,
    Medication_Adherence: 0.8,
    Service_Contacts: 2,
    Rural: 0,
  });

  const handleSidebarPredict = async () => {
    const res = await predictSingle(sidebarForm);
    onPredictSingle?.(res);
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo">🏥</span>
        <div>
          <div className="brand-name">Retention Advisor</div>
          <div className="brand-sub">Health Plan Churn Prediction</div>
        </div>
      </div>

      <div className="sidebar-section">NAVIGATION</div>
      <nav className="nav">
        {VIEWS.map(v => (
          <button
            key={v.id}
            className={`nav-item ${activeView === v.id ? 'active' : ''}`}
            onClick={() => onViewChange(v.id)}
            disabled={!hasData && v.id !== 'overview' && v.id !== 'single'}
          >
            <span className="nav-icon">{v.icon}</span>
            {v.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-section">PATIENT INPUT</div>
      <div className="patient-form-wrap">
        <div className="pf-title">Quick Assessment</div>
        <div className="pf-sub">Enter member details for instant risk scoring</div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div>
            <label className="pf-label">MemberID</label>
            <input className="pf-input" value={sidebarForm.MemberID} onChange={e => setSidebarForm({...sidebarForm, MemberID: e.target.value})} />
          </div>
          <div>
            <label className="pf-label">Age</label>
            <input className="pf-input" type="number" value={sidebarForm.Age} onChange={e => setSidebarForm({...sidebarForm, Age: +e.target.value})} />
          </div>
          <div>
            <label className="pf-label">Days Since Visit</label>
            <input className="pf-input" type="number" value={sidebarForm.Days_Since_Last_Visit} onChange={e => setSidebarForm({...sidebarForm, Days_Since_Last_Visit: +e.target.value})} />
          </div>
          <div>
            <label className="pf-label">Satisfaction (1-5)</label>
            <input className="pf-input" type="number" step="0.1" value={sidebarForm.Overall_Satisfaction} onChange={e => setSidebarForm({...sidebarForm, Overall_Satisfaction: +e.target.value})} />
          </div>
          <div>
            <label className="pf-label">OOP Cost ($)</label>
            <input className="pf-input" type="number" value={sidebarForm.Avg_Out_Of_Pocket_Cost} onChange={e => setSidebarForm({...sidebarForm, Avg_Out_Of_Pocket_Cost: +e.target.value})} />
          </div>
          <div>
            <label className="pf-label">Claim Denials</label>
            <input className="pf-input" type="number" value={sidebarForm.Claim_Denials} onChange={e => setSidebarForm({...sidebarForm, Claim_Denials: +e.target.value})} />
          </div>
          <div>
            <label className="pf-label">Adherence (0-1)</label>
            <input className="pf-input" type="number" step="0.01" value={sidebarForm.Medication_Adherence} onChange={e => setSidebarForm({...sidebarForm, Medication_Adherence: +e.target.value})} />
          </div>
          <div>
            <label className="pf-label">Service Contacts</label>
            <input className="pf-input" type="number" value={sidebarForm.Service_Contacts} onChange={e => setSidebarForm({...sidebarForm, Service_Contacts: +e.target.value})} />
          </div>
          <div>
            <label className="pf-label">Rural</label>
            <select className="pf-input" value={sidebarForm.Rural} onChange={e => setSidebarForm({...sidebarForm, Rural: +e.target.value})}>
              <option value={0}>Urban</option>
              <option value={1}>Rural</option>
            </select>
          </div>
        </div>

        <button className="btn-sidebar" onClick={handleSidebarPredict} disabled={loading}>
          {loading ? 'Assessing...' : '🧠 Assess Risk'}
        </button>
      </div>

      <div className="sidebar-section">MODEL</div>
      <div className="model-chip">
        <div className="model-chip-title">Ensemble</div>
        <div className="model-chip-row"><span>Logistic Regression</span><b>0.80</b></div>
        <div className="model-chip-row"><span>Random Forest</span><b>0.79</b></div>
        <div className="model-chip-row"><span>Gradient Boosting</span><b>0.79</b></div>
        <div className="model-chip-row"><span>XGBoost</span><b>0.77</b></div>
      </div>

      <div className="sidebar-foot">
        Retention Advisor v2.0 — Flask + React
      </div>
    </aside>
  );
}

function App() {
  const [activeView, setActiveView] = useState('overview');
  const [hasData, setHasData] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [lastPatient, setLastPatient] = useState(null);
  const [lastDownloadUrl, setLastDownloadUrl] = useState(null);
  const [toasts, setToasts] = useState([]);

  const { reset } = useApi();

  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(t => t.id !== id)), 5000);
  };

  const handleUpload = (file) => {
    setPendingFile(file);
  };

  const handleShowResults = async () => {
    if (!pendingFile) return;
    // Upload will be handled by Overview component
  };

  const handleReset = async () => {
    setHasData(false);
    setPendingFile(null);
    setLastPatient(null);
    setLastDownloadUrl(null);
    await fetch('/api/reset', { method: 'POST' });
    showToast('Dataset cleared', 'info');
  };

  const handleUploadComplete = (res) => {
    setHasData(true);
    setLastDownloadUrl(res.download_url);
    showToast(`Uploaded ${res.total} members`, 'success');
  };

  const handlePredictSingle = (res) => {
    setLastPatient(res);
    showToast(`Assessed ${res.id}: ${res.prob}% ${res.risk}`, 'info');
  };

  const handleMemberClick = async (id) => {
    // Could fetch member detail and show in single view
  };

  const handlePredictFromSidebar = (res) => {
    setLastPatient(res);
    setActiveView('single');
  };

  return (
    <div className="layout">
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        hasData={hasData}
        onUpload={handleUpload}
        onReset={handleReset}
        onPredictSingle={handlePredictFromSidebar}
      />

      <main className="main">
        <header className="app-header">
          <h1 className="app-title">Member Retention Advisor</h1>
          <p className="app-subtitle">Predict churn, explain why, recommend action — for every health-plan member</p>
          <div className="header-stats">
            <span className="dataset-badge" id="dataset-badge">
              {hasData ? `Active dataset loaded` : 'No data loaded'}
            </span>
          </div>
        </header>

        <div className="toast-container" id="toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast-${t.type}`}>
              <span>{t.message}</span>
              <button className="toast-x" onClick={() => setToasts(toasts => toasts.filter(x => x.id !== t.id))}>✕</button>
            </div>
          ))}
        </div>

        <Overview
          hasData={hasData}
          onUpload={handleUpload}
          onReset={handleReset}
          pendingFile={pendingFile}
        />
        <MemberRiskList hasData={hasData} onMemberClick={handleMemberClick} />
        <SinglePatient hasData={hasData} onPredict={handlePredictFromSidebar} patientData={null} />
        <RetentionAdvisor hasData={hasData} />
        <BusinessImpact hasData={hasData} />
        <FeatureChart hasData={hasData} contributions={[]} />
        <BatchResults hasData={hasData} downloadUrl="" />
      </main>
    </div>
  );
}

export default App;