import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload } from "lucide-react";
import { dmbExtraVendorAPI } from "../../../../services/api/index";

/** Shared pieces of the Amendment v2 Extra vendor screens. */

export const errorText = (err, fallback = "") => err?.response?.data?.message || err?.message || fallback;

export const WEEK = [1, 2, 3, 4, 5, 6, 0];

export function useDayNames() {
  const { t: tr } = useTranslation("vendor");
  return { 0: tr("Sun"), 1: tr("Mon"), 2: tr("Tue"), 3: tr("Wed"), 4: tr("Thu"), 5: tr("Fri"), 6: tr("Sat") };
}

export function Card({ title, subtitle, right, children, className = "" }) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 md:p-5 space-y-3 ${className}`}>
      {(title || right) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-extrabold text-slate-900">{title}</h2>}
            {subtitle && <p className="text-[12px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
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

export function Button({ children, onClick, disabled, busy, variant = "primary", className = "", type = "button" }) {
  const styles = {
    primary: "bg-[#00604c] text-white hover:bg-[#004d3d]",
    outline: "border border-[#00604c] text-[#00604c] bg-white hover:bg-emerald-50",
    danger: "border border-red-300 text-red-700 bg-white hover:bg-red-50",
    ghost: "text-slate-600 hover:bg-slate-100",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {busy && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="w-8 h-8 border-4 border-[#00604c] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function Chip({ active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[12px] font-bold border ${active ? "bg-[#00604c] text-white border-[#00604c]" : "bg-white text-slate-800 border-slate-200"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}

/** Uploads an image (or a PDF with `pdf`) and hands back its URL. */
export function UploadButton({ onUploaded, pdf = false, label, folder = "vendor", accept }) {
  const { t: tr } = useTranslation("vendor");
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return setError(tr("The file is too large (max 10 MB)"));
    setBusy(true);
    setError("");
    try {
      const isPdf = pdf && /pdf$/i.test(file.type || file.name);
      const res = isPdf ? await dmbExtraVendorAPI.uploadFile(file, folder) : await dmbExtraVendorAPI.uploadImage(file, folder);
      const url = res.data?.data?.url;
      if (!url) throw new Error(tr("Upload failed"));
      onUploaded(url);
    } catch (err) {
      setError(errorText(err, tr("Upload failed")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1">
      <input ref={input} type="file" className="hidden" accept={accept || (pdf ? "image/*,application/pdf" : "image/*")} onChange={pick} />
      <Button variant="outline" busy={busy} onClick={() => input.current?.click()}>
        <Upload size={15} /> {label || tr("Upload")}
      </Button>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

/** Saves a blob response (PDF download) under a file name. */
export const saveBlob = (res, filename) => {
  const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
