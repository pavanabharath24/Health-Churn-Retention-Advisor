import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

export default function BatchResults({ hasData, downloadUrl }) {
  const { loading, error } = useApi();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (hasData && downloadUrl) {
      fetch(`/api/download/${downloadUrl.split('/').pop()}`)
        .then(r => r.text())
        .then(text => {
          const lines = text.trim().split('\n');
          const headers = lines[0].split(',');
          const rows = lines.slice(1).map(l => {
            const vals = l.split(',');
            return headers.reduce((obj, h, i) => ({ ...obj, [h]: vals[i] }), {});
          });
          setData({ headers, rows });
        });
    }
  }, [hasData, downloadUrl]);

  if (!hasData) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📤</div>
        <h3>No Batch Results</h3>
        <p>Upload data in Overview to see batch results</p>
      </div>
    );
  }

  return (
    <div className="view">
      <div className="topbar">
        <h1>Batch Results</h1>
        <p>Scoring summary and downloadable results</p>
      </div>

      {data && (
        <>
          <div className="kpis" style={{ marginBottom: '1.5rem' }}>
            <div className="metric-card">
              <div className="metric-val">{data.rows.length}</div>
              <div className="metric-lbl">Total Scored</div>
            </div>
            <div className="metric-card red">
              <div className="metric-val">{data.rows.filter(r => r.Risk_Tier === 'HIGH').length}</div>
              <div className="metric-lbl">HIGH Risk</div>
            </div>
            <div className="metric-card amber">
              <div className="metric-val">{data.rows.filter(r => r.Risk_Tier === 'MEDIUM').length}</div>
              <div className="metric-lbl">MEDIUM Risk</div>
            </div>
            <div className="metric-card green">
              <div className="metric-val">{data.rows.filter(r => r.Risk_Tier === 'LOW').length}</div>
              <div className="metric-lbl">LOW Risk</div>
            </div>
          </div>

          <div className="batch-actions" style={{ marginBottom: '1rem' }}>
            <a className="btn" href={`/api/download/${downloadUrl?.split('/').pop() || 'results.csv'}`} download>
              📥 Download Full Results CSV
            </a>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {data.headers.map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.rows.slice(0, 100).map((row, i) => (
                  <tr key={i}>
                    {data.headers.map(h => <td key={h}>{row[h]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-foot">Showing 100 of {data.rows.length} rows. Download CSV for full results.</div>
        </>
      )}
    </div>
  );
}