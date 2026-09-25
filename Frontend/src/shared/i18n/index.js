import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import axios from "axios";

/**
 * Multi-language runtime.
 *
 * - The English text written in the code IS the translation key (t("Save") -> "Save"), so English needs no
 *   resources and any missing translation automatically shows English.
 * - Other languages are downloaded from the backend as versioned bundles and cached in localStorage.
 * - Languages are managed in the admin panel; this file never hardcodes a language list.
 */

export const FALLBACK_LANGUAGE = "en";
export const FRONTEND_NAMESPACES = ["common", "customer", "vendor", "driver", "office"];

const LS_LANG = "app_lang";
const LS_DIRTY = "app_lang_unsynced";
const LS_LANGS = "i18n_languages";
const bundleKey = (code) => `i18n_bundle_${code}`;

const baseURL =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, "")
    : "/api/v1";

const safeGet = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const safeSet = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked: the app still works, it just refetches next time */
  }
};
const safeRemove = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};
const readJson = (key) => {
  try {
    return JSON.parse(safeGet(key));
  } catch {
    return null;
  }
};

// ─── Shared state ────────────────────────────────────────────────────────────

let languageList = readJson(LS_LANGS) || { languages: [], defaultLanguage: FALLBACK_LANGUAGE };
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const getLanguageList = () => languageList;

const isKnown = (code) => code === FALLBACK_LANGUAGE || languageList.languages.some((l) => l.code === code);

const applyDocumentLanguage = (code) => {
  if (typeof document === "undefined") return;
  const meta = languageList.languages.find((l) => l.code === code);
  document.documentElement.setAttribute("lang", code);
  document.documentElement.setAttribute("dir", meta?.direction === "rtl" ? "rtl" : "ltr");
};

// ─── Bundles ─────────────────────────────────────────────────────────────────

// Replace (not merge) each namespace so strings the admin cleared on the server disappear here too.
const addBundle = (code, namespaces) => {
  for (const [ns, map] of Object.entries(namespaces || {})) {
    if (i18n.hasResourceBundle(code, ns)) i18n.removeResourceBundle(code, ns);
    i18n.addResourceBundle(code, ns, map, true, true);
  }
};

const readCachedBundle = (code) => {
  const cached = readJson(bundleKey(code));
  return cached && typeof cached.version === "number" && cached.namespaces ? cached : null;
};

/** Makes sure the bundle for `code` is loaded, refetching only when the server version changed. */
const ensureBundle = async (code, serverVersion) => {
  const cached = readCachedBundle(code);
  const loaded = i18n.hasResourceBundle(code, "common") || Object.keys(i18n.store?.data?.[code] || {}).length > 0;
  if (cached && cached.version === serverVersion) {
    if (!loaded) addBundle(code, cached.namespaces);
    return;
  }
  const { data } = await axios.get(`${baseURL}/i18n/bundle/${code}`, {
    params: { ns: FRONTEND_NAMESPACES.join(","), since: cached?.version },
    timeout: 20000,
  });
  if (data?.notModified && cached) {
    if (!loaded) addBundle(code, cached.namespaces);
    return;
  }
  if (!data?.namespaces) return;
  addBundle(code, data.namespaces);
  safeSet(bundleKey(code), JSON.stringify({ version: data.version, namespaces: data.namespaces }));
};

// ─── Initial language (synchronous, from cache, so there is no flash of English) ─

const cachedInitial = () => {
  const stored = safeGet(LS_LANG);
  if (!stored) return { lng: FALLBACK_LANGUAGE, resources: {} };
  const bundle = stored !== FALLBACK_LANGUAGE ? readCachedBundle(stored) : null;
  const resources = {};
  const en = readCachedBundle(FALLBACK_LANGUAGE);
  if (en) resources[FALLBACK_LANGUAGE] = en.namespaces;
  if (bundle) resources[stored] = bundle.namespaces;
  return { lng: bundle ? stored : FALLBACK_LANGUAGE, resources };
};

const initial = cachedInitial();

i18n.use(initReactI18next).init({
  lng: initial.lng,
  fallbackLng: FALLBACK_LANGUAGE,
  ns: FRONTEND_NAMESPACES,
  defaultNS: "common",
  fallbackNS: "common",
  keySeparator: false,
  nsSeparator: false,
  returnEmptyString: false,
  returnNull: false,
  interpolation: { escapeValue: false },
  resources: initial.resources,
  initAsync: false,
  react: { useSuspense: false, bindI18nStore: "added" },
});
applyDocumentLanguage(initial.lng);

// ─── Public API ──────────────────────────────────────────────────────────────

/** Downloads the admin-managed language list and the active bundles. Safe to call repeatedly. */
export const syncLanguages = async () => {
  try {
    const { data } = await axios.get(`${baseURL}/i18n/languages`, { timeout: 15000 });
    if (!data?.languages) return;
    languageList = { languages: data.languages, defaultLanguage: data.defaultLanguage || FALLBACK_LANGUAGE };
    safeSet(LS_LANGS, JSON.stringify(languageList));

    const stored = safeGet(LS_LANG);
    const wanted = stored && isKnown(stored) ? stored : languageList.defaultLanguage;
    if (stored && !isKnown(stored)) safeRemove(LS_LANG);

    const versionOf = (code) => languageList.languages.find((l) => l.code === code)?.version;
    await Promise.all(
      [FALLBACK_LANGUAGE, wanted]
        .filter((c, i, all) => all.indexOf(c) === i && versionOf(c) !== undefined)
        .map((c) => ensureBundle(c, versionOf(c)).catch(() => {}))
    );

    if (wanted !== i18n.language) await i18n.changeLanguage(wanted);
    applyDocumentLanguage(i18n.language);
  } catch {
    // Offline or backend down: keep whatever is cached; English is always available.
  } finally {
    notify();
  }
};

export const getCurrentLanguage = () => i18n.language || FALLBACK_LANGUAGE;

/**
 * Marks a string constant as translatable without translating it yet (module-level data cannot call a hook).
 * The catalog extractor picks these up; translate where it is displayed: t(item.label).
 */
export const tKey = (text) => text;

const PANEL_TOKENS = {
  user: () => safeGet("user_accessToken") || safeGet("accessToken"),
  restaurant: () => safeGet("restaurant_accessToken"),
  delivery: () => safeGet("delivery_accessToken"),
  office: () => safeGet("office_token"),
};

export const detectPanel = (pathname = typeof window !== "undefined" ? window.location.pathname : "") => {
  const p = String(pathname).toLowerCase();
  if (p.startsWith("/office")) return "office";
  if (p.startsWith("/vendor") || p.startsWith("/restaurant")) return "restaurant";
  if (p.startsWith("/food/delivery") || p.startsWith("/delivery")) return "delivery";
  if (p.startsWith("/admin") || p.startsWith("/food/admin")) return null;
  return "user";
};

const authHeaders = (panel) => {
  const token = PANEL_TOKENS[panel]?.();
  return token ? { Authorization: `Bearer ${token}` } : null;
};

/** Stores the chosen language on the signed-in account so push notifications arrive in it. */
const pushPreference = async (panel, code) => {
  const headers = authHeaders(panel);
  if (!headers) return false;
  try {
    await axios.put(`${baseURL}/i18n/preference`, { language: code }, { headers, timeout: 15000 });
    return true;
  } catch {
    return false;
  }
};

/**
 * Switches the whole app to `code`. Returns once the bundle is ready so the UI never shows a half-translated screen.
 * Also records the choice on the signed-in account (or remembers to do so after the next sign-in).
 */
export const setLanguage = async (code, { panel = detectPanel(), persistToAccount = true } = {}) => {
  const target = String(code || "").toLowerCase();
  const meta = languageList.languages.find((l) => l.code === target);
  if (target !== FALLBACK_LANGUAGE && !meta) throw new Error(`Language "${target}" is not available`);

  if (meta) await ensureBundle(target, meta.version);
  await i18n.changeLanguage(target);
  safeSet(LS_LANG, target);
  applyDocumentLanguage(target);

  if (persistToAccount && panel) {
    const saved = await pushPreference(panel, target);
    if (saved) safeRemove(LS_DIRTY);
    else safeSet(LS_DIRTY, "1");
  } else if (persistToAccount) {
    safeSet(LS_DIRTY, "1");
  }
  notify();
};

const syncedTokens = new Set();

/**
 * After sign-in: adopt the account's saved language, or upload the device's choice if it was picked
 * while signed out. Runs once per panel + token.
 */
export const syncAccountPreference = async (panel = detectPanel()) => {
  if (!panel) return;
  const headers = authHeaders(panel);
  if (!headers) return;
  const marker = `${panel}:${headers.Authorization}`;
  if (syncedTokens.has(marker)) return;
  syncedTokens.add(marker);

  try {
    const { data } = await axios.get(`${baseURL}/i18n/preference`, { headers, timeout: 15000 });
    if (!data?.supported) return;
    const local = safeGet(LS_LANG);
    const unsynced = safeGet(LS_DIRTY) === "1";

    if (local && (unsynced || !data.language)) {
      if (await pushPreference(panel, local)) safeRemove(LS_DIRTY);
    } else if (data.language && data.language !== local && isKnown(data.language)) {
      await setLanguage(data.language, { panel, persistToAccount: false });
    }
  } catch {
    syncedTokens.delete(marker);
  }
};

export default i18n;
