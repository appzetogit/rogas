import axios from "axios";
import { apiBaseURL, getPanelAuthHeaders, getCurrentLanguage } from "../i18n";

/**
 * Payments client shared by every panel. The public endpoints (methods, status) need no login: the status page is opened
 * by a payment provider redirect and is authorised by the token in its URL.
 */

export const fetchPaymentMethods = async ({ zoneId, vendorId, country, dialCode } = {}) => {
  const { data } = await axios.get(`${apiBaseURL}/payments/methods`, {
    params: { zoneId: zoneId || undefined, vendorId: vendorId || undefined, country: country || undefined, dialCode: dialCode || undefined },
    timeout: 15000,
  });
  return data;
};

export const fetchPaymentStatus = async (transactionId, token) => {
  const { data } = await axios.get(`${apiBaseURL}/payments/${encodeURIComponent(transactionId)}/status`, {
    params: { t: token },
    timeout: 15000,
  });
  return data;
};

const authed = (panel) => {
  const headers = getPanelAuthHeaders(panel);
  if (!headers) throw new Error("Please sign in again to continue.");
  return { headers, timeout: 20000 };
};

/** Razorpay pop-up finished: the server verifies the signature and the payment itself. */
export const confirmRazorpay = async (transactionId, razorpayResponse, panel) => {
  const { data } = await axios.post(`${apiBaseURL}/payments/${encodeURIComponent(transactionId)}/razorpay-confirm`, razorpayResponse, authed(panel));
  return data;
};

/** Development-only instant payment (the server refuses this unless mock mode is on). */
export const confirmMock = async (transactionId, panel) => {
  const { data } = await axios.post(`${apiBaseURL}/payments/${encodeURIComponent(transactionId)}/mock-confirm`, {}, authed(panel));
  return data;
};

/** Options every "start payment" request carries so the provider page and return page match the app. */
export const paymentRequestExtras = ({ provider, zoneId, returnPath, cancelPath } = {}) => ({
  provider: provider || undefined,
  zoneId: zoneId || undefined,
  returnPath,
  cancelPath,
  language: getCurrentLanguage(),
});

/**
 * Continues a payment the server has just started. Hosted providers (Przelewy24, Stripe) take the whole page over;
 * for Razorpay the caller opens its own pop-up, so this returns { redirected: false }.
 */
export const continueHostedPayment = async (payment, { panel } = {}) => {
  const action = payment?.action;
  if (action?.type === "redirect" && action.url) {
    window.location.assign(action.url);
    return { redirected: true };
  }
  if (action?.type === "mock") {
    await confirmMock(payment.transactionId, panel);
    window.location.assign(`/payment/return?tx=${encodeURIComponent(payment.transactionId)}&t=${encodeURIComponent(payment.statusToken)}`);
    return { redirected: true };
  }
  return { redirected: false };
};

/** Human message from a failed "start payment" request. */
export const paymentErrorMessage = (err, fallback) => err?.response?.data?.message || err?.message || fallback;
