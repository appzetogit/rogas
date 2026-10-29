/**
 * NIP lookup: checksum, splitting the registry's one-line address, caching and error mapping.
 * The registry is replaced by a fake fetch, so no network or database is needed.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isValidNip, splitPolishAddress, lookupNip, clearNipLookupCache, NipLookupError } from '../src/modules/dailymealbox/office/nipLookup.service.js';

const realFetch = globalThis.fetch;
let calls = 0;
const registry = (status, subject) => {
    globalThis.fetch = async () => {
        calls += 1;
        return { status, ok: status >= 200 && status < 300, json: async () => ({ result: { subject } }) };
    };
};

beforeEach(() => { calls = 0; clearNipLookupCache(); });
afterEach(() => { globalThis.fetch = realFetch; });

test('NIP checksum: valid numbers pass, wrong ones and wrong lengths fail', () => {
    assert.equal(isValidNip('7740001454'), true);
    assert.equal(isValidNip('774-000-14-54'), true, 'dashes and spaces are ignored');
    assert.equal(isValidNip('1234567890'), false);
    assert.equal(isValidNip('774000145'), false);
    assert.equal(isValidNip(''), false);
});

test('address is split at the post code into street, post code and city', () => {
    assert.deepEqual(splitPolishAddress('CHEMIKÓW 7, 09-411 PŁOCK'), { street: 'CHEMIKÓW 7', postCode: '09-411', city: 'PŁOCK' });
    assert.deepEqual(splitPolishAddress('UL. GRÓJECKA 12/14 LOK. 5, 02-019 WARSZAWA'), { street: 'UL. GRÓJECKA 12/14 LOK. 5', postCode: '02-019', city: 'WARSZAWA' });
    assert.deepEqual(splitPolishAddress('ul. Piękna 3 00-001 Warszawa Śródmieście'), { street: 'ul. Piękna 3', postCode: '00-001', city: 'Warszawa Śródmieście' });
    assert.deepEqual(splitPolishAddress('00-950 WARSZAWA'), { street: '', postCode: '00-950', city: 'WARSZAWA' });
});

test('an address without a post code is kept whole as the street, nothing is lost', () => {
    assert.deepEqual(splitPolishAddress('Somewhere unusual 5'), { street: 'Somewhere unusual 5', postCode: '', city: '' });
    assert.deepEqual(splitPolishAddress(''), { street: '', postCode: '', city: '' });
    assert.deepEqual(splitPolishAddress(undefined), { street: '', postCode: '', city: '' });
});

test('lookup returns the company with a structured address, and asks the registry only once per NIP', async () => {
    registry(200, { nip: '7740001454', name: 'ORLEN SPÓŁKA AKCYJNA', regon: '610188201', krs: '0000028860', workingAddress: 'CHEMIKÓW 7, 09-411 PŁOCK', statusVat: 'Czynny', accountNumbers: ['30102010260000140203550589'] });
    const first = await lookupNip('774-000-14-54');
    assert.equal(first.companyName, 'ORLEN SPÓŁKA AKCYJNA');
    assert.equal(first.street, 'CHEMIKÓW 7');
    assert.equal(first.postCode, '09-411');
    assert.equal(first.city, 'PŁOCK');
    assert.equal(first.address, 'CHEMIKÓW 7, 09-411 PŁOCK', 'the one-line address stays for the office form');
    assert.equal(first.iban, 'PL30102010260000140203550589');
    await lookupNip('7740001454');
    assert.equal(calls, 1, 'second lookup comes from the cache');
});

test('an invalid NIP is refused without calling the registry', async () => {
    registry(200, {});
    await assert.rejects(lookupNip('1234567890'), (e) => e instanceof NipLookupError && e.status === 400);
    assert.equal(calls, 0);
});

test('unknown company -> 404, registry down -> 502, and failures are not cached', async () => {
    registry(404, null);
    await assert.rejects(lookupNip('7740001454'), (e) => e.status === 404);
    registry(500, null);
    await assert.rejects(lookupNip('7740001454'), (e) => e.status === 502);
    globalThis.fetch = async () => { throw new Error('network down'); };
    await assert.rejects(lookupNip('7740001454'), (e) => e.status === 502);
    registry(200, { name: 'BACK ONLINE SA', workingAddress: 'A 1, 00-001 X' });
    assert.equal((await lookupNip('7740001454')).companyName, 'BACK ONLINE SA', 'a failure never sticks');
});
