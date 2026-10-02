import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { dmbExtraAdminAPI } from "@food/api";

/** Shared building blocks of the Amendment v2 Extra admin pages. */

export const errText = (e, fallback = "Something went wrong") => e?.response?.data?.message || e?.message || fallback;
export const ok = (msg) => toast.success(msg);
export const fail = (e, fallback) => toast.error(errText(e, fallback));

export const fmtDate = (d, opts = { day: "numeric", month: "short", year: "numeric" }) => (d ? new Date(String(d).length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString("en-GB", opts) : "—");
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const money = (n, currency = "PLN") => {
  try {
    return new Intl.NumberFormat("pl-PL", { style: "currency", currency }).format(Number(n) || 0);
  } catch {
    return `${(Number(n) || 0).toFixed(2)} ${currency}`;
  }
};

/** Loads data; `reload()` refetches. `deps` re-run the loader. */
export function useLoad(loader, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loader();
      setData(res.data);
      setError("");
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

/** Runs an action with a busy flag and toasts. */
export function useAction() {
  const [busy, setBusy] = useState("");
  const run = async (key, fn, success) => {
    setBusy(key);
    try {
      const out = await fn();
      if (success) ok(success);
      return out;
    } catch (e) {
      fail(e);
      return null;
    } finally {
      setBusy("");
    }
  };
  return { busy, run };
}

export function Page({ title, subtitle, actions, children }) {
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-1 max-w-3xl">{subtitle}</p>}
        </div>
        {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className = "" }) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-slate-100">
          <div>
            {title && <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Btn({ children, onClick, busy, disabled, variant = "primary", size = "md", type = "button", title }) {
  const v = {
    primary: "bg-emerald-700 text-white hover:bg-emerald-800",
    outline: "border border-slate-300 text-slate-700 bg-white hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  }[variant];
  const s = size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm";
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled || busy} className={`inline-flex items-center gap-1.5 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${v} ${s}`}>
      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  );
}

const BADGE = {
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  blue: "bg-sky-100 text-sky-800",
  gray: "bg-slate-100 text-slate-600",
  violet: "bg-violet-100 text-violet-800",
};
export const Badge = ({ tone = "gray", children }) => <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${BADGE[tone] || BADGE.gray}`}>{children}</span>;

export function Table({ columns, rows, empty = "Nothing to show.", rowKey = (r, i) => r._id || i }) {
  return (
    <div className="overflow-x-auto -mx-5">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 bg-slate-50">
            {columns.map((c) => (
              <th key={c.key || c.label} className={`px-5 py-2.5 font-semibold whitespace-nowrap ${c.right ? "text-right" : ""}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows === null || rows === undefined ? (
            <tr><td colSpan={columns.length} className="px-5 py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-5 py-8 text-center text-slate-400">{empty}</td></tr>
          ) : (
            rows.map((r, i) => (
              <tr key={rowKey(r, i)} className="border-t border-slate-100 align-top">
                {columns.map((c) => (
                  <td key={c.key || c.label} className={`px-5 py-3 ${c.right ? "text-right" : ""} ${c.className || ""}`}>{c.render ? c.render(r) : r[c.key]}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export const inputCls = "w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/30";

export function Field({ label, hint, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>;
}

/** City picker (AdminCity). Empty value = platform-wide. */
export function CitySelect({ value, onChange, allLabel = "All cities (platform default)" }) {
  const [cities, setCities] = useState([]);
  useEffect(() => {
    dmbExtraAdminAPI.cities().then((res) => setCities(res.data?.data?.cities || [])).catch(() => {});
  }, []);
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white">
      <option value="">{allLabel}</option>
      {cities.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
    </select>
  );
}

/** Saves a blob (PDF / CSV) returned by axios. */
export const saveBlob = (res, filename, type = "application/pdf") => {
  const url = URL.createObjectURL(new Blob([res.data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
