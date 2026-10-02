import { useEffect, useState, useCallback } from "react";
import { API_BASE_URL } from "../../services/api/config";

/**
 * Admin-controlled feature switches (ACM-131..183), the web-app equivalent of Firebase Remote Config.
 * The server publishes them at GET /dmb/config (per city, with an ETag). Every panel shares one cache that is refreshed
 * every `refreshSeconds` (5 min), when the tab regains focus, and when the delivery zone changes, so an admin change
 * reaches open apps within minutes without a release.
 */
const cache = new Map(); // zoneKey -> { config, etag, at, promise }
const listeners = new Set();
const FALLBACK_REFRESH_MS = 5 * 60 * 1000;

const zoneKeyOf = (zoneId) => String(zoneId || localStorage.getItem("userZoneId") || "");

export const fetchPlatformConfig = async (zoneId, { force = false } = {}) => {
  const key = zoneKeyOf(zoneId);
  const entry = cache.get(key) || {};
  const maxAge = (entry.config?.refreshSeconds || 300) * 1000;
  if (!force && entry.config && Date.now() - entry.at < maxAge) return entry.config;
  if (entry.promise) return entry.promise;
  const url = `${API_BASE_URL}/dmb/config${key ? `?zoneId=${encodeURIComponent(key)}` : ""}`;
  const promise = fetch(url, { headers: entry.etag ? { "If-None-Match": entry.etag } : {} })
    .then(async (res) => {
      if (res.status === 304 && entry.config) {
        cache.set(key, { ...entry, at: Date.now(), promise: null });
        return entry.config;
      }
      const body = await res.json();
      if (!res.ok || !body?.config) throw new Error(body?.message || "Could not load app settings");
      cache.set(key, { config: body.config, etag: res.headers.get("ETag"), at: Date.now(), promise: null });
      if (!entry.config || entry.config.version !== body.config.version) listeners.forEach((fn) => fn(key));
      return body.config;
    })
    .catch((err) => {
      cache.set(key, { ...entry, promise: null });
      if (entry.config) return entry.config; // keep serving the last good copy
      throw err;
    });
  cache.set(key, { ...entry, promise });
  return promise;
};

/** A control's value object, e.g. get("annualPlan") → { enabled, discountPct }. */
export const controlOf = (config, key) => config?.controls?.[key] || {};
export const isControlOn = (config, key) => Boolean(controlOf(config, key).enabled);

export default function usePlatformConfig(zoneId) {
  const key = zoneKeyOf(zoneId);
  const [config, setConfig] = useState(() => cache.get(key)?.config || null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = (force) =>
      fetchPlatformConfig(zoneId, { force })
        .then((c) => alive && (setConfig(c), setError(null)))
        .catch((e) => alive && setError(e));
    load(false);
    const onChange = (changedKey) => changedKey === key && load(false);
    listeners.add(onChange);
    const refreshMs = (cache.get(key)?.config?.refreshSeconds || 300) * 1000 || FALLBACK_REFRESH_MS;
    const timer = setInterval(() => load(true), refreshMs);
    const onFocus = () => document.visibilityState !== "hidden" && load(false);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      alive = false;
      listeners.delete(onChange);
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [key, zoneId]);

  const get = useCallback((k) => controlOf(config, k), [config]);
  const isOn = useCallback((k) => isControlOn(config, k), [config]);
  return { config, loading: !config && !error, error, get, isOn, timezone: config?.timezone || "Europe/Warsaw" };
}
