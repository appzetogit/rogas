import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import usePlatformConfig from "../platform/usePlatformConfig";
import { getAnalyticsConsent, initAnalytics, setAnalyticsConsent, trackPageView } from "../analytics/ga4";

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
  return (
    <div className="fixed bottom-24 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-[900] bg-white border border-gray-200 rounded-2xl shadow-xl p-4" role="dialog" aria-label={t("Cookie settings")}>
      <p className="text-sm font-bold text-gray-900">{t("Help us improve the app")}</p>
      <p className="text-xs text-gray-600 mt-1">
        {t("We would like to use Google Analytics cookies to understand how the app is used. No advertising, and you can change this any time in your profile.")}
      </p>
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={() => setAnalyticsConsent("denied")} className="flex-1 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700">
          {t("Reject")}
        </button>
        <button type="button" onClick={() => setAnalyticsConsent("granted")} className="flex-1 py-2 rounded-xl bg-emerald-700 text-white text-sm font-semibold">
          {t("Accept")}
        </button>
      </div>
    </div>
  );
}
