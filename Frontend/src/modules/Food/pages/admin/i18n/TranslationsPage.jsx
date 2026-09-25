import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { FileText, Upload, Download, Search, CheckCircle, AlertTriangle, X, Loader2 } from 'lucide-react';
import { adminAPI } from '../../../../../services/api';

const NS_LABELS = {
  common: 'Common',
  customer: 'Customer app',
  vendor: 'Vendor app',
  driver: 'Delivery app',
  office: 'Office portal',
  notifications: 'Push notifications',
};
const PAGE_SIZE = 40;

const useDebounced = (value, ms = 350) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
};

function ImportModal({ report, busy, onClose, onApply }) {
  const hasErrors = report.invalid.length > 0 || report.unknown.length > 0;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-black text-slate-800">Import check</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {[
              ['In file', report.total, 'text-slate-800'],
              ['Will update', report.toWrite, 'text-emerald-600'],
              ['Will clear', report.toClear, 'text-amber-600'],
              ['Unchanged', report.unchanged, 'text-slate-500'],
            ].map(([label, n, cls]) => (
              <div key={label} className="rounded-xl bg-slate-50 border border-slate-100 py-3">
                <p className={`text-2xl font-black ${cls}`}>{n}</p>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
              </div>
            ))}
          </div>

          {report.invalid.length > 0 && (
            <div>
              <p className="text-sm font-bold text-red-600 mb-1">{report.invalid.length} invalid — placeholders don&apos;t match the source text</p>
              <div className="max-h-44 overflow-y-auto rounded-xl border border-red-100 divide-y divide-red-50 text-xs">
                {report.invalid.map((i) => (
                  <div key={i.key} className="px-3 py-2"><span className="font-mono text-slate-700">{i.key}</span><br /><span className="text-red-600">{i.reason}</span></div>
                ))}
              </div>
            </div>
          )}
          {report.unknown.length > 0 && (
            <div>
              <p className="text-sm font-bold text-amber-600 mb-1">{report.unknown.length} not found in this section — they will be ignored</p>
              <div className="max-h-32 overflow-y-auto rounded-xl border border-amber-100 divide-y divide-amber-50 text-xs font-mono text-slate-600">
                {report.unknown.slice(0, 50).map((k) => <div key={k} className="px-3 py-1.5 truncate">{k}</div>)}
                {report.unknown.length > 50 && <div className="px-3 py-1.5 text-slate-400">…and {report.unknown.length - 50} more</div>}
              </div>
            </div>
          )}
          {!hasErrors && <p className="text-sm text-emerald-600 font-semibold">The file is valid.</p>}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button
            onClick={() => onApply(hasErrors)}
            disabled={busy || report.toWrite + report.toClear === 0}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Importing…' : hasErrors ? `Import ${report.toWrite + report.toClear} valid only` : `Import ${report.toWrite + report.toClear} changes`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TranslationsPage() {
  const [params, setParams] = useSearchParams();
  const [languages, setLanguages] = useState([]);
  const [stats, setStats] = useState({});
  const [namespaces, setNamespaces] = useState(Object.keys(NS_LABELS));
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState({});
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [importReport, setImportReport] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const pendingFile = useRef(null);
  const fileInput = useRef(null);

  const lang = params.get('lang') || '';
  const ns = params.get('ns') || 'customer';
  const debouncedQuery = useDebounced(query);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  };
  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
    setPage(1);
  };

  const loadMeta = useCallback(async () => {
    try {
      const res = await adminAPI.getLanguages();
      const list = res?.data?.languages || [];
      setLanguages(list);
      setStats(Object.fromEntries((res?.data?.stats || []).map((s) => [s.code, s])));
      setNamespaces(res?.data?.namespaces || Object.keys(NS_LABELS));
      if (!params.get('lang') && list.length) {
        const next = new URLSearchParams(params);
        next.set('lang', (list.find((l) => !l.isSystem) || list[0]).code);
        setParams(next, { replace: true });
      }
    } catch (e) {
      showToast('error', e?.response?.data?.message || 'Failed to load languages');
    }
  }, [params, setParams]);

  useEffect(() => { loadMeta(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRows = useCallback(async () => {
    if (!lang) return;
    setLoading(true);
    try {
      const res = await adminAPI.getTranslations({ language: lang, namespace: ns, q: debouncedQuery, missingOnly, page, limit: PAGE_SIZE });
      setData(res?.data || { rows: [], total: 0 });
      setDrafts({});
      setErrors({});
    } catch (e) {
      showToast('error', e?.response?.data?.message || 'Failed to load translations');
    } finally {
      setLoading(false);
    }
  }, [lang, ns, debouncedQuery, missingOnly, page]);

  useEffect(() => { loadRows(); }, [loadRows]);
  useEffect(() => { setPage(1); }, [debouncedQuery, missingOnly]);

  const saveRow = async (row) => {
    const draft = drafts[row.key];
    if (draft === undefined || draft.trim() === row.value) return;
    setSaving((s) => ({ ...s, [row.key]: true }));
    setErrors((e) => ({ ...e, [row.key]: '' }));
    try {
      await adminAPI.saveTranslation({ language: lang, namespace: ns, key: row.key, value: draft });
      setData((d) => ({ ...d, rows: d.rows.map((r) => (r.key === row.key ? { ...r, value: draft.trim(), missing: !draft.trim() } : r)) }));
      setDrafts((d) => { const { [row.key]: _gone, ...rest } = d; return rest; });
      loadMeta();
    } catch (e) {
      setErrors((er) => ({ ...er, [row.key]: e?.response?.data?.message || 'Could not save' }));
    } finally {
      setSaving((s) => ({ ...s, [row.key]: false }));
    }
  };

  const doExport = async () => {
    try {
      const res = await adminAPI.exportTranslations({ language: lang, namespace: ns, includeMissing: true });
      const blob = new Blob([JSON.stringify(res?.data?.data || {}, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `translations-${lang}-${ns}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast('error', e?.response?.data?.message || 'Export failed');
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      pendingFile.current = parsed;
      const res = await adminAPI.importTranslations({ language: lang, namespace: ns, data: parsed, dryRun: true });
      setImportReport(res?.data?.report);
    } catch (err) {
      showToast('error', err instanceof SyntaxError ? 'That file is not valid JSON' : err?.response?.data?.message || 'Could not check the file');
    }
  };

  const applyImport = async (skipInvalid) => {
    setImportBusy(true);
    try {
      const res = await adminAPI.importTranslations({ language: lang, namespace: ns, data: pendingFile.current, skipInvalid });
      showToast('success', `Imported ${res?.data?.report?.applied ?? 0} changes`);
      setImportReport(null);
      pendingFile.current = null;
      loadRows();
      loadMeta();
    } catch (err) {
      showToast('error', err?.response?.data?.message || 'Import failed');
    } finally {
      setImportBusy(false);
    }
  };

  const current = languages.find((l) => l.code === lang);
  const nsStats = stats[lang]?.namespaces?.[ns];
  const pages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6">
      {toast && (
        <div className={`fixed top-6 right-6 z-[60] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl text-sm font-semibold max-w-md ${toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle size={18} className="shrink-0" /> : <AlertTriangle size={18} className="shrink-0" />}
          <span>{toast.msg}</span>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg">
              <FileText className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800">Translations</h1>
              <p className="text-slate-500 text-sm mt-0.5">Edit texts per language. Empty means the English text is shown. <Link to="/admin/food/languages" className="text-indigo-600 font-semibold">Manage languages</Link></p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
            <button onClick={() => fileInput.current?.click()} disabled={!lang} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Upload size={16} /> Import JSON</button>
            <button onClick={doExport} disabled={!lang} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download size={16} /> Export JSON</button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm mb-4 flex flex-col md:flex-row md:items-end gap-4">
          <label className="block md:w-60">
            <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Language</span>
            <select value={lang} onChange={(e) => setParam('lang', e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700">
              {languages.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.nativeName} ({l.name}){l.isEnabled ? '' : ' — disabled'}</option>)}
            </select>
          </label>
          <label className="block flex-1">
            <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Search</span>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search source text or translation" className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none pb-2">
            <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
            <span className="text-sm font-bold text-slate-600">Missing only</span>
          </label>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {namespaces.map((n) => {
            const s = stats[lang]?.namespaces?.[n];
            const done = s && s.total > 0 && s.translated >= s.total;
            return (
              <button key={n} onClick={() => setParam('ns', n)} className={`px-4 py-2 rounded-xl text-sm font-bold border transition ${n === ns ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                {NS_LABELS[n] || n}
                {s && <span className={`ml-2 text-[11px] font-semibold ${n === ns ? 'text-indigo-100' : done ? 'text-emerald-600' : 'text-slate-400'}`}>{s.translated}/{s.total}</span>}
              </button>
            );
          })}
        </div>

        {current?.isSystem && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-4 text-sm text-slate-600">
            English is the source text written in the apps. Only plural forms (and any wording you want to override) are stored for it.
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 px-5 py-3 bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <span>English (source)</span>
            <span className="hidden md:block">{current ? `${current.nativeName}` : 'Translation'}{nsStats ? ` · ${nsStats.translated}/${nsStats.total}` : ''}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="animate-spin" /></div>
          ) : data.rows.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm">{missingOnly ? 'Nothing is missing here.' : 'No texts found.'}</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.rows.map((row) => {
                const value = drafts[row.key] ?? row.value;
                const dirty = drafts[row.key] !== undefined && drafts[row.key].trim() !== row.value;
                return (
                  <div key={row.key} className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 break-words whitespace-pre-wrap">{row.source}</p>
                      {row.plural && <p className="text-[11px] font-mono text-indigo-500 mt-0.5">{row.key.split('_').pop()}</p>}
                      {row.placeholders.length > 0 && (
                        <p className="mt-1 flex flex-wrap gap-1">
                          {row.placeholders.map((p) => <span key={p} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{`{{${p}}}`}</span>)}
                        </p>
                      )}
                    </div>
                    <div className="min-w-0">
                      <textarea
                        rows={Math.min(5, Math.max(1, Math.ceil((value.length || row.source.length) / 42)))}
                        value={value}
                        placeholder={row.source}
                        onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))}
                        onBlur={() => saveRow(row)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }}
                        className={`w-full rounded-xl border px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y ${errors[row.key] ? 'border-red-300 bg-red-50' : row.missing && !dirty ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white'}`}
                      />
                      <div className="flex items-center justify-between mt-1 min-h-[16px]">
                        <span className="text-[11px] text-red-600">{errors[row.key]}</span>
                        <span className="text-[11px] text-slate-400">
                          {saving[row.key] ? 'Saving…' : dirty ? 'Press Enter or click away to save' : row.missing ? 'Not translated' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 text-sm text-slate-500">
            <span>{data.total} texts</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold disabled:opacity-40">Previous</button>
              <span className="font-semibold">{page} / {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      </div>

      {importReport && <ImportModal report={importReport} busy={importBusy} onClose={() => setImportReport(null)} onApply={applyImport} />}
    </div>
  );
}
