import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function run() {
  await mongoose.connect(mongoUri);
  const DMBDailyOrder = mongoose.model('DMBDailyOrder', new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    status: String,
    dispatch: {
      deliveryPartnerId: mongoose.Schema.Types.ObjectId
    }
  }, { strict: false }), 'dmb_daily_orders');

  const orderId = '6a2e1c2a7e71076115bf7952';
  const userId = '6a2e1bc47e71076115bf78ee';
  const amount = 10;

  try {
    if (!amount || Number(amount) <= 0) {
      console.log('Error: Invalid tip amount');
      return;
    }

    const order = await DMBDailyOrder.findOne({ _id: orderId, userId });
    if (!order) {
      console.log('Error: Order not found');
      return;
    }

    if (order.status !== 'delivered') {
      console.log('Error: Can only tip after successful delivery');
      return;
    }

    const driverId = order.dispatch?.deliveryPartnerId;
    if (!driverId) {
      console.log('Error: No delivery partner assigned to this order');
      return;
    }

    const amountPaise = Math.round(Number(amount) * 100);
    const currency = 'INR';
    const receipt = `tip_${order._id.toString().slice(-12)}_${Date.now()}`;

    console.log('Importing helper...');
    const { createRazorpayOrder, getRazorpayKeyId, isRazorpayConfigured } = await import('../src/modules/food/orders/helpers/razorpay.helper.js');

    console.log('isRazorpayConfigured:', isRazorpayConfigured());

    let rzOrder = null;
    if (isRazorpayConfigured()) {
        console.log('Razorpay is configured, creating real order...');
        rzOrder = await createRazorpayOrder(amountPaise, currency, receipt);
    } else {
        console.log('Razorpay is NOT configured, creating fake order...');
        rzOrder = { id: `rzp_tip_dev_${Math.random().toString(36).substr(2, 9)}`, amount: amountPaise, currency };
    }

    console.log('Importing DMBDailyOrder model for transaction...');
    const { FoodDeliveryTipTransaction } = await import('../src/modules/dailymealbox/subscription/dmb.dailyOrder.model.js');
    console.log('Creating transaction record...');
    const tx = await FoodDeliveryTipTransaction.create({
        deliveryPartnerId: driverId,
        orderId: order._id,
        orderType: 'subscription',
        amount: Number(amount),
        razorpayOrderId: rzOrder.id,
        status: 'pending'
    });

    console.log('SUCCESS:', tx);
  } catch (err) {
    console.error('FAILED WITH ERROR:');
    console.error(err);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
