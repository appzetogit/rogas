import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Reads the outcome the payment return page hands back (?payment=success&purpose=...&tx=...), reports it once through
 * `onResult({ status, purpose, tx })` and removes it from the address bar so a refresh does not repeat the message.
 */
export default function usePaymentResult(onResult) {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const handler = useRef(onResult);
  handler.current = onResult;

  useEffect(() => {
    const params = new URLSearchParams(search);
    const status = params.get("payment");
    if (!status) return;
    const result = { status, purpose: params.get("purpose") || "", tx: params.get("tx") || "" };
    ["payment", "purpose", "tx"].forEach((k) => params.delete(k));
    const rest = params.toString();
    navigate(`${pathname}${rest ? `?${rest}` : ""}${hash}`, { replace: true });
    handler.current?.(result);
  }, [pathname, search, hash, navigate]);
}
