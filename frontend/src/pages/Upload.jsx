import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import Navbar from '../components/Navbar';
import api from '../api/axios';

function FileDropzone({ label, description, fileKey, file, onDrop }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => accepted[0] && onDrop(fileKey, accepted[0]),
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1
  });

  return (
    <div
      {...getRootProps()}
      id={`dropzone-${fileKey}`}
      className={`dropzone ${isDragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
    >
      <input {...getInputProps()} />
      <div className="dropzone-icon">{file ? '✅' : '📄'}</div>
      <div className="dropzone-label">{label}</div>
      <div className="dropzone-sub">{description}</div>
      {file && (
        <div className="dropzone-filename">
          {file.name} ({(file.size / 1024).toFixed(1)} KB)
        </div>
      )}
      {!file && (
        <div className="dropzone-sub" style={{ marginTop: 8 }}>
          Drop CSV here or <span style={{ color: 'var(--accent-light)' }}>browse</span>
        </div>
      )}
    </div>
  );
}

export default function Upload() {
  const [files, setFiles] = useState({ orders: null, payments: null });
  const [uploading, setUploading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState('');
  const [uploadDone, setUploadDone] = useState(false);
  const navigate = useNavigate();

  const handleDrop = useCallback((key, file) => {
    setFiles((p) => ({ ...p, [key]: file }));
    setError('');
    setUploadDone(false);
  }, []);

  const handleUploadAndReconcile = async () => {
    if (!files.orders || !files.payments) {
      return setError('Please select both CSV files before proceeding.');
    }

    setError('');
    setUploading(true);

    try {
      // Step 1: Upload CSVs
      const formData = new FormData();
      formData.append('orders', files.orders);
      formData.append('payments', files.payments);

      await api.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setUploading(false);
      setUploadDone(true);
      setReconciling(true);

      // Step 2: Run reconciliation
      await api.post('/api/reconcile');

      navigate('/dashboard');
    } catch (err) {
      setUploading(false);
      setReconciling(false);
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    }
  };

  return (
    <div className="upload-page">
      <Navbar />
      <div className="upload-container animate-in">
        <div className="upload-header">
          <h1>Import Your Data</h1>
          <p>
            Upload your orders and payments CSV files to begin reconciliation.
            The system will automatically identify all discrepancies.
          </p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 20 }}>
            <span>⚠️</span> {error}
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">📁 Select CSV Files</div>
              <div className="card-subtitle">Both files are required. Max 10MB each.</div>
            </div>
          </div>

          <div className="upload-grid">
            <FileDropzone
              label="Orders CSV"
              description="Your order management system export"
              fileKey="orders"
              file={files.orders}
              onDrop={handleDrop}
            />
            <FileDropzone
              label="Payments CSV"
              description="Your payment processor export"
              fileKey="payments"
              file={files.payments}
              onDrop={handleDrop}
            />
          </div>

          <div className="divider" />

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button
              id="upload-btn"
              className="btn btn-primary"
              style={{ maxWidth: 240 }}
              onClick={handleUploadAndReconcile}
              disabled={uploading || reconciling || !files.orders || !files.payments}
            >
              {uploading && <><span className="spinner" /> Uploading…</>}
              {reconciling && <><span className="spinner" /> Reconciling…</>}
              {!uploading && !reconciling && '🚀 Upload & Reconcile'}
            </button>

            {(uploading || reconciling) && (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {uploading && 'Uploading files to the server…'}
                {reconciling && 'Running reconciliation engine. This may take a moment…'}
              </div>
            )}
          </div>
        </div>

        {/* Info cards */}
        <div className="upload-grid" style={{ marginTop: 16 }}>
          <div className="card" style={{ margin: 0 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>📊 What We Check</div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[
                'Missing payments for completed orders',
                'Phantom payments with no matching order',
                'Amount mismatches (> $0.50 tolerance)',
                'Currency mismatches',
                'Status conflicts (refund vs charge)',
                'Duplicate records',
                'Data quality issues'
              ].map((item) => (
                <li key={item} style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--success)' }}>✓</span> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="card" style={{ margin: 0 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>📋 Expected Format</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600 }}>
              orders.csv
            </div>
            <div className="mono" style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.8 }}>
              order_id, order_date,<br />
              customer_email, currency,<br />
              gross_amount, discount,<br />
              net_amount, status
            </div>
            <div className="divider" style={{ margin: '12px 0' }} />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 600 }}>
              payments.csv
            </div>
            <div className="mono" style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.8 }}>
              transaction_ref, processed_at,<br />
              order_reference, currency,<br />
              amount, fee, net_settled,<br />
              type, status
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
