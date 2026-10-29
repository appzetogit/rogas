import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const driver = await db.collection('food_delivery_partners').findOne({ phone: '8987654321' });
  const { localToday, localParts } = await import('../src/utils/platformTime.js');
  const { getVendorTimingSettings } = await import('../src/modules/food/admin/services/admin.service.js');
  const timingSettings = await getVendorTimingSettings();

  const SLOTS = timingSettings.slots.map(sl => sl.key);
  const todayDow = new Date(localToday()).getUTCDay();
  const slotRunsToday = (key) => {
    const sl = timingSettings.slots.find(x => x.key === key);
    return !sl?.availableDays?.length || sl.availableDays.includes(todayDow);
  };
  const p = localParts();
  const nowMins = p.hour * 60 + p.minute;
  const hhmmToMins = (str) => {
    if (!str) return null;
    const [h, m] = str.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };

  let activeSlot = null;
  for (const slot of SLOTS) {
    const cfg = timingSettings[slot];
    if (!cfg || cfg.isEnabled === false || !slotRunsToday(slot)) continue;
    const start = hhmmToMins(cfg.startTime);
    const end = hhmmToMins(cfg.endTime);
    if (start === null || end === null) continue;
    if (nowMins >= start && nowMins <= end) {
      activeSlot = slot;
      break;
    }
  }

  console.log('Server time now:', p.hour + ':' + p.minute, 'nowMins:', nowMins);
  console.log('Active slot:', activeSlot, 'Timing bypass:', timingSettings.bypassPrepTimingRestrictions);
  console.log('Driver vendors:', driver.assignedVendors);

  const today = localToday();
  const tomorrow = new Date(today.getTime() + 86400000);

  const ordersForBreakfast = await db.collection('dmb_daily_orders').find({
    deliveryDate: { $gte: today, $lt: tomorrow },
    deliverySlot: 'breakfast'
  }).toArray();
  const ordersForDinner = await db.collection('dmb_daily_orders').find({
    deliveryDate: { $gte: today, $lt: tomorrow },
    deliverySlot: 'dinner'
  }).toArray();

  console.log('Orders today for Breakfast:', ordersForBreakfast.length);
  console.log('Orders today for Dinner:', ordersForDinner.length);
  ordersForDinner.forEach(o => console.log('Dinner Order:', o._id, 'status:', o.status, 'vendorId:', o.vendorId));

  await mongoose.disconnect();
}

run().catch(console.error);
