import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const PROGRAM_COLORS = {
  'Care Outreach': '#0e7490',
  'Benefit Education': '#4338ca',
  'Pharmacy Support': '#6d28d9',
  'Service Recovery': '#b45309',
  'Access Support': '#059669',
  'Care Management': '#dc2626',
  'Wellness & Loyalty': '#d97706',
};

export default function SinglePatient({ hasData, onPredict, patientData }) {
  const { predictSingle, loading, error } = useApi();
  const [form, setForm] = useState({
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
  const [result, setResult] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await predictSingle(form);
    setResult(res);
    onPredict?.(res);
  };

  if (!hasData && !result) {
    return (
      <div className="empty-state">
        <h3 className="empty-title">Single Patient Assessment</h3>
        <p className="empty-desc">Fill the form or click a member to assess churn risk</p>
      </div>
    );
  }

  return (
    <div className="view">
      <div className="topbar">
        <h1>Single Patient Assessment</h1>
        <p>Enter member details to get churn risk and recommended action</p>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="section-title">Patient Details</div>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
              <div>
                <label className="pf-label">MemberID</label>
                <input className="pf-input" value={form.MemberID} onChange={e => setForm({...form, MemberID: e.target.value})} />
              </div>
              <div>
                <label className="pf-label">Age</label>
                <input className="pf-input" type="number" value={form.Age} onChange={e => setForm({...form, Age: +e.target.value})} />
              </div>
              <div>
                <label className="pf-label">Days Since Last Visit</label>
                <input className="pf-input" type="number" value={form.Days_Since_Last_Visit} onChange={e => setForm({...form, Days_Since_Last_Visit: +e.target.value})} />
              </div>
              <div>
                <label className="pf-label">Satisfaction (1-5)</label>
                <input className="pf-input" type="number" step="0.1" value={form.Overall_Satisfaction} onChange={e => setForm({...form, Overall_Satisfaction: +e.target.value})} />
              </div>
              <div>
                <label className="pf-label">OOP Cost ($)</label>
                <input className="pf-input" type="number" value={form.Avg_Out_Of_Pocket_Cost} onChange={e => setForm({...form, Avg_Out_Of_Pocket_Cost: +e.target.value})} />
              </div>
              <div>
                <label className="pf-label">Claim Denials</label>
                <input className="pf-input" type="number" value={form.Claim_Denials} onChange={e => setForm({...form, Claim_Denials: +e.target.value})} />
              </div>
              <div>
                <label className="pf-label">Adherence (0-1)</label>
                <input className="pf-input" type="number" step="0.01" value={form.Medication_Adherence} onChange={e => setForm({...form, Medication_Adherence: +e.target.value})} />
              </div>
              <div>
                <label className="pf-label">Service Contacts</label>
                <input className="pf-input" type="number" value={form.Service_Contacts} onChange={e => setForm({...form, Service_Contacts: +e.target.value})} />
              </div>
              <div>
                <label className="pf-label">Rural</label>
                <select className="pf-input" value={form.Rural} onChange={e => setForm({...form, Rural: +e.target.value})}>
                  <option value={0}>Urban</option>
                  <option value={1}>Rural</option>
                </select>
              </div>
            </div>
            <button className="btn" type="submit" disabled={loading} style={{ marginTop: '0.7rem', width: '100%' }}>
              {loading ? 'Assessing...' : 'Assess Risk'}
            </button>
          </form>
        </div>

        {result && (
          <div className="card">
            <div className="section-title">Assessment Result</div>
            <div style={{ textAlign: 'center', padding: '1rem' }}>
              <div style={{ fontSize: '2.8rem', fontWeight: 800, color: result.risk === 'HIGH' ? '#fca5a5' : result.risk === 'MEDIUM' ? '#fbbf24' : '#84cc16' }}>
                {result.prob}%
              </div>
              <div style={{ margin: '0.7rem auto', display: 'inline-block', padding: '0.5rem 0.8rem', borderRadius: '0.5rem', fontWeight: 500, fontSize: '0.85rem' }}>
                {result.risk} RISK
              </div>
              <div className="action-badge" style={{ margin: '0.7rem auto 0 auto', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', fontWeight: 550, fontSize: '0.8rem', textAlign: 'center', background: `linear-gradient(135deg, ${PROGRAM_COLORS[result.program] || '#64748b'}, ${PROGRAM_COLORS[result.program] || '#64748b'}dd)` }}>
                {result.program} — {result.action}
              </div>
              <p style={{ color: '#94a3b8', margin: '0.5rem 0 0.8rem 0' }}>Member value at risk: ${result.member_value?.toLocaleString()}/year</p>
            </div>

            <div className="section-title" style={{ marginTop: '1.2rem' }}>Top Drivers</div>
            <div style={{ height: '200px' }}>
              <Bar 
                data={{
                  labels: result.drivers?.map(d => d.feature) || [],
                  datasets: [{ 
                    label: 'SHAP Score', 
                    data: result.drivers?.map(d => d.score) || [], 
                    backgroundColor: result.drivers?.map(d => d.score >= 0 ? '#22c55e' : '#f87171') || [],
                  }],
                }} 
                options={{ indexAxis: 'y', responsive: true, plugins: { legend: { display: false } } }} 
              />
            </div>

            <button className="btn" style={{ marginTop: '0.7rem', width: '100%', padding: '0.55rem 0.7rem' }} onClick={() => alert('Outreach initiated for ' + result.MemberID)}>
              Initiate Outreach
            </button>
          </div>
        )}
      </div>
    </div>
  );
}