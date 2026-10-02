import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

/** Small shared pieces for the Amendment v2 Extra customer screens (same look as the rest of the app). */

export const errorText = (err, fallback = "") => err?.response?.data?.message || err?.message || fallback;
export const errorCode = (err) => err?.response?.data?.code || "";

/** Weekdays in display order (Mon first), as JS day numbers (0 = Sunday) — what the server stores. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0];

export function useDayNames() {
  const { t } = useTranslation("customer");
  const short = { 0: t("Sun"), 1: t("Mon"), 2: t("Tue"), 3: t("Wed"), 4: t("Thu"), 5: t("Fri"), 6: t("Sat") };
  const long = { 0: t("Sunday"), 1: t("Monday"), 2: t("Tuesday"), 3: t("Wednesday"), 4: t("Thursday"), 5: t("Friday"), 6: t("Saturday") };
  return { short, long };
}

export function ScreenHeader({ title, onBack, right = null }) {
  const { t } = useTranslation("customer");
  return (
    <header className="sticky top-0 z-40 bg-white flex justify-between items-center px-5 h-14 shadow-xs border-b border-[#bec9c3]/20">
      <button onClick={onBack} aria-label={t("Go back")} className="text-primary w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 active:scale-95">
        <ArrowLeft size={22} />
      </button>
      <h1 className="text-[17px] font-extrabold text-[#1b1c1c] text-center truncate px-2">{title}</h1>
      <div className="w-8 flex justify-end">{right}</div>
    </header>
  );
}

export function Section({ title, hint, children, className = "" }) {
  return (
    <section className={`space-y-2.5 ${className}`}>
      {title && <h3 className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-widest">{title}</h3>}
      {hint && <p className="text-[12px] text-[#6e7a74] -mt-1">{hint}</p>}
      {children}
    </section>
  );
}

export function Chip({ active, disabled, onClick, children, title }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition-all ${
        active ? "bg-[#1F7A63] text-white border-[#1F7A63]" : "bg-white text-[#1b1c1c] border-[#e4e2e1] hover:border-primary/40"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "active:scale-95"}`}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={`flex items-center gap-3 bg-white border border-[#e4e2e1] rounded-xl p-3 ${disabled ? "opacity-50" : "cursor-pointer hover:border-primary/40"}`}>
      <div className="flex-1 min-w-0">
        <p className="font-extrabold text-[13px] text-[#1b1c1c]">{label}</p>
        {hint && <p className="text-[11px] text-[#6e7a74] mt-0.5">{hint}</p>}
      </div>
      <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-primary" : "bg-[#e4e2e1]"}`}>
        <input type="checkbox" className="sr-only" checked={Boolean(checked)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </span>
    </label>
  );
}

export function Spinner({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <div className="w-9 h-9 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      {label && <p className="text-[13px] text-[#6e7a74]">{label}</p>}
    </div>
  );
}

export function Notice({ tone = "info", children }) {
  const tones = {
    info: "bg-sky-50 border-sky-200 text-sky-900",
    warn: "bg-amber-50 border-amber-200 text-amber-900",
    error: "bg-red-50 border-red-200 text-red-800",
    success: "bg-emerald-50 border-emerald-200 text-emerald-900",
  };
  return <div className={`rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-relaxed ${tones[tone] || tones.info}`}>{children}</div>;
}

export function PrimaryButton({ children, disabled, onClick, busy, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`w-full bg-[#1F7A63] disabled:opacity-50 text-white font-extrabold py-3.5 rounded-2xl text-[14px] shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${className}`}
    >
      {busy && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  );
}

/** Weekday chips. `allowed` limits which days can be picked (e.g. weekend closed by the admin, ACM-177). */
export function DayPicker({ value = [], onChange, allowed = WEEK }) {
  const { short } = useDayNames();
  const toggle = (d) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => WEEK.indexOf(a) - WEEK.indexOf(b)));
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEK.map((d) => (
        <Chip key={d} active={value.includes(d)} disabled={!allowed.includes(d)} onClick={() => toggle(d)}>
          {short[d]}
        </Chip>
      ))}
    </div>
  );
}

/** Hot / cold label (Gap AL). */
export function TemperatureBadge({ type }) {
  const { t } = useTranslation("customer");
  if (type === "hot") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">{t("🔥 Hot")}</span>;
  if (type === "cold") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">{t("❄️ Cold – reheat")}</span>;
  return null;
}
