import mongoose from 'mongoose';

const promocodeSchema = new mongoose.Schema({
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
  },
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  discountType: {
    type: String,
    enum: ['PERCENTAGE', 'FLAT'],
    required: true,
  },
  discountValue: {
    type: Number,
    required: true,
  },
  minOrderAmount: {
    type: Number,
    default: 0,
  },
  maxDiscountAmount: {
    type: Number,
    default: null,
  },
  startDate: {
    type: Date,
    default: Date.now,
  },
  expiryDate: {
    type: Date,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  usageLimit: {
    type: Number,
    default: null,
  },
  usageCount: {
    type: Number,
    default: 0,
  }
}, { timestamps: true });

promocodeSchema.index({ restaurantId: 1, code: 1 }, { unique: true });

export default mongoose.model('Promocode', promocodeSchema);
