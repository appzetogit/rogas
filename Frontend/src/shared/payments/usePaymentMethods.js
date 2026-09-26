import { useEffect, useState } from "react";
import { fetchPaymentMethods } from "./api";

/**
 * The payment providers a customer may use, decided by the server from their country (zone or phone code) and the
 * admin's Payments settings. `selected` is what the customer picked (the first provider until they choose).
 */
export default function usePaymentMethods({ zoneId, vendorId, country, dialCode, enabled = true } = {}) {
  const [state, setState] = useState({ loading: enabled, providers: [], currency: null, country: null, mock: false, error: null });
  const [chosen, setChosen] = useState("");

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchPaymentMethods({ zoneId, vendorId, country, dialCode })
      .then((data) => {
        if (cancelled) return;
        setState({ loading: false, providers: data.providers || [], currency: data.currency, country: data.country, mock: Boolean(data.mock), error: null });
        setChosen((prev) => ((data.providers || []).some((p) => p.id === prev) ? prev : data.providers?.[0]?.id || ""));
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, providers: [], currency: null, country: null, mock: false, error: err });
      });
    return () => {
      cancelled = true;
    };
  }, [zoneId, vendorId, country, dialCode, enabled]);

  return { ...state, selected: chosen, setSelected: setChosen };
}
