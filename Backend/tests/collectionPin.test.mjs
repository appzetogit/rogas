/**
 * The collection PIN is never stored in plain text: a salted hash checks an entry, an encrypted copy lets the vendor and driver see it.
 * Needs a LOCAL MongoDB:   AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/collectionPin.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connect, disconnect, seedWorld } from './helpers/amendmentFixtures.mjs';

let w, M;
before(async () => {
    await connect('collection_pin_test');
    w = await seedWorld();
    M = await import('../src/modules/dailymealbox/delivery/collectionBatch.model.js');
});
after(disconnect);

const make = (over = {}) => new M.CollectionBatch({ vendorId: w.vendor._id, deliveryDate: new Date(), deliverySlot: 'lunch', boxCount: 1, orderIds: [new mongoose.Types.ObjectId()], ...over });

test('a new PIN is stored as a salted hash plus an encrypted copy, never as digits', async () => {
    const batch = make();
    M.setCollectionPin(batch, '4821');
    await batch.save();
    const stored = await M.CollectionBatch.findById(batch._id).lean();
    assert.match(stored.collectionPinHash, /^[0-9a-f]{64}$/);
    assert.match(stored.collectionPinEnc, /^enc:v1:/);
    assert.ok(!JSON.stringify(stored).includes('4821'), 'the digits appear nowhere in the stored document');
    assert.equal(M.readCollectionPin(stored), '4821', 'it can still be shown to the people who need it');
});

test('checking an entry: right, wrong, blank, with spaces; the same PIN hashes differently on two batches', async () => {
    const a = make(); const b = make();
    M.setCollectionPin(a, '1234'); M.setCollectionPin(b, '1234');
    await a.save(); await b.save();
    assert.equal(M.checkCollectionPin(a, '1234'), true);
    assert.equal(M.checkCollectionPin(a, ' 1234 '), true);
    assert.equal(M.checkCollectionPin(a, 1234), true, 'a number typed as digits');
    assert.equal(M.checkCollectionPin(a, '1235'), false);
    assert.equal(M.checkCollectionPin(a, ''), false);
    assert.equal(M.checkCollectionPin(a, undefined), false);
    assert.notEqual(a.collectionPinHash, b.collectionPinHash, 'salted by the batch, so equal PINs are not recognisable');
    // a hash from another batch does not validate here
    b.collectionPinHash = a.collectionPinHash;
    assert.equal(M.checkCollectionPin(b, '1234'), false);
});

test('replacing the PIN (vendor asks for a new one) invalidates the old one', async () => {
    const batch = make();
    M.setCollectionPin(batch, '1111'); await batch.save();
    M.setCollectionPin(batch, '2222'); await batch.save();
    const stored = await M.CollectionBatch.findById(batch._id);
    assert.equal(M.checkCollectionPin(stored, '1111'), false);
    assert.equal(M.checkCollectionPin(stored, '2222'), true);
    assert.equal(M.readCollectionPin(stored), '2222');
});

test('older rows that still hold the digits keep working until they are replaced', async () => {
    const legacy = await M.CollectionBatch.create({ vendorId: w.vendor._id, deliveryDate: new Date(), deliverySlot: 'lunch', boxCount: 1, orderIds: [new mongoose.Types.ObjectId()], collectionPinHash: '7777' });
    assert.equal(M.readCollectionPin(legacy), '7777');
    assert.equal(M.checkCollectionPin(legacy, '7777'), true);
    assert.equal(M.checkCollectionPin(legacy, '7778'), false);
    M.setCollectionPin(legacy, '8888');
    assert.match(legacy.collectionPinHash, /^[0-9a-f]{64}$/);
    assert.equal(M.checkCollectionPin(legacy, '7777'), false);
});
