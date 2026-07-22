import React, { useState, useEffect, useCallback } from 'react';
import { adminClient as adminAPI } from '@food/api/axios';
import Loader from '@food/components/Loader';
import { Receipt } from 'lucide-react';

const STATUS_COLORS = {
  paid:     { bg: '#dcfce7', text: '#15803d', dot: '#16a34a', label: 'Paid' },
  pending:  { bg: '#fef9c3', text: '#a16207', dot: '#ca8a04', label: 'Pending' },
  failed:   { bg: '#fee2e2', text: '#b91c1c', dot: '#dc2626', label: 'Failed' },
  refunded: { bg: '#e0f2fe', text: '#0369a1', dot: '#0ea5e9', label: 'Refunded' },
};

const DURATION_MAP = { week: 'Weekly', month: 'Monthly', day: 'Daily' };

function fmt(n) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function OfficePayments() {
  const [payments, setPayments]     = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);
  const [statusFilter, setStatus]   = useState('');
  const [selected, setSelected]     = useState(null);
  const LIMIT = 15;

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: LIMIT };
      if (statusFilter) params.status = statusFilter;
      const res = await adminAPI.get('/food/admin/office-payments', { params });
      setPayments(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const totalPages = Math.ceil(total / LIMIT);

  // ─── Summary stats (from current page; ideally a separate /stats endpoint)
  const stats = {
    total:   payments.reduce((s, p) => s + (p.amount || 0), 0),
    paid:    payments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0),
    pending: payments.filter(p => p.status === 'pending').length,
    failed:  payments.filter(p => p.status === 'failed').length,
  };

  return (
    <div style={{ padding: '24px', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <Receipt style={{ fontSize: '28px', color: '#16a34a' }} />
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Office Payment History</h1>
        </div>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>All payments made by corporate office accounts for meal subscriptions.</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Total Collected', value: `₹${fmt(stats.total)}`, icon: 'payments', color: '#16a34a', bg: '#dcfce7' },
          { label: 'Paid Amount', value: `₹${fmt(stats.paid)}`, icon: 'check_circle', color: '#15803d', bg: '#bbf7d0' },
          { label: 'Pending Txns', value: stats.pending, icon: 'pending', color: '#ca8a04', bg: '#fef9c3' },
          { label: 'Failed Txns', value: stats.failed, icon: 'cancel', color: '#dc2626', bg: '#fee2e2' },
        ].map(c => (
          <div key={c.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: c.color, fontSize: '22px' }}>{c.icon}</span>
            </div>
            <div>
              <p style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</p>
              <p style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        {['', 'paid', 'pending', 'failed', 'refunded'].map(s => (
          <button
            key={s}
            onClick={() => { setStatus(s); setPage(1); }}
            style={{
              padding: '6px 16px', borderRadius: '20px', border: '1px solid',
              borderColor: statusFilter === s ? '#16a34a' : '#e2e8f0',
              background: statusFilter === s ? '#16a34a' : '#fff',
              color: statusFilter === s ? '#fff' : '#475569',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all .15s'
            }}
          >
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#94a3b8' }}>{total} total records</span>
      </div>

      {/* Table / Cards */}
      {loading ? (
        <Loader />
      ) : payments.length === 0 ? (
        <div style={{ background: '#fff', border: '1px dashed #e2e8f0', borderRadius: '12px', padding: '60px', textAlign: 'center' }}>
          <Receipt style={{ fontSize: '48px', color: '#cbd5e1' }} />
          <p style={{ color: '#94a3b8', marginTop: '8px', fontSize: '14px' }}>No payment records found.</p>
        </div>
      ) : (
        <>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.2fr 1fr 1fr 1fr 80px', gap: '0', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '10px 16px' }}>
              {['Company', 'Plan', 'Vendor', 'Employees', 'Amount', 'Status', 'Date'].map(h => (
                <span key={h} style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
              ))}
            </div>

            {/* Rows */}
            {payments.map((p, i) => {
              const sc = STATUS_COLORS[p.status] || STATUS_COLORS.pending;
              return (
                <div
                  key={p._id}
                  onClick={() => setSelected(p)}
                  style={{
                    display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.2fr 1fr 1fr 1fr 80px',
                    gap: '0', padding: '12px 16px', cursor: 'pointer',
                    borderBottom: i < payments.length - 1 ? '1px solid #f1f5f9' : 'none',
                    background: selected?._id === p._id ? '#f0fdf4' : 'transparent',
                    transition: 'background .12s'
                  }}
                  onMouseEnter={e => { if (selected?._id !== p._id) e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={e => { if (selected?._id !== p._id) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', margin: 0 }}>{p.company?.legalName || '—'}</p>
                    <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0, fontFamily: 'monospace' }}>{p.razorpayOrderId?.slice(-12)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 600, color: '#334155', margin: 0 }}>{p.plan?.name || '—'}</p>
                    <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>{DURATION_MAP[p.plan?.duration] || ''}</p>
                  </div>
                  <p style={{ fontSize: '12px', color: '#475569', margin: 0, alignSelf: 'center' }}>{p.vendor?.restaurantName || '—'}</p>
                  <p style={{ fontSize: '13px', color: '#475569', margin: 0, alignSelf: 'center' }}>{p.employeeIds?.length || 0} emp</p>
                  <p style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0, alignSelf: 'center' }}>₹{fmt(p.amount)}</p>
                  <div style={{ alignSelf: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '20px', background: sc.bg, color: sc.text, fontSize: '11px', fontWeight: 700 }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: sc.dot, display: 'inline-block' }} />
                      {sc.label}
                    </span>
                  </div>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, alignSelf: 'center' }}>{new Date(p.createdAt).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}</p>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 600, opacity: page === 1 ? 0.5 : 1 }}>
                ← Prev
              </button>
              <span style={{ padding: '6px 14px', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 600, opacity: page === totalPages ? 0.5 : 1 }}>
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail Drawer / Modal */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '420px', height: '100%', background: '#fff', overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}
          >
            {/* Drawer Header */}
            <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Payment Detail</h2>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, fontFamily: 'monospace' }}>{selected.razorpayOrderId}</p>
              </div>
              <button onClick={() => setSelected(null)}
                style={{ border: 'none', background: '#f1f5f9', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '18px', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ✕
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Status badge */}
              {(() => {
                const sc = STATUS_COLORS[selected.status] || STATUS_COLORS.pending;
                return (
                  <div style={{ padding: '12px', background: sc.bg, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, color: sc.text, fontSize: '14px' }}>Payment {sc.label}</span>
                    {selected.isMock && <span style={{ marginLeft: 'auto', fontSize: '10px', background: '#e2e8f0', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>DEV/MOCK</span>}
                  </div>
                );
              })()}

              {/* Amount highlight */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
                <p style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Amount Paid</p>
                <p style={{ fontSize: '32px', fontWeight: 900, color: '#15803d', margin: 0 }}>₹{fmt(selected.amount)}</p>
              </div>

              {/* Detail rows */}
              {[
                { label: 'Company', value: selected.company?.legalName || '—' },
                { label: 'Subscription Plan', value: selected.plan?.name || '—' },
                { label: 'Plan Duration', value: DURATION_MAP[selected.plan?.duration] || '—' },
                { label: 'Plan Price', value: selected.plan?.price ? `₹${fmt(selected.plan.price)}` : '—' },
                { label: 'Vendor', value: selected.vendor?.restaurantName || '—' },
                { label: 'Employees Covered', value: selected.employeeIds?.length || 0 },
                { label: 'Meal Slots', value: (selected.slots || []).join(', ') || '—' },
                { label: 'Currency', value: selected.currency || 'INR' },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700, textAlign: 'right', maxWidth: '55%' }}>{value}</span>
                </div>
              ))}

              {/* Razorpay IDs */}
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Transaction IDs</p>
                <div>
                  <p style={{ fontSize: '10px', color: '#94a3b8', margin: '0 0 2px' }}>Order ID</p>
                  <p style={{ fontSize: '11px', color: '#334155', fontFamily: 'monospace', margin: 0, wordBreak: 'break-all' }}>{selected.razorpayOrderId || '—'}</p>
                </div>
                {selected.razorpayPaymentId && (
                  <div>
                    <p style={{ fontSize: '10px', color: '#94a3b8', margin: '0 0 2px' }}>Payment ID</p>
                    <p style={{ fontSize: '11px', color: '#334155', fontFamily: 'monospace', margin: 0, wordBreak: 'break-all' }}>{selected.razorpayPaymentId}</p>
                  </div>
                )}
              </div>

              {/* Timestamps */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Created</span>
                  <span style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>{fmtDate(selected.createdAt)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Last Updated</span>
                  <span style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>{fmtDate(selected.updatedAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
