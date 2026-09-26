import React, { useState, useEffect, useCallback } from 'react';
import { CreditCard, CheckCircle, AlertTriangle, XCircle, Plug, RefreshCw, RotateCcw, Copy, Plus, Trash2, X, Search, Save } from 'lucide-react';
import { adminAPI } from '../../../../../services/api';

const PROVIDER_INFO = {
  przelewy24: { name: 'Przelewy24', currencies: 'PLN, EUR, CZK, GBP, HUF', blurb: 'Polish bank transfers, BLIK and cards. Customer is redirected to the Przelewy24 page.' },
  stripe: { name: 'Stripe', currencies: 'All currencies', blurb: 'Cards, Apple Pay, Google Pay (and BLIK / Przelewy24 when enabled in your Stripe dashboard). Hosted Stripe Checkout page.' },
  razorpay: { name: 'Razorpay', currencies: 'INR only', blurb: 'UPI, cards, net banking and wallets in a pop-up. Only offered where the currency is INR.' },
};
const PROVIDER_ORDER = ['przelewy24', 'stripe', 'razorpay'];

const STATUS_STYLE = {
  paid: 'bg-green-100 text-green-700', partially_refunded: 'bg-amber-100 text-amber-700', refunded: 'bg-slate-200 text-slate-700',
  pending: 'bg-blue-100 text-blue-700', created: 'bg-blue-100 text-blue-700', failed: 'bg-red-100 text-red-700',
  expired: 'bg-slate-100 text-slate-500', cancelled: 'bg-slate-100 text-slate-500',
};
const badge = (text, cls) => <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${cls}`}>{text}</span>;
const inputCls = 'bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400';
const fmtMoney = (n, cur) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(n); } catch { return `${n} ${cur}`; } };
const errText = (e, fallback) => e?.response?.data?.message || e?.message || fallback;

function Toggle({ on, disabled, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative w-12 h-7 rounded-full transition ${on ? 'bg-green-500' : 'bg-slate-300'} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
      <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-[#ffffff] rounded-full shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

// ─── Providers & routing ─────────────────────────────────────────────────────

function ProvidersTab({ notify }) {
  const [data, setData] = useState(null);
  const [rules, setRules] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState({});
  const [results, setResults] = useState({});
  const [newCountry, setNewCountry] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await adminAPI.getPaymentsOverview();
      const d = res?.data?.data;
      setData(d);
      setRules(d.countryRules.map((r) => ({ country: r.country, providers: [...r.providers] })));
      setDirty(false);
    } catch (e) { notify('error', errText(e, 'Failed to load payment settings')); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const switchProvider = async (id, enabled) => {
    try {
      const res = await adminAPI.updatePaymentSettings({ providers: { [id]: { enabled } }, reason: `${enabled ? 'Enabled' : 'Disabled'} ${PROVIDER_INFO[id].name}` });
      setData((d) => ({ ...d, ...res.data.data }));
      notify('success', `${PROVIDER_INFO[id].name} ${enabled ? 'switched on' : 'switched off'}`);
    } catch (e) { notify('error', errText(e, 'Could not change the provider')); }
  };

  const test = async (id) => {
    setTesting((t) => ({ ...t, [id]: true }));
    try {
      const res = await adminAPI.testPaymentProvider(id);
      setResults((r) => ({ ...r, [id]: res.data.data }));
    } catch (e) { setResults((r) => ({ ...r, [id]: { ok: false, message: errText(e, 'Test failed') } })); }
    setTesting((t) => ({ ...t, [id]: false }));
  };

  const toggleRule = (country, id) => {
    setRules((rs) => rs.map((r) => (r.country !== country ? r : { ...r, providers: r.providers.includes(id) ? r.providers.filter((p) => p !== id) : [...r.providers, id] })));
    setDirty(true);
  };
  const addCountry = () => {
    const c = newCountry.trim();
    if (!c) return;
    setRules((rs) => [...rs.filter((r) => r.country !== '*'), { country: c, providers: [] }, ...rs.filter((r) => r.country === '*')]);
    setNewCountry('');
    setDirty(true);
  };
  const removeCountry = (country) => { setRules((rs) => rs.filter((r) => r.country !== country)); setDirty(true); };

  const saveRules = async () => {
    setSaving(true);
    try {
      const res = await adminAPI.updatePaymentSettings({ countryRules: rules, reason: 'Country routing updated' });
      setData((d) => ({ ...d, ...res.data.data }));
      setRules(res.data.data.countryRules.map((r) => ({ country: r.country, providers: [...r.providers] })));
      setDirty(false);
      notify('success', 'Payment routing saved');
    } catch (e) { notify('error', errText(e, 'Could not save routing')); }
    setSaving(false);
  };

  const copy = (text) => { navigator.clipboard?.writeText(text); notify('success', 'Copied'); };

  if (!data) return <div className="p-8 text-slate-500">Loading…</div>;
  const byId = Object.fromEntries(data.providers.map((p) => [p.id, p]));

  return (
    <div className="space-y-8">
      {data.warnings?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-1.5">
          {data.warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-800 flex gap-2"><AlertTriangle size={16} className="mt-0.5 flex-none" /><span>{w}</span></p>
          ))}
        </div>
      )}

      <section>
        <h2 className="text-sm font-black text-slate-500 uppercase tracking-wider mb-3">Payment providers</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {PROVIDER_ORDER.map((id) => {
            const p = byId[id];
            const info = PROVIDER_INFO[id];
            const r = results[id];
            return (
              <div key={id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-800">{info.name}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {p.configured ? badge('Keys configured', 'bg-green-100 text-green-700') : badge('Keys missing', 'bg-red-100 text-red-700')}
                      {p.mode && badge(p.mode.toUpperCase(), p.mode === 'live' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700')}
                    </div>
                  </div>
                  <Toggle on={p.enabled} disabled={!p.configured && !p.enabled} label={`Switch ${info.name} on or off`} onChange={(v) => switchProvider(id, v)} />
                </div>
                <p className="text-[13px] text-slate-500">{info.blurb}</p>
                <p className="text-[12px] text-slate-400">Currencies: {info.currencies}</p>
                {!p.configured && (
                  <p className="text-[12px] text-red-600">
                    {p.enabled
                      ? 'Switched on, but customers cannot use it until its keys are added to the server environment (.env) and the backend is restarted.'
                      : 'Add its keys to the server environment (.env) and restart the backend, then it can be switched on.'}
                  </p>
                )}
                <div className="mt-auto pt-1">
                  <button type="button" onClick={() => test(id)} disabled={testing[id]} className="w-full py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 disabled:opacity-60">
                    <Plug size={15} /> {testing[id] ? 'Testing…' : 'Test connection'}
                  </button>
                  {r && (
                    <p className={`text-[12px] mt-2 flex gap-1.5 ${r.ok ? 'text-green-700' : 'text-red-600'}`}>
                      {r.ok ? <CheckCircle size={14} className="flex-none mt-0.5" /> : <XCircle size={14} className="flex-none mt-0.5" />}{r.message}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-black text-slate-500 uppercase tracking-wider">Which provider is offered where</h2>
            <p className="text-[13px] text-slate-500 mt-1">Tick the providers customers of each country can use. With one ticked they go straight to it; with several they choose at checkout. If none of a country's providers is usable, the "Other countries" row is used.</p>
          </div>
          <button type="button" onClick={saveRules} disabled={!dirty || saving} className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm flex items-center gap-2 disabled:opacity-40">
            <Save size={15} /> {saving ? 'Saving…' : 'Save routing'}
          </button>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-3">Country</th>
                {PROVIDER_ORDER.map((id) => <th key={id} className="px-4 py-3">{PROVIDER_INFO[id].name}</th>)}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.country} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-bold text-slate-700">{r.country === '*' ? 'Other countries' : r.country}</td>
                  {PROVIDER_ORDER.map((id) => (
                    <td key={id} className="px-4 py-3 text-center">
                      <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={r.providers.includes(id)} onChange={() => toggleRule(r.country, id)}
                        aria-label={`${PROVIDER_INFO[id].name} for ${r.country === '*' ? 'other countries' : r.country}`} />
                      {r.providers.includes(id) && !byId[id].available && <div className="text-[10px] text-amber-600 mt-0.5">not active</div>}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    {r.country !== '*' && <button type="button" onClick={() => removeCountry(r.country)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" aria-label={`Remove ${r.country}`}><Trash2 size={15} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2 p-3 border-t border-slate-100 bg-slate-50">
            <input className={`${inputCls} flex-1`} placeholder="Add a country, e.g. Germany or DE" value={newCountry} onChange={(e) => setNewCountry(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCountry()} />
            <button type="button" onClick={addCountry} className="px-4 rounded-xl bg-white border border-slate-200 font-bold text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-1.5"><Plus size={15} /> Add</button>
          </div>
        </div>
        <p className="text-[12px] text-slate-400 mt-2">A customer's country comes from the zone they order in (or, for wallet top-ups and driver deposits, their phone country code).</p>
      </section>

      <section>
        <h2 className="text-sm font-black text-slate-500 uppercase tracking-wider mb-3">Addresses to give the providers</h2>
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {[['Przelewy24 notifications (urlStatus)', data.urls.webhooks.przelewy24, 'Sent automatically with every payment, no dashboard setting needed.'],
            ['Stripe webhook endpoint', data.urls.webhooks.stripe, 'Add in Stripe Dashboard > Developers > Webhooks. Events: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired, charge.refunded.'],
            ['Razorpay webhook', data.urls.webhooks.razorpay, 'Events: payment.captured, payment.failed, refund.processed.'],
            ['App return address', `${data.urls.app}/payment/return`, 'Where customers land after paying on a provider page.']].map(([label, url, hint]) => (
            <div key={label} className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-700">{label}</p>
                <p className="text-[13px] font-mono text-slate-600 break-all">{url}</p>
                <p className="text-[12px] text-slate-400 mt-0.5">{hint}</p>
              </div>
              <button type="button" onClick={() => copy(url)} className="p-2 rounded-lg hover:bg-slate-100 flex-none" aria-label={`Copy ${label}`}><Copy size={15} /></button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Transactions ────────────────────────────────────────────────────────────

function RefundDialog({ tx, onClose, onDone, notify }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const refundable = Math.round((tx.amount - tx.refunded) * 100) / 100;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await adminAPI.refundPaymentTransaction(tx.id, { amount: amount === '' ? undefined : Number(amount), reason });
      notify('success', 'Refund sent to the provider');
      onDone();
    } catch (err) { notify('error', errText(err, 'Refund failed')); }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between"><h3 className="text-lg font-black text-slate-800">Refund {tx.id}</h3><button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button></div>
        <p className="text-sm text-slate-500">Paid {fmtMoney(tx.amount, tx.currency)} via {PROVIDER_INFO[tx.provider]?.name || tx.provider}. Refundable now: <b>{fmtMoney(refundable, tx.currency)}</b>. The money goes back to the customer's original payment method.</p>
        <label className="block"><span className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Amount (leave empty for the full remaining amount)</span>
          <input className={`${inputCls} w-full`} type="number" step="0.01" min="0.01" max={refundable} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(refundable)} /></label>
        <label className="block"><span className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Reason</span>
          <input className={`${inputCls} w-full`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Order not delivered" /></label>
        <p className="text-[12px] text-amber-700 bg-amber-50 rounded-xl p-3">This does not cancel the subscription or order. Cancel it separately if needed.</p>
        <div className="flex gap-3"><button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600">Cancel</button>
          <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white-force font-bold disabled:opacity-60">{busy ? 'Refunding…' : 'Refund'}</button></div>
      </form>
    </div>
  );
}

function TransactionsTab({ notify }) {
  const [filters, setFilters] = useState({ status: '', provider: '', purpose: '', q: '' });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [refunding, setRefunding] = useState(null);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
      const res = await adminAPI.getPaymentTransactions(params);
      setRows(res.data.data.transactions);
      setMeta({ total: res.data.data.total, totalPages: res.data.data.totalPages });
    } catch (e) { notify('error', errText(e, 'Failed to load payments')); }
    setLoading(false);
  }, [filters, page, notify]);
  useEffect(() => { load(); }, [load]);

  const setF = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const openDetail = async (id) => { try { setDetail((await adminAPI.getPaymentTransaction(id)).data.data); } catch (e) { notify('error', errText(e, 'Failed to load payment')); } };
  const recheck = async (tx) => {
    setBusyId(tx.id);
    try { await adminAPI.recheckPaymentTransaction(tx.id); notify('success', 'Checked with the provider'); load(); } catch (e) { notify('error', errText(e, 'Re-check failed')); }
    setBusyId('');
  };
  const canRefund = (t) => ['paid', 'partially_refunded'].includes(t.status) && t.purpose !== 'wallet_topup' && t.provider !== 'mock' && t.amount - t.refunded > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]"><Search size={15} className="absolute left-3 top-3 text-slate-400" />
          <input className={`${inputCls} w-full pl-9`} placeholder="Search id, email, name…" value={filters.q} onChange={(e) => setF('q', e.target.value)} /></div>
        <select className={inputCls} value={filters.status} onChange={(e) => setF('status', e.target.value)}>
          <option value="">All statuses</option><option value="attention">Needs attention</option>
          {['paid', 'pending', 'failed', 'expired', 'cancelled', 'partially_refunded', 'refunded'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select className={inputCls} value={filters.provider} onChange={(e) => setF('provider', e.target.value)}>
          <option value="">All providers</option>{PROVIDER_ORDER.map((p) => <option key={p} value={p}>{PROVIDER_INFO[p].name}</option>)}
        </select>
        <select className={inputCls} value={filters.purpose} onChange={(e) => setF('purpose', e.target.value)}>
          <option value="">All types</option>
          {[['subscription', 'Subscription'], ['pantry', 'Pantry'], ['wallet_topup', 'Wallet top-up'], ['tip', 'Driver tip'], ['office', 'Office'], ['driver_deposit', 'Driver deposit']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="button" onClick={load} className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50" aria-label="Refresh"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>
            {['Payment', 'Type', 'Provider', 'Amount', 'Status', 'Customer', 'Created', ''].map((h) => <th key={h} className="text-left px-4 py-3">{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">{loading ? 'Loading…' : 'No payments found'}</td></tr>}
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="px-4 py-3 font-mono text-[12px]"><button type="button" className="text-indigo-600 font-bold hover:underline" onClick={() => openDetail(t.id)}>{t.id}</button></td>
                <td className="px-4 py-3">{t.purpose.replace('_', ' ')}</td>
                <td className="px-4 py-3">{PROVIDER_INFO[t.provider]?.name || t.provider}</td>
                <td className="px-4 py-3 font-bold">{fmtMoney(t.amount, t.currency)}{t.refunded > 0 && <div className="text-[11px] text-amber-600 font-semibold">refunded {fmtMoney(t.refunded, t.currency)}</div>}</td>
                <td className="px-4 py-3">
                  {badge(t.status.replace('_', ' '), STATUS_STYLE[t.status] || 'bg-slate-100 text-slate-600')}
                  {(t.flags?.length > 0 || (t.status === 'paid' && !t.fulfilled)) && <div className="mt-1">{badge(t.flags?.[0] ? t.flags[0].replace('_', ' ') : 'not delivered', 'bg-red-100 text-red-700')}</div>}
                </td>
                <td className="px-4 py-3 text-slate-600">{t.customer?.name || t.customer?.email || '—'}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(t.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  {['created', 'pending', 'failed', 'expired'].includes(t.status) || (t.status === 'paid' && !t.fulfilled) ? (
                    <button type="button" disabled={busyId === t.id} onClick={() => recheck(t)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RotateCcw size={12} className="inline mr-1" />Re-check</button>
                  ) : null}
                  {canRefund(t) && <button type="button" onClick={() => setRefunding(t)} className="ml-2 px-3 py-1.5 rounded-lg border border-red-200 text-xs font-bold text-red-600 hover:bg-red-50">Refund</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{meta.total} payment{meta.total === 1 ? '' : 's'}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Previous</button>
          <span className="px-2 py-1.5">Page {page} of {meta.totalPages}</span>
          <button type="button" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Next</button>
        </div>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={() => setDetail(null)}>
          <div className="bg-white w-full max-w-md h-full overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-black text-slate-800">{detail.id}</h3><button type="button" onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button></div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[['Status', detail.status], ['Amount', fmtMoney(detail.amount, detail.currency)], ['Provider', PROVIDER_INFO[detail.provider]?.name || detail.provider], ['Type', detail.purpose], ['Country', detail.country || '—'],
                ['Provider order', detail.providerOrderId || '—'], ['Provider payment', detail.providerPaymentId || '—'], ['Delivered', detail.fulfilled ? 'Yes' : 'No'], ['Paid at', detail.paidAt ? new Date(detail.paidAt).toLocaleString() : '—']].map(([k, v]) => (
                <React.Fragment key={k}><dt className="text-slate-400">{k}</dt><dd className="font-semibold text-slate-700 break-all">{v}</dd></React.Fragment>))}
            </dl>
            {detail.fulfilmentError && <p className="text-sm text-red-700 bg-red-50 rounded-xl p-3">Delivery problem: {detail.fulfilmentError}</p>}
            {detail.failureReason && <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3">{detail.failureReason}</p>}
            {detail.refunds?.length > 0 && (<div><h4 className="text-[11px] font-bold text-slate-500 uppercase mb-2">Refunds</h4>
              {detail.refunds.map((r) => <p key={r.refundKey || r._id} className="text-sm text-slate-600">{fmtMoney(r.amountMinor / 100, detail.currency)} · {r.status}{r.reason ? ` · ${r.reason}` : ''}</p>)}</div>)}
            <div><h4 className="text-[11px] font-bold text-slate-500 uppercase mb-2">History</h4>
              <ol className="space-y-1.5 border-l-2 border-slate-100 pl-4">
                {detail.events.map((e, i) => <li key={i} className="text-[13px]"><span className="font-bold text-slate-700">{e.type.replace(/_/g, ' ')}</span> <span className="text-slate-400">· {e.source} · {new Date(e.at).toLocaleString()}</span>{e.note && <div className="text-slate-500">{e.note}</div>}</li>)}
              </ol></div>
          </div>
        </div>
      )}
      {refunding && <RefundDialog tx={refunding} notify={notify} onClose={() => setRefunding(null)} onDone={() => { setRefunding(null); load(); }} />}
    </div>
  );
}

export default function PaymentsPage() {
  const [tab, setTab] = useState('providers');
  const [toast, setToast] = useState(null);
  const notify = useCallback((type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 5000); }, []);

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center"><CreditCard size={22} /></div>
        <div><h1 className="text-2xl font-black text-slate-800">Payments</h1><p className="text-sm text-slate-500">Choose which payment providers customers can use, and follow every payment.</p></div>
      </div>
      <div className="flex gap-2 mb-6" role="tablist">
        {[['providers', 'Providers & routing'], ['transactions', 'All payments']].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>
        ))}
      </div>
      {tab === 'providers' ? <ProvidersTab notify={notify} /> : <TransactionsTab notify={notify} />}
      {toast && (
        <div role="status" className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white-force ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{toast.msg}</div>
      )}
    </div>
  );
}
