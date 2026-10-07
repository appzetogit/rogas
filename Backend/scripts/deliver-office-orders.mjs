/**
 * Manual-testing helper: marks the office (company-paid) orders that are already assigned to a rider as DELIVERED,
 * except the order(s) of the employee whose name matches --keep (so that one is left to test by hand).
 *
 *   node scripts/deliver-office-orders.mjs --keep shyam             # dry run: only lists what would change
 *   node scripts/deliver-office-orders.mjs --keep shyam --apply     # does it
 *   node scripts/deliver-office-orders.mjs --keep shyam --pins      # read-only: print the customers' delivery PINs
 *   Optional: --date 2026-10-07   (default: today, platform time zone)
 *
 * It uses MONGO_URI from Backend/.env, i.e. whatever database your server uses. Run it deliberately.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { DMBDailyOrder } from '../src/modules/dailymealbox/subscription/dmb.dailyOrder.model.js';
import { DMBSubscription } from '../src/modules/dailymealbox/subscription/subscription.model.js';
import { FoodUser } from '../src/core/users/user.model.js';
import { localToday, storageDateStr } from '../src/utils/platformTime.js';

const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
};
const apply = process.argv.includes('--apply');
const keep = (arg('keep') || '').trim().toLowerCase();
if (!keep) {
    console.error('Pass --keep <part of the name to leave untouched>, e.g. --keep shyam');
    process.exit(1);
}
const date = arg('date') ? new Date(`${arg('date')}T00:00:00.000Z`) : localToday();

await mongoose.connect(process.env.MONGO_URI);
try {
    const officeSubs = await DMBSubscription.find({ source: 'office' }).select('_id').lean();
    const orders = await DMBDailyOrder.find({
        subscriptionId: { $in: officeSubs.map((s) => s._id) },
        deliveryDate: date,
        'dispatch.deliveryPartnerId': { $ne: null },
        status: { $in: ['scheduled', 'preparing', 'ready', 'out_for_delivery'] }
    }).lean();
    const users = new Map((await FoodUser.find({ _id: { $in: orders.map((o) => o.userId) } }).select('name').lean()).map((u) => [String(u._id), u.name || '']));

    const toDeliver = [];
    const kept = [];
    for (const o of orders) {
        const name = users.get(String(o.userId)) || '';
        (name.toLowerCase().includes(keep) ? kept : toDeliver).push({ o, name });
    }
    if (process.argv.includes('--pins')) {
        // Read-only: the customer delivery PINs (the 4-digit code the customer tells the rider).
        console.log('Customer delivery PINs:');
        for (const o of orders) console.log(`  ${users.get(String(o.userId)) || '?'}  (${o.orderId}, ${o.deliverySlot}, ${o.status})  PIN: ${o.deliveryPin || '-'}`);
        process.exit(0);
    }
    console.log(`Office orders for ${storageDateStr(date)} held by a rider: ${orders.length}`);
    console.log(`Left as they are (name contains "${keep}"): ${kept.map((k) => `${k.name} [${k.o.orderId}, ${k.o.status}]`).join('; ') || 'none'}`);
    console.log(`To mark delivered: ${toDeliver.map((k) => `${k.name} [${k.o.orderId}, ${k.o.status}]`).join('; ') || 'none'}`);
    if (!apply) {
        console.log('\nDry run only. Add --apply to make the change.');
    } else if (toDeliver.length) {
        const now = new Date();
        const res = await DMBDailyOrder.updateMany(
            { _id: { $in: toDeliver.map((k) => k.o._id) } },
            { $set: { status: 'delivered', deliveredAt: now, paymentConfirmed: true } }
        );
        await DMBDailyOrder.updateMany({ _id: { $in: toDeliver.map((k) => k.o._id) }, pickedUpAt: null }, { $set: { pickedUpAt: now } });
        console.log(`\nMarked ${res.modifiedCount} order(s) delivered.`);
    }
} finally {
    await mongoose.disconnect();
}
