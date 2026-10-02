import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { dmbLegalAPI } from "../../services/api";
import { getCurrentLanguage } from "../i18n";

/**
 * Gap AC — blocking re-acceptance screen. When an admin publishes a new version of a legal document with
 * "Requires re-acceptance" (or the Cook Agreement for Track 1 cooks, which is always required), the signed-in user sees
 * this once and cannot use the app until they accept. Acceptance is logged on the server with version and timestamp.
 *
 *   <LegalAcceptanceGate panel="user" enabled={isLoggedIn} />
 */
export default function LegalAcceptanceGate({ panel, enabled = true }) {
  const { t } = useTranslation("common");
  const api = dmbLegalAPI[panel];
  const [pending, setPending] = useState([]);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!enabled || !api) return;
    api
      .pending(getCurrentLanguage())
      .then((res) => setPending(res.data?.pending || []))
      .catch(() => { /* never lock someone out because the check itself failed */ });
  }, [api, enabled]);

  useEffect(() => {
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  if (!enabled || !pending.length) return null;
  const doc = pending[0];

  const accept = async () => {
    setSaving(true);
    setError("");
    try {
      await api.accept({ docType: doc.docType, version: doc.version, language: doc.language || getCurrentLanguage() });
      setAgreed(false);
      setPending((list) => list.slice(1));
    } catch (err) {
      setError(err?.response?.data?.message || t("Could not save your acceptance. Please try again."));
      if (err?.response?.data?.code === "VERSION_CHANGED") load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="legal-gate-title">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="px-6 pt-6 pb-3 border-b border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            {t("Updated document · version {{version}}", { version: doc.version })}
          </p>
          <h2 id="legal-gate-title" className="text-lg font-bold text-gray-900 mt-1">{doc.title || doc.label}</h2>
          {doc.effectiveDate && (
            <p className="text-xs text-gray-500 mt-1">
              {t("Effective from {{date}}", { date: new Date(doc.effectiveDate).toLocaleDateString(getCurrentLanguage()) })}
            </p>
          )}
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {doc.body || t("Please read the full document before accepting.")}
          {doc.contentUrl && (
            <p className="mt-4">
              <a href={doc.contentUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-semibold underline">
                {t("Open the full document")}
              </a>
            </p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 space-y-3">
          <label className="flex items-start gap-3 text-sm text-gray-800 cursor-pointer">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-700" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>{t("I have read and accept this document")}</span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            disabled={!agreed || saving}
            onClick={accept}
            className="w-full py-3 rounded-xl font-bold text-white bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? t("Saving…") : pending.length > 1 ? t("Accept and continue ({{n}} more)", { n: pending.length - 1 }) : t("Accept and continue")}
          </button>
        </div>
      </div>
    </div>
  );
}
