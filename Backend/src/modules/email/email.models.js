import mongoose from 'mongoose';

export const EMAIL_STATUSES = ['queued', 'sent', 'failed'];

/**
 * EmailLog — one row per email the platform has tried to send. The single source of truth for what went out,
 * what's still pending, and what needs a human's attention. Every send goes through here (even ones that succeed
 * immediately), so the admin panel can show a real history, not just "check the SMTP provider's dashboard".
 */
const attachmentSchema = new mongoose.Schema(
    {
        filename: { type: String, required: true },
        /** A URL or local path; nodemailer fetches it at send time. Never store attachment bytes here. */
        path: { type: String, required: true }
    },
    { _id: false }
);

const emailLogSchema = new mongoose.Schema(
    {
        to: { type: String, required: true, trim: true, index: true },
        cc: { type: String, default: '' },

        /** The English subject text: doubles as the i18n key and as a stable, filterable "what kind of email is this". */
        templateKey: { type: String, required: true, index: true },
        /** What was actually sent, in the recipient's language. */
        subject: { type: String, required: true },
        html: { type: String, required: true },
        text: { type: String, default: '' },
        language: { type: String, default: 'en' },
        attachments: { type: [attachmentSchema], default: [] },

        /** Who this was for, when known — lets the admin jump from a payment/vendor/order to its emails. */
        ownerType: { type: String, default: '' },
        ownerId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

        status: { type: String, enum: EMAIL_STATUSES, default: 'queued', index: true },
        attempts: { type: Number, default: 0 },
        lastError: { type: String, default: '' },
        sentAt: { type: Date, default: null },
        /** Simple backoff: retries are not attempted again before this. */
        nextAttemptAt: { type: Date, default: () => new Date() }
    },
    {
        collection: 'email_logs',
        timestamps: true
    }
);

emailLogSchema.index({ status: 1, nextAttemptAt: 1 });
emailLogSchema.index({ createdAt: -1 });

export const EmailLog = mongoose.model('EmailLog', emailLogSchema);
