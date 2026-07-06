import mongoose from 'mongoose';

const kitchenPartnerSchema = new mongoose.Schema(
    {
        companyName: {
            type: String,
            required: [true, 'Company Name is required'],
            trim: true,
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address'],
        },
        vatNumber: {
            type: String,
            trim: true,
        },
        managementFee: {
            type: Number,
            min: [0, 'Management fee cannot be negative'],
            max: [100, 'Management fee cannot exceed 100%'],
            default: 0,
        },
        status: {
            type: String,
            enum: ['Active', 'Inactive', 'Suspended'],
            default: 'Active',
        },
        documents: {
            type: String, // Storing document URL/path. If multiple, we can change to array later.
        },
        bankDetails: {
            type: String,
        },
        address: {
            street: { type: String },
            city: { type: String },
            state: { type: String },
            pincode: { type: String },
        },
        // PRD required metrics
        homeCooks: [{
            homeKitchenId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant' },
            homeKitchenName: { type: String }
        }],
        orders: {
            type: Number,
            default: 0,
        },
        earnings: {
            type: Number,
            default: 0,
        },
        // ID prefix for display
        partnerId: {
            type: String,
            unique: true,
        }
    },
    {
        timestamps: true,
    }
);

// Pre-save hook to generate partnerId if it doesn't exist
kitchenPartnerSchema.pre('save', function (next) {
    if (this.isNew && !this.partnerId) {
        // Generate a random ID like DMB-8291
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        this.partnerId = `DMB-${randomNum}`;
    }
    next();
});

const KitchenPartner = mongoose.model('KitchenPartner', kitchenPartnerSchema);
export default KitchenPartner;
