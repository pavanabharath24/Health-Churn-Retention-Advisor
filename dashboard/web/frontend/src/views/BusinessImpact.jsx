import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

export default function BusinessImpact({ hasData }) {
  const { impact, loading, error } = useApi();
  const [success, setSuccess] = useState(30);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (hasData) load();
  }, [hasData, success]);

  const load = async () => {
    const d = await impact(success);
    setData(d);
  };

if (!hasData) {
    return (
      <div className="empty-state">
        <h3 className="empty-title">No Data Loaded</h3>
        <p className="empty-desc">Upload data in Overview to see business impact</p>
      </div>
    );
  }

  return (
    <div className="view">
      <div className="topbar">
        <h1>Business Impact</h1>
        <p>Simulation: outreach success rate vs revenue preserved</p>
      </div>

      <div className="card">
        <div className="section-title">Retention Simulation</div>
        <div className="impact-control">
          <label>Outreach Success Rate: <span id="success-val">{success}%</span></label>
          <input
            type="range"
            min="5"
            max="60"
            value={success}
            onChange={e => {
              setSuccess(+e.target.value);
              document.getElementById('success-val').textContent = +e.target.value + '%';
            }}
          />
          <div className="impact-val" id="impact-val">{success}%</div>
        </div>
        <div className="impact-results">
          <div className="impact-revenue" style={{ color: '#fca5a5' }}>
            ${(data?.revenue || 0).toLocaleString()}
          </div>
          <div style={{ color: '#94a3b8', marginTop: '0.5rem' }}>Revenue Preserved</div>
          <div className="impact-kpis" style={{ marginTop: '1rem' }}>
            <div className="metric-card red">
              <div className="metric-val">{data?.high_flagged || 0}</div>
              <div className="metric-lbl">High-Risk Flagged</div>
            </div>
            <div className="metric-card amber">
              <div className="metric-val">{data?.saved_members || 0}</div>
              <div className="metric-lbl">Members Saved</div>
            </div>
            <div className="metric-card green">
              <div className="metric-val">${(data?.member_value || 1800).toLocaleString()}</div>
              <div className="metric-lbl">Value per Member</div>
            </div>
          </div>
          <div className="impact-note" style={{ marginTop: '0.7rem', fontSize: '0.75rem', color: '#94a3b8' }}>
            Assumes average member value of ${(data?.member_value || 1800).toLocaleString()}/year. 
            At a {success}% outreach success rate, {data?.saved_members || 0} of {data?.high_flagged || 0} high-risk members are retained — worth ${(data?.revenue || 0).toLocaleString()} in preserved annual premium.
          </div>
        </div>
      </div>
    </div>
  );
}