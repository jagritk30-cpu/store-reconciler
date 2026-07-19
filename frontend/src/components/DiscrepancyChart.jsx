import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

const TYPE_COLORS = {
  MISSING_PAYMENT:   '#ef4444',
  PHANTOM_PAYMENT:   '#f97316',
  AMOUNT_MISMATCH:   '#f59e0b',
  CURRENCY_MISMATCH: '#a855f7',
  STATUS_CONFLICT:   '#ec4899',
  DUPLICATE_ORDER:   '#6366f1',
  DUPLICATE_PAYMENT: '#8b5cf6',
  DIRTY_REFERENCE:   '#06b6d4',
  MISSING_DATA:      '#64748b',
};

function formatLabel(type) {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div style={{
      background: '#0d1526',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8,
      padding: '10px 14px',
      fontSize: 13
    }}>
      <div style={{ color: '#94a3b8', marginBottom: 4 }}>{formatLabel(name)}</div>
      <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 18 }}>{value}</div>
      <div style={{ color: '#475569', fontSize: 11 }}>discrepancies</div>
    </div>
  );
};

export default function DiscrepancyChart({ breakdown }) {
  if (!breakdown || Object.keys(breakdown).length === 0) {
    return (
      <div className="empty-state" style={{ padding: 40 }}>
        <div style={{ fontSize: 28 }}>🎉</div>
        <div style={{ fontSize: 14, color: 'var(--success)', fontWeight: 600, marginTop: 8 }}>
          No discrepancies to chart!
        </div>
      </div>
    );
  }

  const data = Object.entries(breakdown)
    .map(([type, count]) => ({ name: type, value: count }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="chart-wrapper">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 10, left: -10, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="name"
            tick={{ fill: '#475569', fontSize: 10 }}
            tickFormatter={(v) => v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tick={{ fill: '#475569', fontSize: 11 }}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={TYPE_COLORS[entry.name] || '#6366f1'}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
