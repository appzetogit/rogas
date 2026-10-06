import { dialCodeFromPhone } from '../../../core/auth/auth.service.js';

/**
 * Employee phone numbers.
 *
 * Employees sign in to the customer app with their number as country code + local number, digits only
 * ("48600100200" — that is what the app sends and how customer accounts are stored). The office form only asks for the
 * local part (it shows a fixed +48), so the number has to be stored in that same form — otherwise the employee's
 * sign-in creates a second, empty account and they never see the meals their company bought.
 */

export const DEFAULT_DIAL_CODE = '48';
const LOCAL_LENGTH = 9; // Polish numbers, the default country

export class EmployeePhoneError extends Error {
    constructor(message) {
        super(message);
        this.statusCode = 400;
    }
}

/** "48600100200" for "600 100 200", "48600100200", "+48 600-100-200" or "0048600100200"; throws when it is not a phone number. */
export const normalizeEmployeePhone = (raw) => {
    const text = String(raw || '').trim();
    const digits = text.replace(/\D/g, '');
    if (!digits) throw new EmployeePhoneError('Enter the employee\'s mobile number');
    if (text.startsWith('+')) {
        if (!dialCodeFromPhone(digits)) throw new EmployeePhoneError('Enter a valid mobile number with its country code');
        return digits;
    }
    if (digits.startsWith('00') && dialCodeFromPhone(digits.slice(2))) return digits.slice(2);
    if (digits.length === LOCAL_LENGTH) return `${DEFAULT_DIAL_CODE}${digits}`;
    if (dialCodeFromPhone(digits)) return digits;
    throw new EmployeePhoneError(`Enter a valid ${LOCAL_LENGTH}-digit mobile number`);
};

/** Every form an existing account may have stored this number in ("+48…" from older screens, or without the country code). */
export const phoneLookupCandidates = (canonical) => {
    const code = (dialCodeFromPhone(canonical) || '').replace('+', '');
    const local = code ? canonical.slice(code.length) : '';
    return [...new Set([canonical, `+${canonical}`, local].filter(Boolean))];
};

/**
 * The customer account that signs in with this number, preferring one stored in the canonical form. Exact matches only:
 * a "number ends with" match could pick a stranger's account in another country.
 */
export const findUserByEmployeePhone = async (FoodUser, canonical) => {
    const users = await FoodUser.find({ phone: { $in: phoneLookupCandidates(canonical) } });
    if (!users.length) return null;
    return users.find((u) => u.phone === canonical) || users[0];
};
