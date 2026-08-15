import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function FeatureChart({ hasData, contributions }) {
  const [data, setData] = useState(contributions || []);

  useEffect(() => {
    if (contributions) setData(contributions);
  }, [contributions]);

if (!hasData || !data.length) {
    return (
      <div className="empty-state">
        <h3 className="empty-title">Feature Chart</h3>
        <p className="empty-desc">Assess a patient or click a member to see SHAP contributions</p>
      </div>
    );
  }

  return (
    <div className="view">
      <div className="topbar">
        <h1>Feature Chart (SHAP</h1>
        <p>Red features increase churn risk; Green features decrease it</p>
      </div>

      <div className="card">
        <div className="section-title">SHAP Contributions</div>
        <p className="feature-desc">Each bar shows how much a feature pushes churn probability up (red) or down (green) for this member.</p>
        <div style={{ height: '420px' }}>
          <Bar 
            data={{
              labels: data.map(d => d.feature),
              datasets: [{
                label: 'SHAP Value',
                data: data.map(d => d.score),
                backgroundColor: data.map(d => d.score >= 0 ? '#fca5a5' : '#22c55e'),
              }],
            }} 
            options={{ 
              indexAxis: 'y', 
              responsive: true, 
              plugins: { legend: { display: false } },
              scales: { 
                x: { 
                  title: { display: true, text: 'SHAP Value (positive = higher churn risk)' },
                  ticks: { color: '#64748b' },
                  title: { color: '#1e293b' }
                },
                y: { ticks: { color: '#64748b' } }
              },
            }} 
          />
        </div>
      </div>
    </div>
  );
}