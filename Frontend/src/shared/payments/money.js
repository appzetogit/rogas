import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchPaymentMethods } from "./api";

/**
 * Shows amounts in the currency a customer actually pays in.
 *
 * The server decides that currency from the zone (or vendor / phone country) and the platform's default country, exactly
 * as it does when it charges, so what is shown and what is charged can never disagree. `useMoney()` asks once per scope
 * and remembers the answer; until it arrives the last known currency is used, so numbers never flash a wrong symbol twice.
 */

const REMEMBER_KEY = "dmb_display_currency";
const FALLBACK_CURRENCY = "PLN";

const known = new Map(); // scope -> currency
const pending = new Map(); // scope -> Promise<string | null>

const scopeKey = ({ zoneId, vendorId, country, dialCode } = {}) => [zoneId || "", vendorId || "", country || "", dialCode || ""].join("|");
const isDefaultScope = (key) => key === "|||";

const remembered = () => {
  try {
    const v = localStorage.getItem(REMEMBER_KEY);
    return /^[A-Z]{3}$/.test(v || "") ? v : null;
  } catch {
    return null;
  }
};
const remember = (currency) => {
  try {
    localStorage.setItem(REMEMBER_KEY, currency);
  } catch {
    /* private mode: the answer is simply asked for again next visit */
  }
};

const resolveCurrency = (scope, key) => {
  if (known.has(key)) return Promise.resolve(known.get(key));
  if (pending.has(key)) return pending.get(key);
  const request = fetchPaymentMethods(scope)
    .then((data) => {
      const currency = /^[A-Z]{3}$/.test(data?.currency || "") ? data.currency : null;
      if (currency) {
        known.set(key, currency);
        if (isDefaultScope(key)) remember(currency);
      }
      return currency;
    })
    .catch(() => null)
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
};

/** Formats `amount` in `currency` for `language`. Empty or non-numeric input shows a dash. `compact` drops the decimals of whole amounts. */
export const formatMoney = (amount, currency = FALLBACK_CURRENCY, language = "en", { compact = false } = {}) => {
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
  // Whole amounts lose their empty decimals ("12 zł"); anything else keeps the currency's normal ones ("12,50 zł").
  const digits = compact && Number.isInteger(value) ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {};
  for (const locale of [language, "en"]) {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency, ...digits }).format(value);
    } catch {
      /* unknown locale code: try English next */
    }
  }
  return `${value.toFixed(2)} ${currency}`;
};

/** The symbol alone ("zł", "€", "₹"), for an input adornment. */
export const currencySymbol = (currency = FALLBACK_CURRENCY, language = "en") => {
  for (const locale of [language, "en"]) {
    try {
      const part = new Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency");
      if (part) return part.value;
    } catch {
      /* try English next */
    }
  }
  return currency;
};

/**
 * `const { money, currency, symbol } = useMoney({ zoneId })`
 * `money(12.5)` -> "12,50 zł" (Polish) / "PLN 12.50" (English); `money(12, { compact: true })` -> "12 zł" (whole amounts only);
 * `money(12.5, { currency: "EUR" })` forces a currency.
 * Scope is optional: without it the platform's default country decides.
 */
export default function useMoney(scope = {}) {
  const { i18n } = useTranslation("common");
  const key = scopeKey(scope);
  const [currency, setCurrency] = useState(() => known.get(key) || remembered() || FALLBACK_CURRENCY);

  useEffect(() => {
    let cancelled = false;
    resolveCurrency(scope, key).then((resolved) => {
      if (!cancelled && resolved) setCurrency(resolved);
    });
    return () => {
      cancelled = true;
    };
    // `scope` is an object literal on every render; its content is captured by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const language = i18n.language;
  // `options.currency` overrides the scope's currency, for a record that stored the currency it was paid in.
  const money = useCallback(
    (amount, options) => formatMoney(amount, /^[A-Z]{3}$/.test(options?.currency || "") ? options.currency : currency, language, options),
    [currency, language]
  );
  return { money, currency, symbol: currencySymbol(currency, language) };
}
