import mongoose from 'mongoose';

const pantryOrderItemSchema = new mongoose.Schema({
    pantryItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PantryItem',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    }
}, { _id: false });

const pantryOrderSchema = new mongoose.Schema(
    {
        orderId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
            required: true,
            index: true
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true
        },
        items: [pantryOrderItemSchema],
        deliveryDates: [{
            type: String, // format YYYY-MM-DD
            required: true
        }],
        deliverySlots: [{
            type: String,
            required: true
        }],
        deliveryAddress: {
            street: { type: String, required: true },
            city: { type: String, required: true },
            state: { type: String, required: true },
            pincode: { type: String },
            label: { type: String },
            location: {
                type: { type: String, enum: ['Point'], default: 'Point' },
                coordinates: { type: [Number], required: true }
            }
        },
        pricing: {
            itemsTotal: { type: Number, required: true },
            deliveryFee: { type: Number, required: true },
            total: { type: Number, required: true }
        },
        status: {
            type: String,
            enum: ['pending_payment', 'paid', 'cancelled'],
            default: 'pending_payment'
        },
        dailyDeliveries: [{
            date: { type: Date, required: true },
            dayOfWeek: { type: String, required: true },
            slot: { type: String, required: true },
            status: { type: String, enum: ['scheduled', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'failed'], default: 'scheduled' },
            deliveryPin: { type: String },
            deliveredAt: { type: Date },
            driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner' }
        }],
        paymentId: { type: String },
        paymentOrderId: { type: String },
        paymentStatus: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
        weekStartDate: { 
            type: Date,
            required: true,
            index: true
        }
    },
    {
        collection: 'food_pantry_orders',
        timestamps: true
    }
);

pantryOrderSchema.index({ 'deliveryAddress.location': '2dsphere' });
pantryOrderSchema.index({ vendorId: 1, weekStartDate: 1 });

export const PantryOrder = mongoose.model('PantryOrder', pantryOrderSchema);
