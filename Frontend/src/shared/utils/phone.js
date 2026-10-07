import { SUPPORTED_COUNTRIES } from "@/config/countries";

/**
 * Splits a phone number into its country code and national number using each country's real number length:
 *   "+48 910 959 948" -> { countryCode: "+48", local: "910959948" }
 *   "+918910959948"   -> { countryCode: "+91", local: "8910959948" }
 *   "8910959948"      -> { countryCode: "+91", local: "8910959948" }  (10 digits with no code: India)
 * Never cuts digits off the end or the start. Taking "the last 10 digits" turned the Polish +48 910959948 into the
 * Indian 8910959948 (the "8" of the country code ended up in the number).
 * countryCode is null when nothing matches.
 */
const BY_CODE_LENGTH_DESC = [...SUPPORTED_COUNTRIES].sort(
  (a, b) => b.code.replace(/\D/g, "").length - a.code.replace(/\D/g, "").length
);

export const splitPhone = (phone) => {
  const digits = String(phone ?? "").replace(/\D/g, "");
  for (const c of BY_CODE_LENGTH_DESC) {
    const codeDigits = c.code.replace(/\D/g, "");
    if (digits.startsWith(codeDigits) && digits.length - codeDigits.length === c.phoneLength) {
      return { countryCode: c.code, local: digits.slice(codeDigits.length), digits };
    }
  }
  if (digits.length === 10) return { countryCode: "+91", local: digits, digits };
  return { countryCode: null, local: digits, digits };
};

/** "+48 910959948", or the text unchanged when the number has no recognisable country code. */
export const formatPhone = (phone) => {
  const { countryCode, local } = splitPhone(phone);
  return countryCode && local ? `${countryCode} ${local}` : String(phone ?? "");
};
