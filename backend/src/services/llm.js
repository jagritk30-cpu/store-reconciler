/**
 * LLM Service — Gemini Integration
 * ----------------------------------
 * The LLM ONLY explains results produced by the deterministic reconciler.
 * It never decides whether records match or classify discrepancies.
 *
 * Temperature: 0.3
 *   We want consistent, factual explanations — not creative writing.
 *   Low temperature keeps answers grounded and repeatable while allowing
 *   slight variation so responses don't sound robotic across different calls.
 *   Zero would make it overly dry; 0.7+ would introduce hallucinations.
 *
 * Structured output: responseSchema enforces JSON shape.
 *   Malformed / missing responses fall back to a static default — the UI
 *   never crashes due to an LLM failure.
 */

const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

let genAI;
function getClient() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

// ── Schema for single-discrepancy explanation ─────────────────────────────────
const SINGLE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    summary:              { type: SchemaType.STRING, description: '1-2 sentence plain-English summary of what happened' },
    likely_cause:         { type: SchemaType.STRING, description: 'Most probable technical or operational root cause' },
    recommended_action:   { type: SchemaType.STRING, description: 'Specific step the finance/ops team should take to resolve this' },
    severity_explanation: { type: SchemaType.STRING, description: 'Why this severity level was assigned' },
    business_impact:      { type: SchemaType.STRING, description: 'What happens to the business if this is left unresolved' }
  },
  required: ['summary', 'likely_cause', 'recommended_action', 'severity_explanation', 'business_impact']
};

// ── Schema for batch / overview explanation ───────────────────────────────────
const BATCH_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    overall_health:     { type: SchemaType.STRING },
    key_findings:       { type: SchemaType.STRING },
    top_priority_action:{ type: SchemaType.STRING },
    pattern_analysis:   { type: SchemaType.STRING },
    estimated_total_risk:{ type: SchemaType.STRING }
  },
  required: ['overall_health', 'key_findings', 'top_priority_action', 'pattern_analysis', 'estimated_total_risk']
};

function getModel(schema) {
  return getClient().getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: schema
    }
  });
}

/**
 * Explain a single discrepancy record.
 */
async function explainDiscrepancy(discrepancy) {
  try {
    const model = getModel(SINGLE_SCHEMA);

    const prompt = `You are a financial analyst reviewing a reconciliation discrepancy between an online store's order system and its payment processor.

DISCREPANCY TYPE: ${discrepancy.type}
SEVERITY: ${discrepancy.severity}
DETAIL: ${discrepancy.detail}
AMOUNT AT RISK: $${(discrepancy.amount_at_risk || 0).toFixed(2)}

ORDER RECORD:
${JSON.stringify(discrepancy.order || 'N/A', null, 2)}

PAYMENT RECORD:
${JSON.stringify(discrepancy.payment || discrepancy.payments || 'N/A', null, 2)}

Provide a clear, specific explanation for a non-technical finance manager.
- summary: What happened in plain English.
- likely_cause: The most probable root cause (e.g., integration bug, manual entry error, timing issue, missing discount sync).
- recommended_action: Exactly what the team should do next to fix or investigate this.
- severity_explanation: Why this is ${discrepancy.severity} severity.
- business_impact: Concrete consequence if left unresolved (money lost, customer impact, compliance risk, etc.).

Be concise and practical. Avoid generic advice.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);

    // Validate required fields
    const required = ['summary', 'likely_cause', 'recommended_action', 'severity_explanation', 'business_impact'];
    for (const field of required) {
      if (!parsed[field]) throw new Error(`Missing field: ${field}`);
    }

    return parsed;
  } catch (err) {
    console.error('LLM single-explain error:', err.message);
    return buildFallback(discrepancy);
  }
}

/**
 * Generate a high-level summary of all discrepancies.
 */
async function explainSummary(discrepancies, summary) {
  try {
    const model = getModel(BATCH_SCHEMA);

    const breakdown = discrepancies.reduce((acc, d) => {
      acc[d.type] = (acc[d.type] || 0) + 1;
      return acc;
    }, {});

    const totalAtRisk = discrepancies.reduce((s, d) => s + (d.amount_at_risk || 0), 0);

    const prompt = `You are a financial analyst reviewing a full reconciliation report for an online store.

RECONCILIATION SUMMARY:
- Total Orders: ${summary.totalOrders}
- Total Payments: ${summary.totalPayments}
- Clean Matches: ${summary.cleanMatches}
- Total Reconciled: $${summary.totalReconciled?.toFixed(2)}
- Total in Dispute: $${summary.totalInDispute?.toFixed(2)}
- Total Amount at Risk: $${totalAtRisk.toFixed(2)}

DISCREPANCY BREAKDOWN:
${Object.entries(breakdown).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

HIGH SEVERITY COUNT: ${discrepancies.filter(d => d.severity === 'high').length}

SAMPLE ISSUES:
${discrepancies.slice(0, 6).map(d => `• [${d.type}] ${d.detail}`).join('\n')}

Provide:
- overall_health: One-paragraph assessment of the financial records' health.
- key_findings: The 2-3 most significant problems discovered.
- top_priority_action: The single most important thing to do right now.
- pattern_analysis: Any systematic/repeating issues that suggest a root system problem.
- estimated_total_risk: Assessment of the financial exposure in plain language.

Be direct and actionable.`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (err) {
    console.error('LLM batch-explain error:', err.message);
    return {
      overall_health: 'AI analysis temporarily unavailable.',
      key_findings: 'Please review the discrepancy table manually.',
      top_priority_action: 'Address all high-severity discrepancies first.',
      pattern_analysis: 'Unable to generate pattern analysis at this time.',
      estimated_total_risk: `Approximately $${discrepancies.reduce((s, d) => s + (d.amount_at_risk || 0), 0).toFixed(2)} across ${discrepancies.length} discrepancies.`
    };
  }
}

function buildFallback(discrepancy) {
  return {
    summary: `A ${discrepancy.type.replace(/_/g, ' ').toLowerCase()} was detected for order ${discrepancy.order_id || 'unknown'}.`,
    likely_cause: 'AI explanation is temporarily unavailable. Please review the raw data above.',
    recommended_action: 'Manually cross-reference the order and payment records. Contact your payment processor if the amounts differ.',
    severity_explanation: `This discrepancy is classified as ${discrepancy.severity || 'unknown'} severity based on its type and financial impact.`,
    business_impact: 'Unresolved financial discrepancies may result in revenue leakage, incorrect accounting, or customer disputes.'
  };
}

module.exports = { explainDiscrepancy, explainSummary };
