/**
 * One place that understands phone numbers: which country code a number carries and which digits are the national
 * number. Everything that looks a person up by phone (customer, vendor, driver, office employee) goes through here, so
 * "+48 910 959 948" (Poland, 9 digits) is never mistaken for "+91 89109 59948" (India, 10 digits): taking "the last 10
 * digits" of 48910959948 gives 8910959948, which pulled the "8" of the country code into the number.
 */

// Dial code -> expected length of the national number.
export const DIAL_CODE_LENGTHS = {
    "1": 10, "7": 10, "20": 10, "27": 9, "30": 10, "31": 9, "32": 9, "33": 9, "34": 9, "351": 9,
    "352": 9, "353": 9, "354": 7, "355": 9, "356": 8, "357": 8, "358": 9, "359": 9, "36": 9,
    "370": 8, "371": 8, "372": 7, "374": 8, "375": 9, "376": 6, "377": 8, "380": 9, "381": 9,
    "382": 8, "385": 9, "386": 8, "387": 8, "389": 8, "39": 10, "40": 9, "41": 9, "420": 9,
    "421": 9, "423": 7, "43": 10, "44": 10, "45": 8, "46": 9, "47": 8, "48": 9, "49": 10,
    "51": 9, "52": 10, "53": 8, "54": 10, "55": 11, "56": 9, "57": 10, "58": 10, "60": 9,
    "61": 9, "62": 10, "63": 10, "64": 9, "65": 8, "66": 9, "81": 10, "82": 10, "84": 9,
    "86": 11, "90": 10, "91": 10, "92": 10, "93": 9, "94": 9, "95": 9, "98": 10, "212": 9,
    "213": 9, "220": 7, "221": 9, "222": 8, "223": 8, "224": 8, "226": 8, "228": 8, "229": 8,
    "230": 7, "231": 7, "233": 9, "234": 10, "240": 9, "241": 7, "242": 9, "244": 9, "250": 9,
    "251": 9, "252": 9, "254": 9, "255": 9, "256": 9, "258": 9, "260": 9, "261": 9, "263": 9,
    "264": 8, "265": 9, "266": 8, "267": 8, "269": 7, "291": 7, "501": 7, "502": 8, "503": 8,
    "504": 8, "505": 8, "506": 8, "507": 8, "591": 8, "592": 7, "593": 9, "595": 9, "598": 8,
    "880": 10, "886": 9, "960": 7, "961": 8, "962": 9, "964": 10, "965": 8, "966": 9, "967": 9,
    "968": 8, "971": 9, "972": 9, "973": 8, "975": 8, "976": 8, "977": 10, "992": 9, "993": 8,
    "994": 9, "995": 9, "996": 9, "998": 9
};
export const DIAL_CODES_LONGEST_FIRST = Object.keys(DIAL_CODE_LENGTHS).sort((a, b) => b.length - a.length);

/**
 * Splits a phone number into its country code and national number.
 *   "+48 910 959 948" -> { dialCode: "+48", local: "910959948" }
 *   "918910959948"    -> { dialCode: "+91", local: "8910959948" }
 *   "8910959948"      -> { dialCode: "+91", local: "8910959948" }   (10 digits with no code: the older India format)
 * dialCode is null when nothing matches.
 */
export const splitPhone = (phone) => {
    const digits = String(phone ?? "").replace(/\D/g, "");
    const code = DIAL_CODES_LONGEST_FIRST.find((c) => digits.startsWith(c) && digits.length - c.length === DIAL_CODE_LENGTHS[c]);
    if (code) return { dialCode: `+${code}`, local: digits.slice(code.length), digits };
    if (digits.length === 10) return { dialCode: "+91", local: digits, digits };
    return { dialCode: null, local: digits, digits };
};

/** "+48" for "48600100201" / "+48 600 100 201"; null when the number carries no recognisable country code. */
export const dialCodeFromPhone = (phone) => {
    const digits = String(phone ?? "").replace(/\D/g, "");
    const code = DIAL_CODES_LONGEST_FIRST.find((c) => digits.startsWith(c) && digits.length - c.length === DIAL_CODE_LENGTHS[c]);
    return code ? `+${code}` : null;
};

/**
 * Mongo clauses that find the record of a phone number stored in `field`, however it was saved:
 * the whole number with its country code (with or without "+" or spaces), or the national number on its own.
 * A national number on its own only matches when its country is right: for India (the older 10-digit format) or, when
 * the record keeps its country code in `countryField`, when that equals the number's country code. No "ends with the
 * last 10 digits" matching, so numbers of different countries can never collide.
 */
export const phoneLookupClauses = (field, phone, { countryField } = {}) => {
    const { dialCode, local, digits } = splitPhone(phone);
    if (!digits) return [];
    const full = dialCode ? `${dialCode.slice(1)}${local}` : digits;
    const exact = [String(phone), digits, full, `+${full}`];
    if (dialCode) exact.push(`${dialCode}${local}`, `${dialCode} ${local}`, `${dialCode}-${local}`);
    const clauses = [{ [field]: { $in: [...new Set(exact.filter(Boolean))] } }];
    if (local && local !== full) {
        if (dialCode === "+91") clauses.push({ [field]: local });
        else if (dialCode && countryField) clauses.push({ [field]: local, [countryField]: dialCode });
    }
    return clauses;
};

/**
 * The country code and national number to STORE for a person who gave `phone` and (maybe) a separate `countryCode`.
 * The phone may already carry its country code ("+48910959948") or be the national number alone ("910959948" with
 * countryCode "+48"). Never cuts digits off: a Polish number keeps all 9 of its digits.
 */
export const normalizeStoredPhone = ({ phone, countryCode } = {}) => {
    const digits = String(phone ?? "").replace(/\D/g, "");
    const chosen = String(countryCode ?? "").replace(/\D/g, "");
    const chosenLen = DIAL_CODE_LENGTHS[chosen];
    if (chosen && chosenLen) {
        if (digits.length === chosen.length + chosenLen && digits.startsWith(chosen)) return { dialCode: `+${chosen}`, local: digits.slice(chosen.length) };
        if (digits.length === chosenLen) return { dialCode: `+${chosen}`, local: digits };
    }
    const guessed = splitPhone(phone);
    return { dialCode: guessed.dialCode, local: guessed.local };
};
