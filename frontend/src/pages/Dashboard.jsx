import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import KPICard from '../components/KPICard';
import DiscrepancyChart from '../components/DiscrepancyChart';
import DrillDownTable from '../components/DrillDownTable';
import LLMExplainer from '../components/LLMExplainer';
import api from '../api/axios';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDisc, setSelectedDisc] = useState(null); // { discrepancy, index }
  const [llmSummary, setLlmSummary] = useState(null);
  const [llmSummaryLoading, setLlmSummaryLoading] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const navigate = useNavigate();

  const fetchResults = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: rec } = await api.get('/api/reconcile/results');
      setData(rec);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('no_data');
      } else {
        setError(err.response?.data?.error || 'Failed to load dashboard data.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  const handleGetAISummary = async () => {
    setLlmSummaryLoading(true);
    setLlmSummary(null);
    try {
      const { data: summary } = await api.post('/api/explain/summary');
      setLlmSummary(summary);
    } catch {
      setLlmSummary({ error: 'Failed to generate AI summary. Please try again.' });
    } finally {
      setLlmSummaryLoading(false);
    }
  };

  const handleSelectDiscrepancy = (discrepancy, index) => {
    setSelectedDisc({ discrepancy, index });
    // scroll to explainer
    setTimeout(() => {
      document.getElementById('llm-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleRerun = async () => {
    setRerunning(true);
    try {
      await api.post('/api/reconcile');
      await fetchResults();
      setSelectedDisc(null);
      setLlmSummary(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Reconciliation failed.');
    } finally {
      setRerunning(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="layout dashboard-page">
        <Navbar />
        <div className="main-content">
          <div className="loading-state">
            <div className="spinner spinner-lg" />
            <span>Loading your reconciliation results…</span>
          </div>
        </div>
      </div>
    );
  }

  // ── No data ──────────────────────────────────────────────────────────────
  if (error === 'no_data') {
    return (
      <div className="layout dashboard-page">
        <Navbar />
        <div className="main-content">
          <div className="empty-state animate-in">
            <div className="empty-state-icon">📂</div>
            <div className="empty-state-title">No reconciliation data yet</div>
            <div className="empty-state-sub">Upload your CSV files to get started.</div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 20, maxWidth: 200 }}
              onClick={() => navigate('/upload')}
            >
              Upload Files
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="layout dashboard-page">
        <Navbar />
        <div className="main-content">
          <div className="alert alert-error animate-in">⚠️ {error}</div>
          <button className="btn btn-secondary btn-sm" onClick={fetchResults}>Retry</button>
        </div>
      </div>
    );
  }

  const { summary, discrepancies } = data;

  // ── KPI data ─────────────────────────────────────────────────────────────
  const totalDiscs = discrepancies?.length || 0;
  const highCount = discrepancies?.filter(d => d.severity === 'high').length || 0;
  const cleanRate = summary.totalOrders
    ? ((summary.cleanMatches / summary.totalOrders) * 100).toFixed(1)
    : 0;

  return (
    <div className="layout dashboard-page">
      <Navbar />
      <main className="main-content animate-in">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="dashboard-header">
          <div>
            <h1>Reconciliation Dashboard</h1>
            <p>
              Last run: {new Date(data.updatedAt || data.createdAt).toLocaleString()} ·{' '}
              {summary.totalOrders} orders · {summary.totalPayments} payments
            </p>
          </div>
          <div className="dashboard-actions">
            <button
              id="ai-summary-btn"
              className="btn btn-secondary"
              onClick={handleGetAISummary}
              disabled={llmSummaryLoading}
            >
              {llmSummaryLoading
                ? <><span className="spinner" /> Analysing…</>
                : '🤖 AI Summary'}
            </button>
            <button
              id="rerun-btn"
              className="btn btn-secondary"
              onClick={handleRerun}
              disabled={rerunning}
            >
              {rerunning ? <><span className="spinner" /> Running…</> : '🔄 Re-run'}
            </button>
            <button
              id="upload-new-btn"
              className="btn btn-primary"
              onClick={() => navigate('/upload')}
            >
              📁 New Upload
            </button>
          </div>
        </div>

        {/* ── KPI Cards ───────────────────────────────────────────────────── */}
        <div className="kpi-grid">
          <KPICard
            icon="📋"
            label="Total Orders"
            value={summary.totalOrders}
            sub={`${summary.totalPayments} payments`}
            color="var(--accent)"
            iconBg="var(--accent-dim)"
          />
          <KPICard
            icon="✅"
            label="Clean Matches"
            value={summary.cleanMatches}
            sub={`${cleanRate}% match rate`}
            color="var(--success)"
            iconBg="var(--success-dim)"
          />
          <KPICard
            icon="💰"
            label="Reconciled Value"
            value={`$${summary.totalReconciled?.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            sub="Successfully matched"
            color="var(--info)"
            iconBg="var(--info-dim)"
          />
          <KPICard
            icon="⚠️"
            label="Discrepancies"
            value={totalDiscs}
            sub={`${highCount} high severity`}
            color="var(--warning)"
            iconBg="var(--warning-dim)"
          />
          <KPICard
            icon="🔥"
            label="Money at Risk"
            value={`$${summary.moneyAtRisk?.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            sub="Across high-severity issues"
            color="var(--danger)"
            iconBg="var(--danger-dim)"
          />
        </div>

        {/* ── AI Summary Panel ────────────────────────────────────────────── */}
        {(llmSummaryLoading || llmSummary) && (
          <div id="llm-summary-section">
            <LLMExplainer
              title="AI Overview — Full Reconciliation"
              loading={llmSummaryLoading}
              data={llmSummary}
              isSummary
            />
          </div>
        )}

        {/* ── Chart + Breakdown ────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}
          className="chart-grid">
          <div className="card" style={{ margin: 0 }}>
            <div className="card-header">
              <div>
                <div className="card-title">📊 Discrepancies by Type</div>
                <div className="card-subtitle">Financial impact breakdown</div>
              </div>
            </div>
            <DiscrepancyChart breakdown={summary.discrepancyBreakdown} />
          </div>

          <div className="card" style={{ margin: 0 }}>
            <div className="card-header">
              <div className="card-title">🔍 Breakdown</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(summary.discrepancyBreakdown || {}).map(([type, count]) => {
                const severity = getSeverityForType(type);
                return (
                  <div key={type} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 8,
                    border: '1px solid var(--border)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className={`badge badge-${severity}`}>{severity}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {formatType(type)}
                      </span>
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {count}
                    </span>
                  </div>
                );
              })}
              {(!summary.discrepancyBreakdown || Object.keys(summary.discrepancyBreakdown).length === 0) && (
                <div className="empty-state" style={{ padding: 20 }}>
                  <div style={{ fontSize: 20 }}>🎉</div>
                  <div style={{ fontSize: 14, color: 'var(--success)', fontWeight: 600, marginTop: 6 }}>
                    No discrepancies found!
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Drill-down Table ─────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">🔎 All Discrepancies</div>
              <div className="card-subtitle">
                Click "Explain" on any row to get an AI-powered explanation
              </div>
            </div>
          </div>
          <DrillDownTable
            discrepancies={discrepancies || []}
            onExplain={handleSelectDiscrepancy}
          />
        </div>

        {/* ── Per-discrepancy LLM Explainer ───────────────────────────────── */}
        {selectedDisc && (
          <div id="llm-section">
            <LLMExplainer
              title={`AI Explanation — ${formatType(selectedDisc.discrepancy.type)} (${selectedDisc.discrepancy.order_id})`}
              discrepancyIndex={selectedDisc.index}
              discrepancy={selectedDisc.discrepancy}
            />
          </div>
        )}

      </main>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatType(type) {
  return type
    ?.replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase()) || type;
}

function getSeverityForType(type) {
  const high = ['MISSING_PAYMENT', 'PHANTOM_PAYMENT', 'CURRENCY_MISMATCH', 'STATUS_CONFLICT', 'DUPLICATE_PAYMENT', 'DUPLICATE_ORDER', 'AMOUNT_MISMATCH'];
  const medium = [];
  if (high.includes(type)) return 'high';
  if (medium.includes(type)) return 'medium';
  return 'low';
}
