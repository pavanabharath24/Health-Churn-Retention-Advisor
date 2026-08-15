import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

export default function Overview({ hasData, onUpload, onReset }) {
  const { upload, overview, loading, error } = useApi();
  const [file, setFile] = useState(null);
  const [data, setData] = useState(null);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (hasData) {
      overview().then(setData);
    }
  }, [hasData, overview]);

  const handleUpload = async () => {
    if (!file) return;
    const res = await upload(file);
    setData(res);
    onUpload?.(res);
    setShowResults(false);
  };

  if (!hasData && !data) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📁</div>
        <h3>No Data Loaded</h3>
        <p>Upload a CSV with member data to begin</p>
        <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} />
        <button className="btn" onClick={handleUpload} disabled={loading || !file}>
          {loading ? 'Uploading...' : '🚀 Show Results'}
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📁</div>
        <h3>Ready to Analyze</h3>
        <p>File selected: <strong>{file?.name}</strong></p>
        <button className="btn" onClick={handleUpload} disabled={loading}>
          {loading ? 'Uploading...' : '🚀 Show Results'}
        </button>
        <button className="btn secondary" onClick={() => { setFile(null); onReset?.(); }}>
          Clear
        </button>
      </div>
    );
  }

  const tiers = ['HIGH', 'MEDIUM', 'LOW'];
  const tierColors = ['#ef4444', '#f97316', '#22c55e'];
  const tierCounts = tiers.map(t => data[t.toLowerCase()] || 0);

  const barData = {
    labels: tiers,
    datasets: [{ label: 'Members', data: tierCounts, backgroundColor: tierColors }],
  };

  const doughnutData = {
    labels: tiers,
    datasets: [{ data: tierCounts, backgroundColor: tierColors }],
  };

  const actionData = {
    labels: Object.keys(data.action_counts || {}),
    datasets: [{ label: 'Count', data: Object.values(data.action_counts || {}), backgroundColor: '#4f46e5' }],
  };

  return (
    <div className="view">
      <div className="topbar">
        <div>
          <h1>Overview</h1>
          <p>{data.total?.toLocaleString()} members analyzed</p>
        </div>
        <div className="dataset-badge uploaded">
          <b>{data.filename}</b> — <span>{data.total?.toLocaleString()} members</span>
          <button className="reset-btn" onClick={onReset}>↺ Clear</button>
        </div>
      </div>

      <div className="kpis">
        <div className="metric-card red">
          <div className="metric-val">{data.high}</div>
          <div className="metric-lbl">HIGH Risk</div>
        </div>
        <div className="metric-card amber">
          <div className="metric-val">{data.medium}</div>
          <div className="metric-lbl">MEDIUM Risk</div>
        </div>
        <div className="metric-card green">
          <div className="metric-val">{data.low}</div>
          <div className="metric-lbl">LOW Risk</div>
        </div>
        <div className="metric-card">
          <div className="metric-val">{data.total}</div>
          <div className="metric-lbl">Total Members</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="section-title">Risk Distribution</div>
          <Bar data={barData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
        </div>
        <div className="card">
          <div className="section-title">Risk Share</div>
          <div className="donut-wrap" style={{ height: '250px' }}>
            <Doughnut data={doughnutData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} />
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="section-title">Top Portfolio Drivers</div>
          <div style={{ height: '250px' }}>
            <Bar 
              data={{
                labels: data.global_drivers?.slice(0, 10).map(d => d.feature) || [],
                datasets: [{ label: 'Importance', data: data.global_drivers?.slice(0, 10).map(d => d.importance) || [], backgroundColor: '#4f46e5' }],
              }} 
              options={{ indexAxis: 'y', responsive: true, plugins: { legend: { display: false } } }} 
            />
          </div>
        </div>
        <div className="card">
          <div className="section-title">Recommended Actions</div>
          <div style={{ height: '250px' }}>
            <Bar 
              data={actionData} 
              options={{ indexAxis: 'y', responsive: true, plugins: { legend: { display: false } } }} 
            />
          </div>
        </div>
      </div>
    </div>
  );
}