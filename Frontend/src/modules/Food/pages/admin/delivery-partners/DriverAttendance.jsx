import React, { useState, useEffect, useCallback } from 'react';
import { CalendarCheck, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { adminAPI, dmbExtraAdminAPI } from '../../../../../services/api';

const errText = (e, fallback) => e?.response?.data?.message || e?.message || fallback;
const badge = (text, cls) => <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${cls}`}>{text}</span>;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function RatesTab({ notify }) {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [rows, setRows] = useState(null);
  const [fleetPartnerId, setFleetPartnerId] = useState('');
  const [partners, setPartners] = useState([]);
  useEffect(() => {
    dmbExtraAdminAPI.fleetPartners().then((res) => setPartners(res?.data?.partners || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await adminAPI.getAttendanceOverview({ year, month, maxRate: flaggedOnly ? 80 : undefined, fleetPartnerId: fleetPartnerId || undefined });
      setRows(res?.data?.data || []);
    } catch (e) { notify('error', errText(e, 'Failed to load attendance')); }
  }, [year, month, flaggedOnly, fleetPartnerId, notify]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700">
          {MONTH_NAMES.map((name, i) => <option key={name} value={i}>{name}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700">
          {[now.getUTCFullYear() - 1, now.getUTCFullYear()].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={fleetPartnerId} onChange={(e) => setFleetPartnerId(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700">
          <option value="">All fleet partners</option>
          {partners.map((p) => <option key={p._id} value={p._id}>{p.companyName}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 ml-2">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
          Below 80% only
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-left">
              <th className="px-4 py-3 font-bold">Driver</th>
              <th className="px-4 py-3 font-bold">City</th>
              <th className="px-4 py-3 font-bold">Fleet partner</th>
              <th className="px-4 py-3 font-bold text-right">Completed</th>
              <th className="px-4 py-3 font-bold text-right">No-show</th>
              <th className="px-4 py-3 font-bold text-right">Rate</th>
              <th className="px-4 py-3 font-bold text-right" title="Completed shifts that count for the minimum guarantee">Guarantee shifts</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No drivers to show.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.driverId} className="border-t border-slate-100">
                <td className="px-4 py-3 font-semibold text-slate-800">{r.name}</td>
                <td className="px-4 py-3 text-slate-500">{r.city || '—'}</td>
                <td className="px-4 py-3 text-slate-500">{r.fleetPartnerName || '—'}</td>
                <td className="px-4 py-3 text-right text-slate-700">{r.completed}</td>
                <td className="px-4 py-3 text-right text-slate-700">{r.noShow}</td>
                <td className="px-4 py-3 text-right">
                  {r.rate === null
                    ? <span className="text-slate-400">—</span>
                    : badge(`${r.rate}%`, r.rate < 80 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')}
                </td>
                <td className="px-4 py-3 text-right text-slate-700">{r.guaranteeShifts ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TomorrowTab({ notify }) {
  const [rows, setRows] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await adminAPI.getTomorrowShifts();
      setRows(res?.data?.data || []);
    } catch (e) { notify('error', errText(e, 'Failed to load tomorrow\'s shifts')); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-slate-500 text-left">
            <th className="px-4 py-3 font-bold">Driver</th>
            <th className="px-4 py-3 font-bold">City</th>
            <th className="px-4 py-3 font-bold">Slot</th>
            <th className="px-4 py-3 font-bold">Confirmation</th>
          </tr>
        </thead>
        <tbody>
          {rows === null ? (
            <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No shifts scheduled for tomorrow yet.</td></tr>
          ) : rows.map((r, i) => (
            <tr key={`${r.driverId}-${r.slotKey}-${i}`} className="border-t border-slate-100">
              <td className="px-4 py-3 font-semibold text-slate-800">{r.name}</td>
              <td className="px-4 py-3 text-slate-500">{r.city || '—'}</td>
              <td className="px-4 py-3 text-slate-700 capitalize">{r.slotKey}</td>
              <td className="px-4 py-3">
                {r.confirmed
                  ? <span className="inline-flex items-center gap-1.5 text-green-700 font-semibold text-xs"><CheckCircle size={14} /> Confirmed</span>
                  : <span className="inline-flex items-center gap-1.5 text-amber-600 font-semibold text-xs"><AlertTriangle size={14} /> Not confirmed</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DriverAttendance() {
  const [tab, setTab] = useState('rates');
  const [toast, setToast] = useState(null);
  const notify = useCallback((type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 5000); }, []);

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center"><CalendarCheck size={22} /></div>
        <div><h1 className="text-2xl font-black text-slate-800">Driver Attendance</h1><p className="text-sm text-slate-500">Attendance rate per driver, and tomorrow's shift confirmations.</p></div>
      </div>
      <div className="flex gap-2 mb-6" role="tablist">
        {[['rates', 'Attendance rate'], ['tomorrow', "Tomorrow's shifts"]].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>
        ))}
      </div>
      {tab === 'rates' ? <RatesTab notify={notify} /> : <TomorrowTab notify={notify} />}
      {toast && (
        <div role="status" className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white-force ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{toast.msg}</div>
      )}
    </div>
  );
}
