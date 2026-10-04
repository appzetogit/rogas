import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import usePlatformConfig from "../platform/usePlatformConfig";
import { getAnalyticsConsent, getCookiePrefs, initAnalytics, setAnalyticsConsent, setCookiePrefs, trackPageView } from "../analytics/ga4";

/**
 * Cookie banner + GA4 loader for the web customer app (Gap H, ACM-154). Shown only when the admin has enabled Google
 * Analytics and the customer has not decided yet. Also reports page views on every route change.
 */
export default function AnalyticsConsent() {
  const { t } = useTranslation("common");
  const { get } = usePlatformConfig();
  const ga = get("googleAnalytics");
  const location = useLocation();
  const [consent, setConsent] = useState(getAnalyticsConsent);
  const [managing, setManaging] = useState(false);
  const [draft, setDraft] = useState({ analytics: false, marketing: false });

  useEffect(() => {
    const onChange = (e) => setConsent(e.detail);
    window.addEventListener("dmb:analytics-consent", onChange);
    return () => window.removeEventListener("dmb:analytics-consent", onChange);
  }, []);

  const active = Boolean(ga?.enabled && ga?.measurementId);
  useEffect(() => {
    if (active && consent === "granted") initAnalytics(ga);
  }, [active, consent, ga]);

  useEffect(() => {
    if (active && consent === "granted") trackPageView(location.pathname);
  }, [active, consent, location.pathname]);

  if (!active || consent === "granted" || consent === "denied") return null;

  if (managing) {
    const rows = [
      { key: "essential", title: t("Essential"), text: t("Needed for the app to work (sign-in, checkout). Always on."), locked: true },
      { key: "analytics", title: t("Analytics"), text: t("Anonymous usage statistics (Google Analytics) that help us improve the app.") },
      { key: "marketing", title: t("Marketing"), text: t("Personalised offers and campaign measurement.") },
    ];
    return (
      <div className="fixed inset-0 z-[950] flex items-end md:items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label={t("Cookie settings")}>
        <div className="w-full md:max-w-md bg-white rounded-t-3xl md:rounded-2xl shadow-2xl p-5 max-h-[90vh] overflow-y-auto">
          <p className="text-base font-extrabold text-gray-900">{t("Manage cookie preferences")}</p>
          <div className="mt-3 space-y-3">
            {rows.map((r) => (
              <label key={r.key} className="flex items-start justify-between gap-3 border border-gray-200 rounded-xl p-3">
                <span>
                  <span className="block text-sm font-bold text-gray-900">{r.title}</span>
                  <span className="block text-xs text-gray-600 mt-0.5">{r.text}</span>
                </span>
                <input
                  type="checkbox"
                  checked={r.locked ? true : Boolean(draft[r.key])}
                  disabled={r.locked}
                  onChange={(e) => setDraft((d) => ({ ...d, [r.key]: e.target.checked }))}
                  className="mt-1 w-5 h-5 accent-emerald-700 shrink-0"
                />
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={() => setManaging(false)} className="flex-1 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700">
              {t("Back")}
            </button>
            <button type="button" onClick={() => setCookiePrefs(draft)} className="flex-1 py-2 rounded-xl bg-emerald-700 text-white text-sm font-semibold">
              {t("Save preferences")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-24 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-[900] bg-white border border-gray-200 rounded-2xl shadow-xl p-4" role="dialog" aria-label={t("Cookie settings")}>
      <p className="text-sm font-bold text-gray-900">{t("Help us improve the app")}</p>
      <p className="text-xs text-gray-600 mt-1">
        {t("We would like to use Google Analytics cookies to understand how the app is used. No advertising, and you can change this any time in your profile.")}
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <button type="button" onClick={() => setCookiePrefs({ analytics: false, marketing: false })} className="flex-1 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700">
          {t("Reject non-essential")}
        </button>
        <button type="button" onClick={() => { setDraft({ analytics: Boolean(getCookiePrefs()?.analytics), marketing: Boolean(getCookiePrefs()?.marketing) }); setManaging(true); }} className="flex-1 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700">
          {t("Manage preferences")}
        </button>
        <button type="button" onClick={() => setCookiePrefs({ analytics: true, marketing: true })} className="basis-full py-2 rounded-xl bg-emerald-700 text-white text-sm font-semibold">
          {t("Accept all")}
        </button>
      </div>
    </div>
  );
}
