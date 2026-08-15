import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

export default function RetentionAdvisor({ hasData }) {
  const { members, loading, error } = useApi();
  const [programFilter, setProgramFilter] = useState('ALL');
  const [data, setData] = useState(null);

  useEffect(() => {
    if (hasData) load();
  }, [hasData]);

  const load = async () => {
    const d = await members('ALL', '');
    setData(d);
  };

  if (!hasData) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <h3>No Data Loaded</h3>
        <p>Upload data in Overview to see retention actions</p>
      </div>
    );
  }

  const programs = data?.members?.reduce((acc, m) => {
    acc[m.program] = (acc[m.program] || 0) + 1;
    return acc;
  }, {}) || {};

  const programLabels = Object.keys(programs);
  const programColors = {
    'Care Outreach': '#0e7490',
    'Benefit Education': '#4338ca',
    'Pharmacy Support': '#6d28d9',
    'Service Recovery': '#b45309',
    'Access Support': '#059669',
    'Care Management': '#dc2626',
    'Wellness & Loyalty': '#d97706',
  };

  const filteredMembers = programFilter === 'ALL' ? data.members : data.members.filter(m => m.program === programFilter);

  return (
    <div className="view">
      <div className="topbar">
        <h1>Retention Advisor</h1>
        <p>Recommended action for every member</p>
      </div>

      <div className="action-cards" style={{ marginBottom: '1.5rem' }}>
        {programLabels.map(name => (
          <div key={name} className="action-card" style={{ background: `linear-gradient(135deg, ${programColors[name] || '#4f46e5'}, ${programColors[name] || '#4f46e5'}dd)` }}>
            <div className="ac-num">{programs[name]}</div>
            <div className="ac-lbl">{name}</div>
          </div>
        ))}
      </div>

      <div className="filters">
        <button className={`chip ${programFilter === 'ALL' ? 'active' : ''}`} onClick={() => setProgramFilter('ALL')}>All</button>
        {programLabels.map(name => (
          <button key={name} className={`chip ${programFilter === name ? 'active' : ''}`} onClick={() => setProgramFilter(name)}>
            {name}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>MemberID</th>
              <th>Prob %</th>
              <th>Risk</th>
              <th>Driver</th>
              <th>Program</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers?.map(m => (
              <tr key={m.id}>
                <td><strong>{m.id}</strong></td>
                <td>{m.prob}%</td>
                <td><span className={`badge badge-${m.risk.toLowerCase()}`}>{m.risk}</span></td>
                <td>{m.driver}</td>
                <td style={{ color: programColors[m.program] || '#4f46e5', fontWeight: 600 }}>{m.program}</td>
                <td>{m.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-foot">{filteredMembers.length} of {data.count} members shown</div>
    </div>
  );
}