# Store Reconciliation Dashboard

A full-stack web application that ingests two financial datasets (orders and payments), runs a deterministic reconciliation engine to find every discrepancy, and presents the results in an actionable dashboard with AI-powered explanations.

**Live Demo:** [https://store-reconciler.vercel.app](https://store-reconciler.vercel.app)

---

## Architecture

```
┌─────────────────────┐     JWT / HTTPS      ┌──────────────────────────┐
│   React + Vite      │ ────────────────────► │   Node.js + Express      │
│   (Vercel)          │ ◄──────────────────── │   (Render)               │
└─────────────────────┘    JSON responses     └──────────┬───────────────┘
                                                         │
                                              ┌──────────▼───────────────┐
                                              │   MongoDB Atlas (M0)     │
                                              └──────────────────────────┘
                                                         │
                                              ┌──────────▼───────────────┐
                                              │   Google Gemini API      │
                                              │   (backend only)         │
                                              └──────────────────────────┘
```

**Frontend:** React 18 + Vite, React Router, Axios, Recharts, TanStack Table, react-dropzone  
**Backend:** Node.js + Express 5, Mongoose, Multer, csv-parser, bcryptjs, jsonwebtoken  
**Database:** MongoDB Atlas (free M0 tier)  
**LLM:** Google Gemini 1.5 Flash (backend-only, never exposes key to client)

---

## Local Setup

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (free) or local MongoDB
- Google Gemini API key

### 1. Clone the repo

```bash
git clone <repo-url>
cd store-reconciler
```

### 2. Backend setup

```bash
cd backend
cp ../.env.example .env   # Fill in your MONGODB_URI, JWT_SECRET, GEMINI_API_KEY
npm install
npm run dev               # Starts on http://localhost:5000
```

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev               # Starts on http://localhost:5173
```

The Vite dev server proxies all `/api` requests to `localhost:5000`, so no CORS issues locally.

### 4. Test with sample data

Sample CSV files are in `sample-data/`:
- `sample-data/orders.csv`
- `sample-data/payments.csv`

Sign up, upload both files, and the dashboard will populate instantly.

---

## Reconciliation Logic

### How records are matched

`orders.order_id` is matched against `payments.order_reference` after **normalisation**:
- Trim leading/trailing whitespace
- Convert to UPPERCASE

This handles the real-world messiness found in the dataset (see *What We Found* below).

### Discrepancy Types

| Type | Severity | Definition |
|---|---|---|
| `MISSING_PAYMENT` | High | Order exists, no payment found |
| `PHANTOM_PAYMENT` | High | Payment exists, no matching order |
| `AMOUNT_MISMATCH` | High/Med | `\|order.net_amount - payment.amount\| > $0.50` |
| `CURRENCY_MISMATCH` | High | `order.currency ≠ payment.currency` |
| `STATUS_CONFLICT` | High | Order says `refunded` but payment is a `charge`, or order is `completed` but payment is a `refund` |
| `DUPLICATE_ORDER` | High | Same `order_id` appears more than once in orders CSV |
| `DUPLICATE_PAYMENT` | High | Multiple payments found for the same order |
| `DIRTY_REFERENCE` | Low | Payment matched only after normalisation (data quality flag, not financial) |
| `MISSING_DATA` | Low | Required fields are blank (e.g. customer email) |

### Tolerances

**Amount tolerance: $0.50**  
Discount rounding can produce floating-point differences of < $0.01. A $0.50 threshold catches real mismatches while ignoring arithmetic noise. Any difference above $0.50 is flagged as `AMOUNT_MISMATCH`; above $10.00 it is elevated to `high` severity.

### Determinism

The reconciliation engine is a pure function — it reads from MongoDB, processes, and writes results back. The same input always produces the same output. No randomness, no LLM involvement in matching.

---

## What We Found in the Data

After analysis, these real issues exist in the provided CSV files:

| # | Issue | Detail |
|---|---|---|
| 1 | **Currency mismatch** | `ORD-1601` is USD in orders; payment `TXN700171` charges EUR for the same amount |
| 2 | **Duplicate order row** | `ORD-1004` appears twice in `orders.csv` with identical data |
| 3 | **Lowercase order reference** | `TXN700179` references `ord-1802` (lowercase) — needs normalisation |
| 4 | **Whitespace in reference** | `TXN700178` references ` ord-1801 ` (leading/trailing space) |
| 5 | **Phantom payments** | `TXN700172` (ORD-1602), `TXN700168` (ORD-1501), `TXN700170` (ORD-1502) etc. — orders don't exist |
| 6 | **Missing payments** | Several orders (ORD-1032, ORD-2202, ORD-1031 etc.) have no payment |
| 7 | **Status conflict** | `ORD-1702` is `refunded` in orders but `TXN700174` is a `charge` — money was never returned |
| 8 | **Refund on completed order** | `ORD-1703` is `completed` but `TXN700177` is a `refund` type payment |
| 9 | **Missing customer email** | `ORD-2201` has no `customer_email` |
| 10 | **Amount discrepancy** | Some payments match `gross_amount` instead of `net_amount` — discounts not reflected in charge |

**Business impact:** The store is potentially leaking revenue through unissued refunds, phantom payments from orders that were never fulfilled, and currency-incorrect charges that effectively undercharge or overcharge customers in different markets.

---

## LLM Approach

**Model:** `gemini-1.5-flash`  
**Temperature:** `0.3`

**Why 0.3?**  
We want consistent, factual explanations — not creative writing. Low temperature keeps answers grounded and repeatable. Zero would make responses too dry and robotic. Higher values (0.7+) risk hallucinations when interpreting financial data. 0.3 is the sweet spot: stable, specific, and natural.

**Structured output:**  
The backend requests JSON via `responseSchema` — Gemini returns a guaranteed-shape object with fields like `summary`, `likely_cause`, `recommended_action`, `business_impact`. No string parsing required.

**Error handling:**  
Every LLM call is wrapped in try/catch. If the API fails, returns malformed JSON, or is missing required fields — a static fallback response is returned. The UI always shows something useful; it never crashes or shows a raw error to the user.

**What the LLM does NOT do:**  
The LLM never decides whether two records match. Matching is 100% deterministic code. The LLM only explains results that have already been computed.

---

## What I'd Build Next

1. **Email alerts** — Notify the finance team when new high-severity discrepancies appear
2. **Webhook ingestion** — Accept real-time events from Stripe/payment processors instead of CSV uploads
3. **Historical runs** — Store multiple reconciliation runs so trends can be tracked over time
4. **Export to CSV/PDF** — Let users download the discrepancy report
5. **Role-based access** — Admin can see all users' reports; analysts see their own
6. **Auto-resolve** — Mark discrepancies as "investigated" or "resolved" with notes

---

## How I Used AI Tools

Used AI coding assistance throughout:
- Scaffolding boilerplate (models, routes, auth middleware)
- Writing the Recharts and TanStack Table integrations
- Drafting the README structure

Every line of code — especially the reconciliation engine and LLM integration — was reviewed, understood, and intentionally designed. The reconciliation logic, discrepancy classifications, tolerances, and LLM prompting strategy are original decisions made after manually analysing the data.
