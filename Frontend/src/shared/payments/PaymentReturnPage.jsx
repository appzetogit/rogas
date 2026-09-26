import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchPaymentStatus } from "./api";

const POLL_MS = 2000;
const MAX_WAIT_MS = 120000; // after this we stop asking and tell the customer we will keep confirming in the background
const FINISHING_MAX_MS = 30000; // paid but not delivered yet: how long to wait before continuing anyway

/** Where the payment result is handed to the app: /some/path?payment=success&purpose=subscription&tx=PAY-... */
const withResult = (path, params) => {
  try {
    const url = new URL(path || "/", window.location.origin);
    Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return path || "/";
  }
};

/**
 * Landing page after a hosted payment (Przelewy24, Stripe). The provider's webhook is what settles the payment; this page
 * only reports the outcome, asking the server (which in turn asks the provider) until it is known.
 */
export default function PaymentReturnPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tx = params.get("tx") || "";
  const token = params.get("t") || "";
  const cancelledByCustomer = params.get("cancelled") === "1";

  const [status, setStatus] = useState(null); // last status payload from the server
  const [error, setError] = useState(false);
  const [idle, setIdle] = useState(null); // why we stopped asking: "cancelled" | "slow"
  const startedAt = useRef(Date.now());
  const paidAt = useRef(0);
  const timer = useRef(null);
  const redirected = useRef(false);

  const finish = useCallback(
    (s) => {
      if (redirected.current) return;
      redirected.current = true;
      navigate(withResult(s.returnPath || "/", { payment: "success", purpose: s.purpose, tx: s.transactionId }), { replace: true });
    },
    [navigate]
  );

  const check = useCallback(async () => {
    if (!tx || !token) return;
    try {
      const s = await fetchPaymentStatus(tx, token);
      setError(false);
      setStatus(s);
      if (s.status === "paid") {
        paidAt.current = paidAt.current || Date.now();
        // Wait (briefly) until what was paid for has been delivered so the next screen already shows it.
        if (s.fulfilled || Date.now() - paidAt.current > FINISHING_MAX_MS) {
          timer.current = setTimeout(() => finish(s), 1200);
          return;
        }
      } else if (s.status !== "pending") {
        return; // failed / expired / cancelled: stop
      } else if (cancelledByCustomer && Date.now() - startedAt.current > 8000) {
        setIdle("cancelled"); // came back via "cancel" and nothing was paid
        return;
      } else if (Date.now() - startedAt.current > MAX_WAIT_MS) {
        setIdle("slow");
        return;
      }
    } catch (err) {
      if (err?.response?.status === 404) {
        setError(true);
        return;
      }
      // Network hiccup: keep trying until the wait limit.
      if (Date.now() - startedAt.current > MAX_WAIT_MS) {
        setIdle("slow");
        return;
      }
    }
    timer.current = setTimeout(check, POLL_MS);
  }, [tx, token, cancelledByCustomer, finish]);

  useEffect(() => {
    check();
    return () => clearTimeout(timer.current);
  }, [check]);

  const retry = () => {
    clearTimeout(timer.current);
    startedAt.current = Date.now();
    setIdle(null);
    check();
  };

  const stop = status?.status;
  const invalid = !tx || !token || error;
  let view = "waiting";
  if (invalid) view = "invalid";
  else if (stop === "paid") view = "paid";
  else if (stop === "failed" || stop === "expired" || stop === "cancelled") view = "failed";
  else if (idle === "cancelled") view = "cancelled";
  else if (idle === "slow") view = "slow";

  const goBack = () => navigate(withResult(status?.cancelPath || "/", {}), { replace: true });
  const goOn = () => (status ? finish(status) : navigate("/", { replace: true }));

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F5F0] px-4 py-10" aria-live="polite">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-lg">
        {view === "waiting" && (
          <>
            <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" aria-hidden="true" />
            <h1 className="text-xl font-extrabold text-[#1b1c1c]">{t("Confirming your payment...")}</h1>
            <p className="mt-2 text-sm text-[#6e7a74]">{t("Please wait, this usually takes a few seconds. Do not close this page.")}</p>
          </>
        )}

        {view === "paid" && (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700" aria-hidden="true">✓</div>
            <h1 className="text-xl font-extrabold text-[#1b1c1c]">{t("Payment received")}</h1>
            <p className="mt-2 text-sm text-[#6e7a74]">
              {status?.fulfilled ? t("Thank you! Taking you back to the app...") : t("Thank you! We are finishing your order...")}
            </p>
            <button type="button" onClick={goOn} className="mt-6 w-full rounded-2xl bg-primary px-4 py-3 font-bold text-white">
              {t("Continue")}
            </button>
          </>
        )}

        {(view === "failed" || view === "cancelled") && (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-3xl text-red-700" aria-hidden="true">!</div>
            <h1 className="text-xl font-extrabold text-[#1b1c1c]">
              {view === "cancelled" || stop === "cancelled" ? t("Payment cancelled") : stop === "expired" ? t("Payment expired") : t("Payment failed")}
            </h1>
            <p className="mt-2 text-sm text-[#6e7a74]">{t("You have not been charged. You can try again.")}</p>
            <button type="button" onClick={goBack} className="mt-6 w-full rounded-2xl bg-primary px-4 py-3 font-bold text-white">
              {t("Try again")}
            </button>
          </>
        )}

        {view === "slow" && (
          <>
            <h1 className="text-xl font-extrabold text-[#1b1c1c]">{t("Still waiting for confirmation")}</h1>
            <p className="mt-2 text-sm text-[#6e7a74]">{t("If you have already paid, your order will be confirmed automatically in a few minutes.")}</p>
            <button type="button" onClick={retry} className="mt-6 w-full rounded-2xl bg-primary px-4 py-3 font-bold text-white">
              {t("Check again")}
            </button>
            <button type="button" onClick={goBack} className="mt-3 w-full rounded-2xl border border-gray-300 px-4 py-3 font-bold text-gray-700">
              {t("Back to the app")}
            </button>
          </>
        )}

        {view === "invalid" && (
          <>
            <h1 className="text-xl font-extrabold text-[#1b1c1c]">{t("We could not find this payment")}</h1>
            <p className="mt-2 text-sm text-[#6e7a74]">{t("The link may be incorrect or expired.")}</p>
            <button type="button" onClick={() => navigate("/", { replace: true })} className="mt-6 w-full rounded-2xl bg-primary px-4 py-3 font-bold text-white">
              {t("Back to the app")}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
