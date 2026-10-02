import mongoose from 'mongoose';

/** Customer segment / group (Gap Y, ACM-160), e.g. "B2B", "Power User", "Trial". Members: FoodUser.segmentIds. */
const segmentSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, maxlength: 40 },
        description: { type: String, default: '', trim: true, maxlength: 300 },
        color: { type: String, default: '#6366f1' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null }
    },
    { collection: 'dmb_customer_segments', timestamps: true }
);
segmentSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const DMBCustomerSegment = mongoose.model('DMBCustomerSegment', segmentSchema);
