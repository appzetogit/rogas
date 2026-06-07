import mongoose from 'mongoose';

const durationPlanSchema = new mongoose.Schema(
    {
        label: {
            type: String,
            required: true,
            trim: true
        },
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true
        },
        daysCountMonFri: {
            type: Number,
            required: true,
            min: 1
        },
        daysCountFullWeek: {
            type: Number,
            required: true,
            min: 1
        },
        description: {
            type: String,
            default: ''
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        }
    },
    {
        collection: 'dmb_duration_plans',
        timestamps: true
    }
);

export const DMBDurationPlan = mongoose.model('DMBDurationPlan', durationPlanSchema);
