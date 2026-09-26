import { useTranslation } from "react-i18next";
import { usePantryCart } from "./PantryCartContext";
import usePaymentResult from "../../../shared/payments/usePaymentResult";

/**
 * Picks up the result the payment return page hands back after a hosted payment (Przelewy24 / Stripe) and does what the
 * in-page pop-up flow used to do on success: confirm the subscription, clear the pantry cart, show a message.
 * Must be rendered inside PantryCartProvider.
 */
export default function PaymentResultHandler({ showToast, onSubscriptionPaid }) {
  const { t } = useTranslation("customer");
  const { clearCart } = usePantryCart();

  usePaymentResult(({ status, purpose }) => {
    if (status !== "success") return;
    if (purpose === "subscription") {
      onSubscriptionPaid?.();
    } else if (purpose === "pantry") {
      clearCart();
      showToast?.(t("Payment successful! Your orders are placed."));
    } else if (purpose === "wallet_topup") {
      showToast?.(t("Wallet top-up successful!"));
    } else if (purpose === "tip") {
      showToast?.(t("Tip payment verified and credited!"));
    }
  });

  return null;
}
