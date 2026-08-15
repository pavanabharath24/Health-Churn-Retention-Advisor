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
        <div className="empty-icon">📊</div>
        <h3>Feature Chart</h3>
        <p>Assess a patient or click a member to see SHAP contributions</p>
      </div>
    );
  }

  return (
    <div className="view">
      <div className="topbar">
        <h1>Feature Chart (SHAP)</h1>
        <p>Red = pushes churn UP | Green = pushes churn DOWN</p>
      </div>

      <div className="card">
        <div className="section-title">SHAP Contributions</div>
        <p className="feature-desc">Each bar shows how much each feature contributes to this member's churn probability.</p>
        <div style={{ height: '400px' }}>
          <Bar 
            data={{
              labels: data.map(d => d.feature),
              datasets: [{
                label: 'SHAP Value',
                data: data.map(d => d.score),
                backgroundColor: data.map(d => d.score > 0 ? '#ef4444' : '#22c55e'),
              }],
            }} 
            options={{ 
              indexAxis: 'y', 
              responsive: true, 
              plugins: { legend: { display: false } },
              scales: { x: { title: { display: true, text: 'SHAP Value (positive = higher churn risk)' } } },
            }} 
          />
        </div>
      </div>
    </div>
  );
}