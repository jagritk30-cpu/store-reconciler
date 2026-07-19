/**
 * Reconciliation Engine
 * ---------------------
 * Deterministic, pure function — same input always produces the same output.
 * The LLM is NEVER used here. This function classifies every record.
 *
 * Matching strategy:
 *   orders.order_id === payments.order_reference_normalized
 *
 * Discrepancy types:
 *   DUPLICATE_ORDER    — Same order_id appears more than once in orders
 *   MISSING_PAYMENT    — Order exists but no payment found
 *   PHANTOM_PAYMENT    — Payment exists but no matching order
 *   AMOUNT_MISMATCH    — |order.net_amount - payment.amount| > AMOUNT_TOLERANCE
 *   CURRENCY_MISMATCH  — order.currency !== payment.currency
 *   STATUS_CONFLICT    — order status vs payment type are logically inconsistent
 *   DUPLICATE_PAYMENT  — More than one payment found for the same order
 *   DIRTY_REFERENCE    — Payment matched only after normalising the order_reference
 *   MISSING_DATA       — Required fields are blank (e.g. customer_email)
 *
 * Tolerance: $0.50
 *   Rounding from discount calculations can cause < $0.01 variance.
 *   $0.50 catches real mismatches while ignoring floating-point noise.
 */

const AMOUNT_TOLERANCE = 0.50;

/**
 * Run reconciliation against two arrays of plain objects (from MongoDB .lean()).
 * Returns { summary, discrepancies, cleanMatches }.
 */
function reconcile(orders, payments) {
  // ── 1. Build maps ──────────────────────────────────────────────────────────

  // orderMap: order_id → [order, ...] (array to detect duplicates)
  const orderMap = new Map();
  for (const order of orders) {
    const key = order.order_id;
    if (!orderMap.has(key)) orderMap.set(key, []);
    orderMap.get(key).push(order);
  }

  // paymentMap: normalized_ref → [payment, ...] (array to detect duplicate payments)
  const paymentMap = new Map();
  for (const payment of payments) {
    const key = payment.order_reference_normalized;
    if (!paymentMap.has(key)) paymentMap.set(key, []);
    paymentMap.get(key).push(payment);
  }

  const discrepancies = [];
  const cleanMatches = [];
  const processedOrderIds = new Set();

  // ── 2. Check for duplicate order rows ─────────────────────────────────────
  for (const [orderId, orderList] of orderMap.entries()) {
    if (orderList.length > 1) {
      discrepancies.push({
        type: 'DUPLICATE_ORDER',
        severity: 'high',
        order_id: orderId,
        order: stripMongo(orderList[0]),
        payment: null,
        amount_at_risk: orderList[0].net_amount,
        detail: `Order ${orderId} appears ${orderList.length}× in the orders file. Only the first row will be used for matching.`
      });
    }
  }

  // ── 3. Process each unique order ──────────────────────────────────────────
  for (const [orderId, orderList] of orderMap.entries()) {
    processedOrderIds.add(orderId);
    const order = orderList[0]; // canonical record (first occurrence)
    const matchingPayments = paymentMap.get(orderId) || [];

    // — 3a. No payment at all
    if (matchingPayments.length === 0) {
      discrepancies.push({
        type: 'MISSING_PAYMENT',
        severity: 'high',
        order_id: orderId,
        order: stripMongo(order),
        payment: null,
        amount_at_risk: order.net_amount,
        detail: `Order ${orderId} for ${order.currency} ${order.net_amount.toFixed(2)} has no matching payment.`
      });
      continue;
    }

    // — 3b. Multiple payments for one order (duplicate payments)
    if (matchingPayments.length > 1) {
      const totalCharged = matchingPayments
        .filter(p => p.type === 'charge')
        .reduce((s, p) => s + p.amount, 0);
      discrepancies.push({
        type: 'DUPLICATE_PAYMENT',
        severity: 'high',
        order_id: orderId,
        order: stripMongo(order),
        payment: stripMongo(matchingPayments[0]),
        payments: matchingPayments.map(stripMongo),
        amount_at_risk: parseFloat(Math.abs(totalCharged - order.net_amount).toFixed(2)),
        detail: `Order ${orderId} has ${matchingPayments.length} payments (total charged: ${order.currency} ${totalCharged.toFixed(2)}, order net: ${order.currency} ${order.net_amount.toFixed(2)}).`
      });
      continue;
    }

    // — 3c. Exactly one payment — check for discrepancies
    const payment = matchingPayments[0];
    let recordHasHighDisc = false;

    // Dirty reference (data quality, low severity, not financial)
    if (payment._isDirtyRef) {
      discrepancies.push({
        type: 'DIRTY_REFERENCE',
        severity: 'low',
        order_id: orderId,
        order: stripMongo(order),
        payment: stripMongo(payment),
        amount_at_risk: 0,
        detail: `Payment ${payment.transaction_ref} references order as "${payment.order_reference}" — matched only after normalising whitespace/case.`
      });
    }

    // Currency mismatch
    if (order.currency !== payment.currency) {
      discrepancies.push({
        type: 'CURRENCY_MISMATCH',
        severity: 'high',
        order_id: orderId,
        order: stripMongo(order),
        payment: stripMongo(payment),
        amount_at_risk: payment.amount,
        detail: `Order is in ${order.currency} but payment ${payment.transaction_ref} is in ${payment.currency} — same face amount charged in wrong currency.`
      });
      recordHasHighDisc = true;
    }

    // Status / type conflict
    if (order.status === 'refunded' && payment.type === 'charge') {
      discrepancies.push({
        type: 'STATUS_CONFLICT',
        severity: 'high',
        order_id: orderId,
        order: stripMongo(order),
        payment: stripMongo(payment),
        amount_at_risk: payment.amount,
        detail: `Order ${orderId} is marked "refunded" but its payment (${payment.transaction_ref}) is a charge — the refund may not have been issued.`
      });
      recordHasHighDisc = true;
    } else if (order.status === 'completed' && payment.type === 'refund') {
      discrepancies.push({
        type: 'STATUS_CONFLICT',
        severity: 'high',
        order_id: orderId,
        order: stripMongo(order),
        payment: stripMongo(payment),
        amount_at_risk: payment.amount,
        detail: `Order ${orderId} is "completed" but payment ${payment.transaction_ref} is a refund — money may have been returned for a live order.`
      });
      recordHasHighDisc = true;
    }

    // Amount mismatch (only meaningful when currencies match)
    if (order.currency === payment.currency) {
      const diff = Math.abs(order.net_amount - payment.amount);
      if (diff > AMOUNT_TOLERANCE) {
        const severity = diff > 10 ? 'high' : 'medium';
        discrepancies.push({
          type: 'AMOUNT_MISMATCH',
          severity,
          order_id: orderId,
          order: stripMongo(order),
          payment: stripMongo(payment),
          amount_at_risk: parseFloat(diff.toFixed(2)),
          amount_difference: parseFloat((payment.amount - order.net_amount).toFixed(2)),
          detail: `Order net amount: ${order.currency} ${order.net_amount.toFixed(2)}, payment amount: ${payment.currency} ${payment.amount.toFixed(2)} — difference of ${order.currency} ${diff.toFixed(2)}.`
        });
        if (severity === 'high') recordHasHighDisc = true;
      }
    }

    // Missing customer email (data quality)
    if (!order.customer_email) {
      discrepancies.push({
        type: 'MISSING_DATA',
        severity: 'low',
        order_id: orderId,
        order: stripMongo(order),
        payment: stripMongo(payment),
        amount_at_risk: 0,
        detail: `Order ${orderId} has no customer email — cannot send receipts or follow-ups.`
      });
    }

    // Clean match — no high/medium financial discrepancy and reference is clean
    if (!recordHasHighDisc && !payment._isDirtyRef) {
      cleanMatches.push({ order: stripMongo(order), payment: stripMongo(payment) });
    }
  }

  // ── 4. Phantom payments — payment has no matching order ───────────────────
  for (const [normRef, paymentList] of paymentMap.entries()) {
    if (!processedOrderIds.has(normRef)) {
      for (const payment of paymentList) {
        discrepancies.push({
          type: 'PHANTOM_PAYMENT',
          severity: 'high',
          order_id: normRef,
          order: null,
          payment: stripMongo(payment),
          amount_at_risk: payment.amount,
          detail: `Payment ${payment.transaction_ref} references "${payment.order_reference}" which does not exist in the orders file.`
        });
      }
    }
  }

  // ── 5. Build summary ───────────────────────────────────────────────────────
  const totalReconciled = cleanMatches.reduce((s, m) => s + m.order.net_amount, 0);

  const highDiscs = discrepancies.filter(d => d.severity === 'high');
  const totalInDispute = highDiscs.reduce((s, d) => s + (d.amount_at_risk || 0), 0);

  const discrepancyBreakdown = {};
  for (const d of discrepancies) {
    discrepancyBreakdown[d.type] = (discrepancyBreakdown[d.type] || 0) + 1;
  }

  return {
    cleanMatches,
    discrepancies,
    summary: {
      totalOrders:          orderMap.size,
      totalPayments:        payments.length,
      cleanMatches:         cleanMatches.length,
      totalReconciled:      parseFloat(totalReconciled.toFixed(2)),
      totalInDispute:       parseFloat(totalInDispute.toFixed(2)),
      moneyAtRisk:          parseFloat(totalInDispute.toFixed(2)),
      discrepancyBreakdown
    }
  };
}

/** Strip MongoDB internal fields from a document for clean JSON output. */
function stripMongo(doc) {
  if (!doc) return null;
  const { _id, __v, userId, uploadId, createdAt, updatedAt, ...clean } = doc;
  return clean;
}

module.exports = { reconcile };
