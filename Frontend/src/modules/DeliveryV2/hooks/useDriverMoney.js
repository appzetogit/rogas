import { useEffect, useState } from "react";
import useMoney from "@/shared/payments/money";
import { deliveryAPI } from "@food/api";

let knownDialCode = null;

/**
 * `useMoney()` for the driver app: amounts are shown in the currency of the driver's own country (from the dial code of
 * their account), not the platform's default country. Same shape as `useMoney`.
 */
export default function useDriverMoney() {
  const [dialCode, setDialCode] = useState(knownDialCode || undefined);
  useEffect(() => {
    if (knownDialCode) return undefined;
    let alive = true;
    deliveryAPI
      .getProfile()
      .then((res) => {
        const code = res?.data?.data?.profile?.countryCode;
        if (!code) return;
        knownDialCode = code;
        if (alive) setDialCode(code);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return useMoney({ dialCode });
}
