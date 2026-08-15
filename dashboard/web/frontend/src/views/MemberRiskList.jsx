import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../hooks/useApi';

export default function MemberRiskList({ hasData, onMemberClick }) {
  const { members, loading, error } = useApi();
  const [risk, setRisk] = useState('ALL');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    if (hasData) load();
  }, [hasData, risk, search]);

  const load = async () => {
    const d = await members(risk, search);
    setData(d);
  };

  if (!hasData) {
    return (
      <div className="empty-state">
        <div className="empty-icon">👥</div>
        <h3>No Member Data</h3>
        <p>Upload data in Overview to see risk list</p>
      </div>
    );
  }

  const riskChips = [
    { label: 'ALL', value: 'ALL' },
    { label: 'HIGH', value: 'HIGH' },
    { label: 'MEDIUM', value: 'MEDIUM' },
    { label: 'LOW', value: 'LOW' },
  ];

  return (
    <div className="view">
      <div className="topbar">
        <div>
          <h1>Member Risk List</h1>
          <p>{data?.count?.toLocaleString()} members — sorted by risk, highest first</p>
        </div>
        <input
          type="text"
          className="search"
          placeholder="Search MemberID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="filters">
        {riskChips.map(c => (
          <button
            key={c.value}
            className={`chip ${c.value.toLowerCase()} ${risk === c.value ? 'active' : ''}`}
            onClick={() => setRisk(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>MemberID</th>
              <th>Age</th>
              <th>Plan</th>
              <th>City</th>
              <th>Prob %</th>
              <th>Risk</th>
              <th>Driver</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data?.members?.map(m => (
              <tr key={m.id} onClick={() => onMemberClick?.(m.id)} style={{ cursor: 'pointer' }}>
                <td><strong>{m.id}</strong></td>
                <td>{m.age}</td>
                <td>{m.plan}</td>
                <td>{m.city}</td>
                <td>{m.prob}%</td>
                <td><span className={`badge badge-${m.risk.toLowerCase()}`}>{m.risk}</span></td>
                <td>{m.driver}</td>
                <td>{m.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-foot">{data?.count} members total</div>
    </div>
  );
}