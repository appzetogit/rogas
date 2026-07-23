import mongoose from 'mongoose';

const appConfigSchema = new mongoose.Schema({
    appName: {
        type: String,
        required: true,
        enum: ['user_app', 'delivery_app', 'restaurant_app', 'admin_app'],
        unique: true
    },
    primaryColor: {
        type: String,
        default: '#e11d48'
    },
    secondaryColor: {
        type: String,
        default: '#be123c'
    },
    logoUrl: {
        type: String,
        default: ''
    },
    fontFamily: {
        type: String,
        default: "'Poppins', sans-serif"
    },
    backgroundColor: {
        type: String,
        default: '#f8fafc'
    },
    textColor: {
        type: String,
        default: '#0f172a'
    },
    // ─── Delivery Slot Time Windows (IST hours, 24h format) ───────────────────
    slotTimings: {
        breakfast: {
            startHour: { type: Number, default: 6 },
            endHour:   { type: Number, default: 11 }
        },
        lunch: {
            startHour: { type: Number, default: 11 },
            endHour:   { type: Number, default: 16 }
        },
        dinner: {
            startHour: { type: Number, default: 16 },
            endHour:   { type: Number, default: 23 }
        }
    }
}, { timestamps: true });

export const AppConfig = mongoose.model('AppConfig', appConfigSchema);
