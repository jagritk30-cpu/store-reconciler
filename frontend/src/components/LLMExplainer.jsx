import React, { useState, useEffect } from 'react';
import api from '../api/axios';

export default function LLMExplainer({ title, discrepancyIndex, discrepancy, data, loading: externalLoading, isSummary }) {
  const [explanation, setExplanation] = useState(data || null);
  const [loading, setLoading] = useState(externalLoading || false);
  const [error, setError] = useState('');

  // If data is passed directly (e.g. AI Summary), use it
  useEffect(() => {
    if (data) setExplanation(data);
  }, [data]);

  useEffect(() => {
    setLoading(externalLoading);
  }, [externalLoading]);

  // Auto-fetch when a single discrepancy is selected
  useEffect(() => {
    if (discrepancyIndex === undefined || discrepancyIndex === null || isSummary) return;
    let cancelled = false;

    const fetch = async () => {
      setLoading(true);
      setError('');
      setExplanation(null);
      try {
        const { data: resp } = await api.post('/api/explain/single', {
          discrepancyIndex
        });
        if (!cancelled) setExplanation(resp);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Failed to get AI explanation. Please try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, [discrepancyIndex, isSummary]);

  return (
    <div className="llm-panel animate-in">
      <div className="llm-panel-header">
        <span className="llm-badge">🤖 AI Powered</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {title}
        </span>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="loading-state" style={{ padding: '24px 0' }}>
          <div className="spinner" />
          <span>Generating AI explanation…</span>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="alert alert-error">
          <span>⚠️</span> {error}
        </div>
      )}

      {/* Summary format */}
      {!loading && !error && explanation && isSummary && (
        <div>
          <div className="llm-field">
            <div className="llm-field-label">Overall Health</div>
            <div className="llm-field-value">{explanation.overall_health}</div>
          </div>
          <div className="divider" />
          <div className="llm-grid">
            <div className="llm-field">
              <div className="llm-field-label">Key Findings</div>
              <div className="llm-field-value">{explanation.key_findings}</div>
            </div>
            <div className="llm-field">
              <div className="llm-field-label">Top Priority Action</div>
              <div className="llm-field-value" style={{ color: 'var(--warning)' }}>
                {explanation.top_priority_action}
              </div>
            </div>
            <div className="llm-field">
              <div className="llm-field-label">Pattern Analysis</div>
              <div className="llm-field-value">{explanation.pattern_analysis}</div>
            </div>
            <div className="llm-field">
              <div className="llm-field-label">Estimated Total Risk</div>
              <div className="llm-field-value" style={{ color: 'var(--danger)', fontWeight: 600 }}>
                {explanation.estimated_total_risk}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Single discrepancy format */}
      {!loading && !error && explanation && !isSummary && (
        <div>
          {/* Show discrepancy details */}
          {discrepancy && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 10,
              marginBottom: 16,
              padding: '12px 14px',
              background: 'var(--bg-secondary)',
              borderRadius: 8,
              border: '1px solid var(--border)'
            }}>
              {discrepancy.order && (
                <>
                  <div>
                    <div className="llm-field-label">Order Amount</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {discrepancy.order.currency} {discrepancy.order.net_amount?.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="llm-field-label">Order Status</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {discrepancy.order.status}
                    </div>
                  </div>
                </>
              )}
              {discrepancy.payment && (
                <>
                  <div>
                    <div className="llm-field-label">Payment Amount</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {discrepancy.payment.currency} {discrepancy.payment.amount?.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="llm-field-label">Payment Type</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {discrepancy.payment.type}
                    </div>
                  </div>
                </>
              )}
              {discrepancy.amount_at_risk > 0 && (
                <div>
                  <div className="llm-field-label">At Risk</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--danger)' }}>
                    ${discrepancy.amount_at_risk?.toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="llm-field">
            <div className="llm-field-label">📋 Summary</div>
            <div className="llm-field-value">{explanation.summary}</div>
          </div>
          <div className="divider" />
          <div className="llm-grid">
            <div className="llm-field">
              <div className="llm-field-label">🔍 Likely Cause</div>
              <div className="llm-field-value">{explanation.likely_cause}</div>
            </div>
            <div className="llm-field">
              <div className="llm-field-label">✅ Recommended Action</div>
              <div className="llm-field-value" style={{ color: 'var(--success)' }}>
                {explanation.recommended_action}
              </div>
            </div>
            <div className="llm-field">
              <div className="llm-field-label">⚖️ Severity Explanation</div>
              <div className="llm-field-value">{explanation.severity_explanation}</div>
            </div>
            <div className="llm-field">
              <div className="llm-field-label">💼 Business Impact</div>
              <div className="llm-field-value" style={{ color: 'var(--warning)' }}>
                {explanation.business_impact}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
