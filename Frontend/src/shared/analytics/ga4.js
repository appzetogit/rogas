/**
 * Gap H / ACM-154 — Google Analytics 4 for the web customer app.
 * The measurement ID comes from the server-held controls (the web app's Remote Config), so the Web Manager can switch it
 * on, off or to another property without a release. Nothing is loaded until the customer accepts analytics cookies
 * (GDPR / ePrivacy): Consent Mode starts as "denied" and the gtag script is only injected after consent.
 * Events (SOP): page_view, checkout_began, slot_selected, subscription_started.
 */
const CONSENT_KEY = "dmb_analytics_consent"; // "granted" | "denied"
const ID_RE = /^G-[A-Z0-9]{4,20}$/;
let loadedId = null;

const readConsent = () => {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
};

export const getAnalyticsConsent = () => readConsent();

export const setAnalyticsConsent = (value) => {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    /* storage blocked: consent lasts for this page only */
  }
  if (typeof window.gtag === "function") {
    window.gtag("consent", "update", { analytics_storage: value === "granted" ? "granted" : "denied" });
  }
  window.dispatchEvent(new CustomEvent("dmb:analytics-consent", { detail: value }));
};

/** Loads GA4 when the control is on, the ID is valid and the customer consented. Safe to call repeatedly. */
export const initAnalytics = (gaControl) => {
  const id = String(gaControl?.measurementId || "").trim().toUpperCase();
  if (!gaControl?.enabled || !ID_RE.test(id) || readConsent() !== "granted") return false;
  if (loadedId === id) return true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  window.gtag("consent", "update", { analytics_storage: "granted" });
  window.gtag("js", new Date());
  // Page views are sent by the router hook below (single-page app), not automatically.
  window.gtag("config", id, { send_page_view: false, anonymize_ip: true });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
  loadedId = id;
  return true;
};

export const analyticsActive = () => Boolean(loadedId) && readConsent() === "granted";

export const trackEvent = (name, params = {}) => {
  if (!analyticsActive() || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
};

export const trackPageView = (path) => trackEvent("page_view", { page_path: path, page_location: window.location.href, page_title: document.title });
