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
        <div className="empty-icon">💰</div>
        <h3>No Data Loaded</h3>
        <p>Upload data in Overview to see business impact</p>
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
        <div className="impact-row">
          <div className="impact-control">
            <label>Outreach Success Rate: {success}%</label>
            <input
              type="range"
              min="5"
              max="60"
              value={success}
              onChange={e => setSuccess(+e.target.value)}
            />
            <div className="impact-val">{success}%</div>
          </div>
          <div>
            <div className="impact-val" style={{ color: '#ef4444' }}>${data?.revenue?.toLocaleString() || 0}</div>
            <div style={{ color: '#6b7280', marginTop: '0.5rem' }}>Revenue Preserved</div>
            <div className="kpis" style={{ marginTop: '1.5rem' }}>
              <div className="metric-card red">
                <div className="metric-val">{data?.high_flagged || 0}</div>
                <div className="metric-lbl">High-Risk Flagged</div>
              </div>
              <div className="metric-card amber">
                <div className="metric-val">{data?.saved_members || 0}</div>
                <div className="metric-lbl">Members Saved</div>
              </div>
              <div className="metric-card green">
                <div className="metric-val">{data?.member_value || 1800}</div>
                <div className="metric-lbl">Value per Member</div>
              </div>
            </div>
            <div className="impact-note">
              Assumes average member value of ${data?.member_value?.toLocaleString() || 1800}/year. 
              At a {success}% outreach success rate, {data?.saved_members || 0} of {data?.high_flagged || 0} high-risk members are retained — worth ${data?.revenue?.toLocaleString() || 0} in preserved annual premium.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}