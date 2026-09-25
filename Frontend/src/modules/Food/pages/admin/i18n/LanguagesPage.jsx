import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Globe, Plus, Pencil, Trash2, Languages, CheckCircle, AlertTriangle, X, Star, Lock } from 'lucide-react';
import { adminAPI } from '../../../../../services/api';

const EMPTY = { code: '', name: '', nativeName: '', flag: '', direction: 'ltr', sortOrder: '' };
const inputCls = 'w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-slate-50 disabled:text-slate-400';

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
  </label>
);

function LanguageModal({ initial, onClose, onSaved }) {
  const editing = Boolean(initial?._id);
  const [form, setForm] = useState({ ...EMPTY, ...initial, sortOrder: initial?.sortOrder ?? '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setSaving(true);
    try {
      const body = {
        name: form.name,
        nativeName: form.nativeName,
        flag: form.flag,
        direction: form.direction,
        ...(form.sortOrder !== '' ? { sortOrder: Number(form.sortOrder) } : {}),
      };
      if (editing) await adminAPI.updateLanguage(initial._id, body);
      else await adminAPI.createLanguage({ ...body, code: form.code });
      onSaved(editing ? 'Language updated' : `${form.name} added. Open Translations to start translating it.`);
    } catch (e2) {
      setErr(e2?.response?.data?.message || 'Failed to save language');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-black text-slate-800">{editing ? 'Edit language' : 'Add language'}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2.5">{err}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Language code *" hint={editing ? 'Cannot be changed' : 'e.g. cs, sk, fr, pt-br'}>
              <input className={inputCls} value={form.code} disabled={editing} placeholder="cs" maxLength={12}
                onChange={(e) => set('code', e.target.value.toLowerCase().trim())} />
            </Field>
            <Field label="Flag" hint="Emoji, optional">
              <input className={inputCls} value={form.flag} placeholder="🇨🇿" maxLength={8} onChange={(e) => set('flag', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="English name *">
              <input className={inputCls} value={form.name} placeholder="Czech" onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Native name *" hint="Shown to users in the picker">
              <input className={inputCls} value={form.nativeName} placeholder="Čeština" onChange={(e) => set('nativeName', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Text direction">
              <select className={inputCls} value={form.direction} onChange={(e) => set('direction', e.target.value)}>
                <option value="ltr">Left to right</option>
                <option value="rtl">Right to left</option>
              </select>
            </Field>
            <Field label="Display order">
              <input type="number" className={inputCls} value={form.sortOrder} placeholder="auto" onChange={(e) => set('sortOrder', e.target.value)} />
            </Field>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-60">
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add language'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function LanguagesPage() {
  const [languages, setLanguages] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getLanguages();
      setLanguages(res?.data?.languages || []);
      setStats(Object.fromEntries((res?.data?.stats || []).map((s) => [s.code, s])));
    } catch (e) {
      showToast('error', e?.response?.data?.message || 'Failed to load languages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = async (lang, body, okMsg) => {
    try {
      await adminAPI.updateLanguage(lang._id, body);
      showToast('success', okMsg);
      load();
    } catch (e) {
      showToast('error', e?.response?.data?.message || 'Failed to update language');
    }
  };

  const doDelete = async () => {
    const lang = confirmDel;
    setConfirmDel(null);
    try {
      await adminAPI.deleteLanguage(lang._id);
      showToast('success', `${lang.name} deleted`);
      load();
    } catch (e) {
      showToast('error', e?.response?.data?.message || 'Failed to delete language');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6">
      {toast && (
        <div className={`fixed top-6 right-6 z-[60] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl text-sm font-semibold max-w-md ${toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle size={18} className="shrink-0" /> : <AlertTriangle size={18} className="shrink-0" />}
          <span>{toast.msg}</span>
        </div>
      )}

      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg">
              <Globe className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800">Languages</h1>
              <p className="text-slate-500 text-sm mt-0.5">Languages offered in the customer, vendor, delivery and office apps. Changes go live immediately, no app release needed.</p>
            </div>
          </div>
          <button onClick={() => setModal({})} className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-2xl shadow-lg">
            <Plus size={18} /> Add language
          </button>
        </div>

        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-5 py-4 mb-6 flex items-start gap-3">
          <AlertTriangle size={18} className="text-indigo-500 mt-0.5 shrink-0" />
          <p className="text-indigo-700 text-sm leading-relaxed">
            English is the source language and the fallback: any text not yet translated shows in English. A language that people are using can be
            <strong> disabled</strong> but not deleted. The admin panel itself stays in English.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />)}</div>
        ) : (
          <div className="space-y-3">
            {languages.map((l) => {
              const s = stats[l.code];
              const pct = s?.percent ?? 0;
              return (
                <div key={l._id} className={`bg-white border rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row lg:items-center gap-4 ${l.isEnabled ? 'border-slate-200' : 'border-slate-200 opacity-70'}`}>
                  <div className="flex items-center gap-4 lg:w-72 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-2xl shrink-0">{l.flag || <Languages size={22} className="text-slate-400" />}</div>
                    <div className="min-w-0">
                      <p className="font-black text-slate-800 truncate">{l.nativeName}</p>
                      <p className="text-xs text-slate-500 truncate">{l.name} · <span className="font-mono">{l.code}</span></p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 lg:w-44">
                    {l.isDefault && <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700"><Star size={11} /> Default</span>}
                    {l.isSystem && <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600"><Lock size={11} /> Fallback</span>}
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${l.isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{l.isEnabled ? 'Enabled' : 'Disabled'}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1">
                      <span>{l.isSystem ? 'Source language' : 'Translated'}</span>
                      <span>{s ? `${s.translated} / ${s.total} (${pct}%)` : '—'}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-indigo-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Link to={`/admin/food/translations?lang=${l.code}`} className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 font-bold text-xs hover:bg-indigo-100">Translate</Link>
                    <button onClick={() => setModal(l)} className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50" title="Edit"><Pencil size={15} /></button>
                    {!l.isSystem && (
                      <button
                        onClick={() => update(l, { isEnabled: !l.isEnabled }, l.isEnabled ? `${l.name} disabled` : `${l.name} enabled`)}
                        className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
                      >
                        {l.isEnabled ? 'Disable' : 'Enable'}
                      </button>
                    )}
                    {!l.isDefault && l.isEnabled && (
                      <button onClick={() => update(l, { isDefault: true }, `${l.name} is now the default language`)} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50">Make default</button>
                    )}
                    {!l.isSystem && !l.isDefault && (
                      <button onClick={() => setConfirmDel(l)} className="p-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50" title="Delete"><Trash2 size={15} /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && (
        <LanguageModal
          initial={modal}
          onClose={() => setModal(null)}
          onSaved={(msg) => { setModal(null); showToast('success', msg); load(); }}
        />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-black text-slate-800">Delete {confirmDel.name}?</h3>
            <p className="text-sm text-slate-500 mt-2">All translations for this language are removed. If any customer, vendor, driver or office account uses it, deletion is blocked — disable it instead.</p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setConfirmDel(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600">Cancel</button>
              <button onClick={doDelete} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
