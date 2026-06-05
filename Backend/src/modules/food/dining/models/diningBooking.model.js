import mongoose from 'mongoose';

const diningBookingSchema = new mongoose.Schema(
    {
        bookingId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
            required: true,
            index: true
        },
        user: {
            name: { type: String, required: true },
            phone: { type: String, required: true },
            email: { type: String }
        },
        guests: {
            type: Number,
            required: true,
            min: 1
        },
        date: {
            type: Date,
            required: true
        },
        timeSlot: {
            type: String,
            required: true
        },
        specialRequest: {
            type: String,
            default: ''
        },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'confirmed', 'cancelled', 'completed', 'checked-in'],
            default: 'pending'
        },
        review: {
            rating: { type: Number, min: 0, max: 5 },
            comment: { type: String },
            createdAt: { type: Date }
        }
    },
    {
        collection: 'food_dining_bookings',
        timestamps: true
    }
);

diningBookingSchema.index({ restaurantId: 1, status: 1 });
diningBookingSchema.index({ userId: 1, createdAt: -1 });

export const FoodDiningBooking = mongoose.model('FoodDiningBooking', diningBookingSchema);
