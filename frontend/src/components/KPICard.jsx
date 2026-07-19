import React from 'react';

export default function KPICard({ icon, label, value, sub, color, iconBg }) {
  return (
    <div className="kpi-card" style={{ '--card-color': color, '--card-icon-bg': iconBg }}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
