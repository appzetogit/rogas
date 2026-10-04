/**
 * Company details from a Polish NIP, using the Ministry of Finance's free public "White List of VAT taxpayers" API
 * (no key needed). Used to pre-fill the typable company fields in Office onboarding.
 */
const MF_URL = 'https://wl-api.mf.gov.pl/api/search/nip';

export const isValidNip = (value) => {
    const nip = String(value || '').replace(/\D/g, '');
    if (nip.length !== 10) return false;
    const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
    const sum = w.reduce((s, x, i) => s + x * Number(nip[i]), 0);
    return sum % 11 === Number(nip[9]);
};

export class NipLookupError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export const lookupNip = async (rawNip) => {
    const nip = String(rawNip || '').replace(/\D/g, '');
    if (!isValidNip(nip)) throw new NipLookupError('This NIP number is not valid. Please check the 10 digits.');

    let res;
    try {
        res = await fetch(`${MF_URL}/${nip}?date=${todayStr()}`, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
    } catch {
        throw new NipLookupError('The company registry is not reachable right now. Please type the details manually.', 502);
    }
    if (res.status === 404 || res.status === 400) throw new NipLookupError('No company found for this NIP in the VAT registry.', 404);
    if (!res.ok) throw new NipLookupError('The company registry is not reachable right now. Please type the details manually.', 502);

    const body = await res.json().catch(() => null);
    const subject = body?.result?.subject;
    if (!subject) throw new NipLookupError('No company found for this NIP in the VAT registry.', 404);

    const account = Array.isArray(subject.accountNumbers) ? subject.accountNumbers[0] : '';
    return {
        nip: subject.nip || nip,
        companyName: subject.name || '',
        regon: subject.regon || '',
        krs: subject.krs || '',
        address: subject.workingAddress || subject.residenceAddress || '',
        vatStatus: subject.statusVat || '',
        iban: account ? `PL${account}` : ''
    };
};
