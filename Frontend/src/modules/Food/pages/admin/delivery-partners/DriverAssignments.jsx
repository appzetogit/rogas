import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, X, Plus, AlertTriangle, CheckCircle2, Clock, Copy, RefreshCw, UserX, Lock, ListChecks } from 'lucide-react';
import { dmbExtraAdminAPI } from '../../../../../services/api';

const errText = (e, fallback) => e?.response?.data?.message || e?.message || fallback;

const ymd = (d) => d.toISOString().slice(0, 10);
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))); };

const CELL_STYLE = {
  covered: 'border-green-200 bg-green-50',
  awaiting: 'border-amber-200 bg-amber-50',
  uncovered: 'border-red-300 bg-red-50',
  idle: 'border-slate-200 bg-white'
};
const STATE_STYLE = {
  accepted: { cls: 'bg-green-100 text-green-800', label: 'Accepted' },
  pending: { cls: 'bg-amber-100 text-amber-800', label: 'Waiting' },
  declined: { cls: 'bg-slate-200 text-slate-600 line-through', label: 'Declined' },
  expired: { cls: 'bg-slate-200 text-slate-600', label: 'No answer' }
};

function SummaryChip({ icon: Icon, label, value, tone }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold ${tone}`}>
      <Icon size={16} /> <span>{value}</span> <span className="font-medium opacity-80">{label}</span>
    </div>
  );
}

function AssignModal({ target, date, onClose, onAssigned, notify }) {
  const [drivers, setDrivers] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    dmbExtraAdminAPI.assignmentDrivers({ zoneId: target.zone._id, date, slotKey: target.slot.key })
      .then((res) => setDrivers(res?.data?.drivers || []))
      .catch((e) => { notify('error', errText(e, 'Could not load drivers')); setDrivers([]); });
  }, [target, date, notify]);

  const assign = async (driver) => {
    setBusy(driver._id);
    try {
      await dmbExtraAdminAPI.assignDriver({ date, zoneId: target.zone._id, slotKey: target.slot.key, driverId: driver._id });
      notify('success', `${driver.name} was asked to take ${target.zone.name} - ${target.slot.name}`);
      onAssigned();
      onClose();
    } catch (e) { notify('error', errText(e, 'Could not assign')); } finally { setBusy(''); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="font-black text-slate-800">Assign a driver</h2>
            <p className="text-xs text-slate-500">{target.zone.name} · {target.slot.name} ({target.slot.startTime}–{target.slot.endTime}) · {date}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto p-3">
          {drivers === null ? <p className="p-6 text-center text-slate-400 text-sm">Loading…</p>
            : drivers.length === 0 ? <p className="p-6 text-center text-slate-500 text-sm">No approved driver is authorised for this zone. Add the zone to a driver first (Deliveryman list → edit).</p>
              : drivers.map((d) => {
                const disabled = d.bookedElsewhere || d.alreadyInCell;
                return (
                  <button key={d._id} type="button" disabled={disabled || busy === d._id} onClick={() => assign(d)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent">
                    <span>
                      <span className="block font-semibold text-slate-800 text-sm">{d.name}</span>
                      <span className="block text-xs text-slate-500">{d.phone}{d.vehicleType ? ` · ${d.vehicleType}` : ''}</span>
                    </span>
                    <span className="flex gap-1.5 shrink-0">
                      {d.additionalZone && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700">Additional zone</span>}
                      {d.alreadyInCell && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">Already here</span>}
                      {d.bookedElsewhere && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">Booked in another zone</span>}
                    </span>
                  </button>
                );
              })}
        </div>
      </div>
    </div>
  );
}

function CellModal({ target, date, onClose, onChanged, notify }) {
  const [cell, setCell] = useState(null);
  const [busy, setBusy] = useState('');
  const params = { date, zoneId: target.zone._id, slotKey: target.slot.key };

  const load = useCallback(() => {
    dmbExtraAdminAPI.assignmentCell(params)
      .then((res) => setCell(res?.data?.cell || null))
      .catch((e) => { notify('error', errText(e, 'Could not load the deliveries')); setCell({ drivers: [], units: [] }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, target.zone._id, target.slot.key, notify]);
  useEffect(() => { load(); }, [load]);

  const move = async (unit, toDriverId) => {
    if (!toDriverId || toDriverId === unit.driverId) return;
    setBusy(unit.id);
    try {
      const res = await dmbExtraAdminAPI.moveDelivery({ ...params, kind: unit.kind, id: unit.id, toDriverId });
      setCell(res?.data?.cell || cell);
      notify('success', 'Delivery moved');
      onChanged();
    } catch (e) { notify('error', errText(e, 'Could not move the delivery')); } finally { setBusy(''); }
  };

  const nameOf = (id) => cell?.drivers?.find((d) => String(d._id) === String(id))?.name || 'Not placed';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="font-black text-slate-800">Deliveries in {target.zone.name} · {target.slot.name}</h2>
            <p className="text-xs text-slate-500">{date}{cell?.lockedAt ? ' · locked: the split below was made at the cutoff' : ' · not locked yet: the split is made at the slot cutoff'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto p-4">
          {cell === null ? <p className="p-6 text-center text-slate-400 text-sm">Loading…</p> : (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                {cell.drivers.length === 0 && <span className="text-sm text-red-600 font-semibold">No driver has accepted this cell.</span>}
                {cell.drivers.map((d) => (
                  <span key={d._id} className="px-3 py-1.5 rounded-xl bg-green-50 border border-green-200 text-xs font-bold text-green-800">{d.name}: {d.load} tiffin(s) · {d.stops} stop(s)</span>
                ))}
              </div>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500 bg-slate-50">
                  <th className="px-3 py-2 font-bold">Order</th><th className="px-3 py-2 font-bold">From</th><th className="px-3 py-2 font-bold">To</th>
                  <th className="px-3 py-2 font-bold">Status</th><th className="px-3 py-2 font-bold">Driver</th>
                </tr></thead>
                <tbody>
                  {cell.units.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No deliveries.</td></tr> : cell.units.map((u) => (
                    <tr key={`${u.kind}-${u.id}`} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold text-slate-800">{u.label}{u.kind === 'pantry' ? ' (bag)' : ''}</td>
                      <td className="px-3 py-2 text-slate-600">{u.vendor}</td>
                      <td className="px-3 py-2 text-slate-600">{u.area || '—'}</td>
                      <td className="px-3 py-2 text-slate-600 capitalize">{String(u.status).replace(/_/g, ' ')}</td>
                      <td className="px-3 py-2">
                        {u.movable && cell.drivers.length > 0 ? (
                          <select value={u.driverId || ''} disabled={busy === u.id} onChange={(e) => move(u, e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold">
                            <option value="">Not placed</option>
                            {cell.drivers.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                          </select>
                        ) : <span className="text-xs text-slate-500">{nameOf(u.driverId)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DriverAssignments() {
  const [date, setDate] = useState(tomorrowStr());
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const [target, setTarget] = useState(null);
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState(null);
  const notify = useCallback((type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 5000); }, []);

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await dmbExtraAdminAPI.assignmentBoard({ date });
      setBoard(res?.data?.board || null);
    } catch (e) { setBoard(null); setError(errText(e, 'Could not load the planning board')); }
  }, [date]);
  useEffect(() => { load(); }, [load]);

  const cellMap = useMemo(() => new Map((board?.cells || []).map((c) => [`${c.zoneId}:${c.slotKey}`, c])), [board]);

  const remove = async (a) => {
    if (!window.confirm(`Remove ${a.name} from this cell?`)) return;
    try { await dmbExtraAdminAPI.unassignDriver(a.shiftId); notify('success', `${a.name} was removed`); load(); } catch (e) { notify('error', errText(e, 'Could not remove')); }
  };

  const copyFrom = async () => {
    const from = window.prompt('Copy the assignments of which day? (YYYY-MM-DD)', '');
    if (!from) return;
    try {
      const res = await dmbExtraAdminAPI.copyAssignments({ fromDate: from, toDate: date });
      const { copied, skipped } = res.data;
      notify(skipped?.length ? 'error' : 'success', `${copied} assignment(s) copied${skipped?.length ? `, ${skipped.length} skipped (${skipped[0].reason})` : ''}`);
      load();
    } catch (e) { notify('error', errText(e, 'Could not copy')); }
  };

  const t = board?.totals;
  return (
    <div className="p-4 lg:p-8 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center"><CalendarClock size={22} /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-800">Driver Assignments</h1>
            <p className="text-sm text-slate-500">Assign drivers to each zone and slot the day before. Drivers accept or decline; you are alerted if a cell is left without a driver.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700" />
          <button type="button" onClick={copyFrom} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50"><Copy size={14} /> Copy from a day</button>
          <button type="button" onClick={load} aria-label="Refresh" className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><RefreshCw size={16} /></button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {t && (
        <div className="flex flex-wrap gap-2 mb-4">
          <SummaryChip icon={Clock} label="orders" value={t.orders} tone="bg-white border-slate-200 text-slate-700" />
          <SummaryChip icon={Clock} label="tiffins" value={t.tiffins} tone="bg-white border-slate-200 text-slate-700" />
          <SummaryChip icon={Clock} label="pantry bags" value={t.bags} tone="bg-white border-slate-200 text-slate-700" />
          <SummaryChip icon={CheckCircle2} label="cells covered" value={t.covered} tone="bg-green-50 border-green-200 text-green-800" />
          <SummaryChip icon={Clock} label="awaiting answer" value={t.awaiting} tone="bg-amber-50 border-amber-200 text-amber-800" />
          <SummaryChip icon={AlertTriangle} label="without a driver" value={t.uncovered} tone="bg-red-50 border-red-200 text-red-700" />
        </div>
      )}
      {board?.unzoned?.orders > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center gap-2">
          <UserX size={16} /> {board.unzoned.orders} delivery(ies) on this day have no delivery zone, so they cannot be planned. Fix the customer address or subscription zone.
        </div>
      )}

      {board === null && !error ? <p className="text-slate-400 py-10 text-center">Loading…</p> : board && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          {board.zones.length === 0 || board.slots.length === 0 ? (
            <p className="p-10 text-center text-slate-500 text-sm">{board.slots.length === 0 ? 'No delivery slot runs on this day.' : 'There are no active delivery zones.'}</p>
          ) : (
            <table className="w-full text-sm border-separate border-spacing-2">
              <thead>
                <tr>
                  <th className="text-left px-2 py-1 text-slate-500 font-bold min-w-[140px]">Zone</th>
                  {board.slots.map((s) => (
                    <th key={s.key} className="text-left px-2 py-1 min-w-[210px]">
                      <span className="font-black text-slate-800">{s.icon} {s.name}</span>
                      <span className="block text-[11px] font-medium text-slate-500">{s.startTime}–{s.endTime}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {board.zones.map((z) => (
                  <tr key={z._id}>
                    <td className="px-2 py-1 font-bold text-slate-800 align-top">{z.name}</td>
                    {board.slots.map((s) => {
                      const c = cellMap.get(`${z._id}:${s.key}`);
                      const work = c ? c.orders + c.bags : 0;
                      return (
                        <td key={s.key} className={`align-top rounded-xl border p-3 ${CELL_STYLE[c?.status || 'idle']}`}>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-xs font-bold text-slate-700">
                              {work > 0 ? `${c.orders} orders · ${c.tiffins} tiffins${c.bags ? ` · ${c.bags} bags` : ''}` : <span className="text-slate-400 font-medium">No deliveries</span>}
                            </span>
                            {c?.status === 'uncovered' && <AlertTriangle size={14} className="text-red-600 shrink-0" aria-label="No driver" />}
                            {c?.lockedAt && <Lock size={13} className="text-slate-500 shrink-0" aria-label="Locked at the cutoff" />}
                          </div>
                          <div className="space-y-1.5">
                            {(c?.assignments || []).map((a) => {
                              const st = STATE_STYLE[a.state] || STATE_STYLE.pending;
                              return (
                                <div key={a.shiftId} className={`flex items-center justify-between gap-2 px-2 py-1 rounded-lg text-xs font-semibold ${st.cls}`} title={a.declineReason || ''}>
                                  <span className="truncate">{a.name}{a.additionalZone ? ' (add. zone)' : ''} · {st.label}{a.state === 'accepted' && a.load ? ` · ${a.load} orders` : ''}</span>
                                  <button type="button" onClick={() => remove(a)} aria-label={`Remove ${a.name}`} className="opacity-60 hover:opacity-100"><X size={13} /></button>
                                </div>
                              );
                            })}
                          </div>
                          <div className="mt-2 flex items-center gap-3">
                            <button type="button" onClick={() => setTarget({ zone: z, slot: s })}
                              className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"><Plus size={13} /> Assign driver</button>
                            {work > 0 && (
                              <button type="button" onClick={() => setDetail({ zone: z, slot: s })}
                                className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900"><ListChecks size={13} /> Deliveries</button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">Alerts for declined or unanswered assignments, and for cells still without a driver, appear in the <Link to="/admin/food/dmb/alerts" className="underline font-semibold">admin alerts</Link>. Timing is set in the driver-assignment control (ACM-185).</p>

      {detail && <CellModal target={detail} date={date} onClose={() => setDetail(null)} onChanged={load} notify={notify} />}
      {target && <AssignModal target={target} date={date} onClose={() => setTarget(null)} onAssigned={load} notify={notify} />}
      {toast && <div role="status" className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white-force ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{toast.msg}</div>}
    </div>
  );
}
