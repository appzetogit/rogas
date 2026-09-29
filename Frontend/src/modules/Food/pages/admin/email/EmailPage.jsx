import React, { useState, useEffect, useCallback } from 'react';
import { Mail, CheckCircle, AlertTriangle, XCircle, Plug, RefreshCw, RotateCcw, Search, X, Link as LinkIcon } from 'lucide-react';
import { adminAPI } from '../../../../../services/api';

const STATUS_STYLE = {
  sent: 'bg-green-100 text-green-700',
  queued: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
};
const badge = (text, cls) => <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${cls}`}>{text}</span>;
const inputCls = 'bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400';
const errText = (e, fallback) => e?.response?.data?.message || e?.message || fallback;

function Overview({ notify }) {
  const [data, setData] = useState(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await adminAPI.getEmailOverview();
      setData(res?.data?.data);
    } catch (e) { notify('error', errText(e, 'Failed to load email settings')); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const test = async () => {
    setTesting(true);
    try {
      const res = await adminAPI.testEmailConnection();
      setResult(res.data.data);
    } catch (e) { setResult({ ok: false, message: errText(e, 'Test failed') }); }
    setTesting(false);
  };

  if (!data) return <div className="p-8 text-slate-500">Loading…</div>;

  return (
    <div className="space-y-6">
      {data.warnings?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-1.5">
          {data.warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-800 flex gap-2"><AlertTriangle size={16} className="mt-0.5 flex-none" /><span>{w}</span></p>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-black text-slate-800">SMTP connection</h2>
              {data.configured ? badge('Configured', 'bg-green-100 text-green-700') : badge('Not configured', 'bg-red-100 text-red-700')}
            </div>
            <p className="text-sm text-slate-500">{data.configured ? `${data.host}:${data.port} · from ${data.from}` : 'Set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS and EMAIL_FROM on the server, then restart the backend.'}</p>
          </div>
          <button type="button" onClick={test} disabled={testing} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-60">
            <Plug size={15} /> {testing ? 'Testing…' : 'Test connection'}
          </button>
        </div>
        {result && (
          <p className={`text-[13px] mt-3 flex gap-1.5 ${result.ok ? 'text-green-700' : 'text-red-600'}`}>
            {result.ok ? <CheckCircle size={14} className="flex-none mt-0.5" /> : <XCircle size={14} className="flex-none mt-0.5" />}{result.message}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[['Sent, last 24h', data.stats.sent24h, 'text-green-700'], ['Failed, last 24h', data.stats.failed24h, 'text-red-600'], ['Waiting to retry', data.stats.pendingRetry, 'text-amber-600']].map(([label, value, cls]) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
            <p className={`text-3xl font-black mt-1 ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <p className="text-sm text-slate-600">
          What each email says — subject and body, in every language — is edited from{' '}
          <a href="/admin/food/translations?ns=email" className="text-indigo-600 font-bold inline-flex items-center gap-1 hover:underline">
            Translations <LinkIcon size={13} />
          </a>{' '}
          under the "Emails" namespace. The English text in the code is the key; changing it there changes what gets sent, in every language, immediately.
        </p>
      </div>
    </div>
  );
}

function LogDetail({ id, onClose, notify, onResent }) {
  const [log, setLog] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    adminAPI.getEmailLog(id).then((res) => setLog(res.data.data)).catch((e) => notify('error', errText(e, 'Failed to load email')));
  }, [id, notify]);

  const resend = async () => {
    setBusy(true);
    try {
      const res = await adminAPI.resendEmailLog(id);
      notify('success', res.data.data.status === 'sent' ? 'Resent successfully' : 'Resend attempted, it failed again — see the error below');
      setLog((l) => ({ ...l, ...res.data.data }));
      onResent?.();
    } catch (e) { notify('error', errText(e, 'Resend failed')); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="text-lg font-black text-slate-800">Email</h3><button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button></div>
        {!log ? <p className="text-slate-400">Loading…</p> : (
          <>
            <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
              {[['To', log.to], ['Status', log.status], ['Language', log.language], ['Attempts', log.attempts], ['Sent', log.sentAt ? new Date(log.sentAt).toLocaleString() : '—'], ['Created', new Date(log.createdAt).toLocaleString()]].map(([k, v]) => (
                <React.Fragment key={k}><dt className="text-slate-400 col-span-1">{k}</dt><dd className="font-semibold text-slate-700 col-span-2 break-all">{v}</dd></React.Fragment>
              ))}
            </dl>
            {log.lastError && <p className="text-sm text-red-700 bg-red-50 rounded-xl p-3">{log.lastError}</p>}
            <div>
              <h4 className="text-[11px] font-bold text-slate-500 uppercase mb-2">Subject</h4>
              <p className="text-sm font-semibold text-slate-800">{log.subject}</p>
            </div>
            <div>
              <h4 className="text-[11px] font-bold text-slate-500 uppercase mb-2">Body preview</h4>
              <iframe title="email preview" srcDoc={log.html} className="w-full h-80 rounded-xl border border-slate-200 bg-white" sandbox="" />
            </div>
            <button type="button" onClick={resend} disabled={busy} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-60 flex items-center justify-center gap-2">
              <RotateCcw size={15} /> {busy ? 'Sending…' : 'Resend now'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Logs({ notify }) {
  const [filters, setFilters] = useState({ status: '', q: '' });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
      const res = await adminAPI.getEmailLogs(params);
      setRows(res.data.data.logs);
      setMeta({ total: res.data.data.total, totalPages: res.data.data.totalPages });
    } catch (e) { notify('error', errText(e, 'Failed to load emails')); }
    setLoading(false);
  }, [filters, page, notify]);
  useEffect(() => { load(); }, [load]);

  const setF = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]"><Search size={15} className="absolute left-3 top-3 text-slate-400" />
          <input className={`${inputCls} w-full pl-9`} placeholder="Search recipient or subject…" value={filters.q} onChange={(e) => setF('q', e.target.value)} /></div>
        <select className={inputCls} value={filters.status} onChange={(e) => setF('status', e.target.value)}>
          <option value="">All statuses</option>
          {['sent', 'queued', 'failed'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" onClick={load} className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50" aria-label="Refresh"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>
            {['To', 'Subject', 'Status', 'Attempts', 'Sent / created', ''].map((h) => <th key={h} className="text-left px-4 py-3">{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">{loading ? 'Loading…' : 'No emails found'}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="px-4 py-3 font-semibold text-slate-700">{r.to}</td>
                <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={r.subject}>{r.subject}</td>
                <td className="px-4 py-3">{badge(r.status, STATUS_STYLE[r.status] || 'bg-slate-100 text-slate-600')}</td>
                <td className="px-4 py-3 text-slate-500">{r.attempts}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(r.sentAt || r.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => setOpenId(r.id)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{meta.total} email{meta.total === 1 ? '' : 's'}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Previous</button>
          <span className="px-2 py-1.5">Page {page} of {meta.totalPages}</span>
          <button type="button" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Next</button>
        </div>
      </div>
      {openId && <LogDetail id={openId} onClose={() => setOpenId(null)} notify={notify} onResent={load} />}
    </div>
  );
}

export default function EmailPage() {
  const [tab, setTab] = useState('overview');
  const [toast, setToast] = useState(null);
  const notify = useCallback((type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 5000); }, []);

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center"><Mail size={22} /></div>
        <div><h1 className="text-2xl font-black text-slate-800">Email</h1><p className="text-sm text-slate-500">SMTP connection, delivery history and resend.</p></div>
      </div>
      <div className="flex gap-2 mb-6" role="tablist">
        {[['overview', 'Overview'], ['logs', 'Sent emails']].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>
        ))}
      </div>
      {tab === 'overview' ? <Overview notify={notify} /> : <Logs notify={notify} />}
      {toast && (
        <div role="status" className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white-force ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{toast.msg}</div>
      )}
    </div>
  );
}
