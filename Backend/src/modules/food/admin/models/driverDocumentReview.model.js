import mongoose from 'mongoose';

const driverDocumentReviewSchema = new mongoose.Schema(
    {
        driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', required: true, index: true },
        fleetPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FleetPartner', default: null, index: true },
        documentType: {
            type: String,
            enum: ['driving_licence', 'national_id', 'vehicle_registration', 'vehicle_insurance', 'driver_contract', 'other'],
            required: true,
            index: true
        },
        documentUrl: { type: String, trim: true, default: '' },
        expiryDate: { type: Date, default: null },
        status: {
            type: String,
            enum: ['pending_review', 'approved', 'rejected', 'needs_reupload', 'expiring', 'expired'],
            default: 'pending_review',
            index: true
        },
        rejectionReason: { type: String, trim: true, default: '' },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
        reviewedAt: { type: Date, default: null },
        history: {
            type: [
                {
                    status: String,
                    reason: String,
                    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin' },
                    at: { type: Date, default: Date.now }
                }
            ],
            default: []
        }
    },
    {
        collection: 'admin_driver_document_reviews',
        timestamps: true
    }
);

driverDocumentReviewSchema.index({ driverId: 1, documentType: 1 }, { unique: true });

export const DriverDocumentReview = mongoose.model('DriverDocumentReview', driverDocumentReviewSchema);
