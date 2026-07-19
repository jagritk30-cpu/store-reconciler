import React, { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

function formatType(type) {
  return type?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) || '—';
}

function SeverityBadge({ severity }) {
  return <span className={`badge badge-${severity || 'default'}`}>{severity}</span>;
}

function TypeBadge({ type }) {
  const colors = {
    MISSING_PAYMENT: 'badge-high',
    PHANTOM_PAYMENT: 'badge-high',
    AMOUNT_MISMATCH: 'badge-medium',
    CURRENCY_MISMATCH: 'badge-high',
    STATUS_CONFLICT: 'badge-high',
    DUPLICATE_ORDER: 'badge-high',
    DUPLICATE_PAYMENT: 'badge-high',
    DIRTY_REFERENCE: 'badge-low',
    MISSING_DATA: 'badge-low',
  };
  return <span className={`badge ${colors[type] || 'badge-default'}`}>{formatType(type)}</span>;
}

export default function DrillDownTable({ discrepancies, onExplain }) {
  const [globalFilter, setGlobalFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  const filtered = useMemo(() => {
    let rows = discrepancies;

    if (typeFilter) rows = rows.filter(d => d.type === typeFilter);
    if (severityFilter) rows = rows.filter(d => d.severity === severityFilter);
    if (globalFilter) {
      const q = globalFilter.toLowerCase();
      rows = rows.filter(d =>
        (d.order_id || '').toLowerCase().includes(q) ||
        (d.type || '').toLowerCase().includes(q) ||
        (d.detail || '').toLowerCase().includes(q) ||
        (d.payment?.transaction_ref || '').toLowerCase().includes(q) ||
        (d.order?.customer_email || '').toLowerCase().includes(q)
      );
    }

    // Sort: high first, then by amount_at_risk desc
    return [...rows].sort((a, b) => {
      const sv = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
      if (sv !== 0) return sv;
      return (b.amount_at_risk || 0) - (a.amount_at_risk || 0);
    });
  }, [discrepancies, globalFilter, typeFilter, severityFilter]);

  // Attach original index so we can pass it to the LLM route
  const dataWithIndex = useMemo(() =>
    filtered.map(d => ({
      ...d,
      _originalIndex: discrepancies.indexOf(d)
    })), [filtered, discrepancies]);

  const columns = useMemo(() => [
    {
      header: 'Order ID',
      accessorKey: 'order_id',
      cell: ({ getValue }) => (
        <span className="mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
          {getValue() || '—'}
        </span>
      ),
      size: 110
    },
    {
      header: 'Type',
      accessorKey: 'type',
      cell: ({ getValue }) => <TypeBadge type={getValue()} />,
      size: 170
    },
    {
      header: 'Severity',
      accessorKey: 'severity',
      cell: ({ getValue }) => <SeverityBadge severity={getValue()} />,
      size: 90
    },
    {
      header: 'Transaction Ref',
      accessorFn: row => row.payment?.transaction_ref || '—',
      id: 'txn_ref',
      cell: ({ getValue }) => (
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {getValue()}
        </span>
      ),
      size: 110
    },
    {
      header: 'Order Amt',
      accessorFn: row => row.order?.net_amount,
      id: 'order_amt',
      cell: ({ getValue }) =>
        getValue() != null
          ? <span style={{ color: 'var(--text-secondary)' }}>${Number(getValue()).toFixed(2)}</span>
          : <span style={{ color: 'var(--text-muted)' }}>—</span>,
      size: 90
    },
    {
      header: 'Payment Amt',
      accessorFn: row => row.payment?.amount,
      id: 'pay_amt',
      cell: ({ getValue }) =>
        getValue() != null
          ? <span style={{ color: 'var(--text-secondary)' }}>${Number(getValue()).toFixed(2)}</span>
          : <span style={{ color: 'var(--text-muted)' }}>—</span>,
      size: 100
    },
    {
      header: 'At Risk',
      accessorKey: 'amount_at_risk',
      cell: ({ getValue }) => {
        const v = getValue();
        if (!v || v === 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
        return <span style={{ color: 'var(--danger)', fontWeight: 600 }}>${Number(v).toFixed(2)}</span>;
      },
      size: 90
    },
    {
      header: 'Detail',
      accessorKey: 'detail',
      cell: ({ getValue }) => (
        <span
          style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 320, display: 'block' }}
          className="truncate"
          title={getValue()}
        >
          {getValue()}
        </span>
      ),
    },
    {
      header: '',
      id: 'actions',
      cell: ({ row }) => (
        <button
          id={`explain-btn-${row.index}`}
          className="btn btn-ghost btn-sm"
          onClick={() => onExplain(row.original, row.original._originalIndex)}
          style={{ fontSize: 11, whiteSpace: 'nowrap' }}
        >
          🤖 Explain
        </button>
      ),
      size: 90
    }
  ], [onExplain]);

  const table = useReactTable({
    data: dataWithIndex,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } }
  });

  const uniqueTypes = useMemo(() =>
    [...new Set(discrepancies.map(d => d.type))].sort(),
    [discrepancies]);

  if (discrepancies.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🎉</div>
        <div className="empty-state-title">All records reconciled cleanly!</div>
        <div className="empty-state-sub">No discrepancies found in this dataset.</div>
      </div>
    );
  }

  const { pageIndex, pageSize } = table.getState().pagination;
  const totalPages = table.getPageCount();
  const start = pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, filtered.length);

  return (
    <div>
      {/* Controls */}
      <div className="table-controls">
        <input
          id="table-search"
          className="search-input"
          placeholder="Search by order ID, type, email…"
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
        />
        <select
          id="type-filter"
          className="filter-select"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="">All types</option>
          {uniqueTypes.map(t => (
            <option key={t} value={t}>{formatType(t)}</option>
          ))}
        </select>
        <select
          id="severity-filter"
          className="filter-select"
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value)}
        >
          <option value="">All severities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {filtered.length} of {discrepancies.length} rows
        </span>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    style={{ width: h.getSize() || undefined }}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'asc' && ' ↑'}
                    {h.column.getIsSorted() === 'desc' && ' ↓'}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  No results match your filters
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr key={row.id}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <div className="pagination-info">
            Showing {start}–{end} of {filtered.length} discrepancies
          </div>
          <div className="pagination-controls">
            <button
              className="page-btn"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >‹</button>
            {Array.from({ length: totalPages }, (_, i) => i).map(i => (
              <button
                key={i}
                className={`page-btn ${i === pageIndex ? 'active' : ''}`}
                onClick={() => table.setPageIndex(i)}
              >
                {i + 1}
              </button>
            ))}
            <button
              className="page-btn"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >›</button>
          </div>
        </div>
      )}
    </div>
  );
}
