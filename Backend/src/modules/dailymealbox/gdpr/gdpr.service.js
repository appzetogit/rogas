import crypto from 'crypto';
import mongoose from 'mongoose';
import { logger } from '../../../utils/logger.js';

/**
 * GDPR deletion (Amendment 1 #17).
 *
 * Customer taps "Delete My Account" -> a request is created and the 30-day EU deadline starts. Customer Service executes
 * it with ONE action (no field-by-field clean-up): personal data is removed, orders and invoices stay for tax law but are
 * anonymised, ratings stay anonymised. A daily job escalates requests that are still open after 25 days.
 */

export const GDPR_DEADLINE_DAYS = 30;
export const GDPR_ESCALATE_AFTER_DAYS = 25;
const DAY = 86_400_000;

const gdprSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        status: { type: String, enum: ['pending', 'completed'], default: 'pending', index: true },
        requestedAt: { type: Date, default: () => new Date() },
        dueAt: { type: Date, required: true },
        escalatedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        completedBy: { type: String, default: '' },
        anonId: { type: String, default: '' },
        /** Only for the confirmation e-mail; removed again when the request is completed. */
        contactEmail: { type: String, default: '' },
        checklist: {
            piiDeleted: { type: Boolean, default: false },
            ordersAnonymised: { type: Boolean, default: false },
            invoicesRetained: { type: Boolean, default: false },
            confirmationSent: { type: Boolean, default: false }
        },
        summary: { type: mongoose.Schema.Types.Mixed, default: undefined }
    },
    { collection: 'dmb_gdpr_requests', timestamps: true }
);
export const DMBGdprRequest = mongoose.models.DMBGdprRequest || mongoose.model('DMBGdprRequest', gdprSchema);

export class GdprError extends Error {
    constructor(message, statusCode = 400, code = 'GDPR_INVALID') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}

const daysLeft = (dueAt, now = new Date()) => Math.ceil((new Date(dueAt).getTime() - now.getTime()) / DAY);

/** Customer side: creates the request (one open request per customer). */
export const requestDeletion = async (userId) => {
    const { FoodUser } = await import('../../../core/users/user.model.js');
    const user = await FoodUser.findById(userId).select('email isDeleted').lean();
    if (!user || user.isDeleted) throw new GdprError('Account not found', 404, 'NOT_FOUND');
    const open = await DMBGdprRequest.findOne({ userId, status: 'pending' });
    if (open) return { request: open.toObject(), alreadyRequested: true };
    const now = new Date();
    const request = await DMBGdprRequest.create({ userId, requestedAt: now, dueAt: new Date(now.getTime() + GDPR_DEADLINE_DAYS * DAY), contactEmail: user.email || '' });
    try {
        const { raiseAdminAlert } = await import('../platform/platformConfig.service.js');
        await raiseAdminAlert({
            type: 'gdpr_deletion', severity: 'critical',
            title: 'GDPR deletion request',
            message: `A customer asked for account deletion. It must be completed within ${GDPR_DEADLINE_DAYS} days.`,
            entityType: 'DMBGdprRequest', entityId: request._id, link: '/admin/food/dmb/gdpr', dedupeKey: `gdpr:${request._id}`
        });
    } catch (err) {
        logger.warn(`GDPR request alert failed: ${err.message}`);
    }
    return { request: request.toObject(), alreadyRequested: false };
};

export const statusForUser = async (userId) => {
    const open = await DMBGdprRequest.findOne({ userId, status: 'pending' }).lean();
    return open ? { requested: true, requestedAt: open.requestedAt, dueAt: open.dueAt } : { requested: false };
};

/** Admin list: open first (oldest due date first), then completed. */
export const listRequests = async ({ status, limit = 200 } = {}) => {
    const filter = status ? { status } : {};
    const rows = await DMBGdprRequest.find(filter).sort({ status: 1, dueAt: 1 }).limit(Math.min(Number(limit) || 200, 500)).lean();
    const { FoodUser } = await import('../../../core/users/user.model.js');
    const users = await FoodUser.find({ _id: { $in: rows.map((r) => r.userId) } }).select('name phone email walletBalance').lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const now = new Date();
    return rows.map((r) => {
        const u = byId.get(String(r.userId));
        const done = r.status === 'completed';
        return {
            ...r,
            // Personal details are shown only while the request is open (they are gone once it is completed).
            customer: done ? null : { name: u?.name || '', phone: u?.phone || '', email: u?.email || '', walletBalance: u?.walletBalance || 0 },
            daysLeft: done ? null : daysLeft(r.dueAt, now),
            overdue: !done && new Date(r.dueAt) < now
        };
    });
};

const anonId = () => `ANON_${crypto.randomInt(10_000_000, 100_000_000)}`;

/**
 * Executes a deletion request: one action, idempotent. Refuses while the customer still has a wallet balance (that money
 * must be settled first) unless `acknowledgeBalance` is passed.
 */
export const executeDeletion = async (requestId, { adminId = '', acknowledgeBalance = false } = {}) => {
    if (!mongoose.Types.ObjectId.isValid(requestId)) throw new GdprError('Invalid request id');
    const request = await DMBGdprRequest.findById(requestId);
    if (!request) throw new GdprError('Request not found', 404, 'NOT_FOUND');
    if (request.status === 'completed') return { request: request.toObject(), alreadyCompleted: true };

    const { FoodUser } = await import('../../../core/users/user.model.js');
    const { DMBSubscription } = await import('../subscription/subscription.model.js');
    const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
    const { FoodRefreshToken } = await import('../../../core/refreshTokens/refreshToken.model.js');
    const { AccountDeletion } = await import('../../food/admin/models/accountDeletion.model.js');
    const { localToday } = await import('../../../utils/platformTime.js');

    const userId = request.userId;
    const user = await FoodUser.findById(userId).select('walletBalance isDeleted').lean();
    if (user && Number(user.walletBalance) > 0 && !acknowledgeBalance) {
        throw new GdprError(`The customer still has a wallet balance of ${user.walletBalance}. Settle it first, or confirm that it may be forfeited.`, 409, 'WALLET_BALANCE');
    }

    const anon = request.anonId || anonId();
    const now = new Date();
    const today = localToday(now);

    // 1. Stop everything that is still running for this customer.
    await FoodRefreshToken.deleteMany({ userId });
    await DMBSubscription.updateMany(
        { userId, status: { $in: ['active', 'paused', 'pending_payment'] } },
        { $set: { status: 'cancelled', cancelledAt: now, cancellationReason: 'Account deleted (GDPR)', autoRenew: false } }
    );
    await DMBDailyOrder.updateMany({ userId, status: 'scheduled', deliveryDate: { $gte: today } }, { $set: { status: 'skipped' } });

    // 2. Financial figures only (no personal data) stay for the books.
    const [stats] = await DMBDailyOrder.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(String(userId)) } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$pricing.totalPrice', 0] } }, count: { $sum: 1 } } }
    ]);
    await AccountDeletion.create({
        accountType: 'USER', originalId: userId, phone: '', name: anon, email: '',
        financialSnapshot: { totalOrderAmount: stats?.total || 0, walletBalance: user?.walletBalance || 0 },
        orderCount: stats?.count || 0
    });

    // 3. Orders and subscriptions stay (tax law) but lose every personal detail.
    const orders = await DMBDailyOrder.updateMany(
        { userId },
        { $set: { anonymisedAs: anon, 'deliveryAddress.street': '', 'deliveryAddress.city': '', 'deliveryAddress.state': '', 'deliveryAddress.label': '', specialInstructions: '', notes: '', ratingFeedback: '' }, $unset: { 'deliveryAddress.location': 1 } }
    );
    const subsRes = await DMBSubscription.updateMany(
        { userId },
        { $set: { anonymisedAs: anon, 'deliveryAddress.street': '', 'deliveryAddress.city': '', 'deliveryAddress.state': '', billingEmail: '', specialInstructions: '' }, $unset: { dayAddresses: 1 } }
    );

    // 4. The user record becomes a tombstone: no PII, still resolvable by id so the orders keep working.
    await FoodUser.updateOne({ _id: userId }, {
        $set: {
            name: 'Anonymous Customer',
            phone: `deleted:${anon}`,
            isActive: false,
            isDeleted: true,
            deletedAt: now,
            anonId: anon,
            addresses: [],
            loyaltyPoints: 0,
            walletBalance: 0,
            allergens: []
        },
        $unset: { email: 1, profileImage: 1, fcmTokens: 1, fcmTokenMobile: 1, dateOfBirth: 1, anniversary: 1, gender: 1, whatsappNumber: 1, registeredAddress: 1, deliveryAddress: 1, billingEmail: 1, companyNip: 1, companyName: 1, referredBy: 1 }
    }, { strict: false });

    // 5. Confirmation e-mail (the address is then erased from the request too).
    let confirmationSent = false;
    if (request.contactEmail) {
        try {
            const { queueEmail } = await import('../../email/email.service.js');
            await queueEmail({
                to: request.contactEmail,
                subjectKey: 'Your account has been deleted',
                bodyKey: 'As you asked, we have deleted your personal data from DailyMealBox. Order and invoice records are kept in anonymous form because the law requires it. Thank you for having been with us.',
                ownerType: 'USER',
                ownerId: userId
            });
            confirmationSent = true;
        } catch (err) {
            logger.warn(`GDPR confirmation email failed: ${err.message}`);
        }
    }

    request.status = 'completed';
    request.completedAt = now;
    request.completedBy = String(adminId || '');
    request.anonId = anon;
    request.contactEmail = '';
    request.checklist = { piiDeleted: true, ordersAnonymised: true, invoicesRetained: true, confirmationSent };
    request.summary = { ordersAnonymised: orders.modifiedCount, subscriptionsAnonymised: subsRes.modifiedCount };
    await request.save();
    logger.info(`GDPR deletion completed for ${anon} (request ${request._id})`);
    return { request: request.toObject(), alreadyCompleted: false };
};

/** Daily job: requests still open after 25 days are escalated to the Super Admin (the EU deadline is 30 days). */
export const escalateOverdueRequests = async (now = new Date()) => {
    const cutoff = new Date(now.getTime() - GDPR_ESCALATE_AFTER_DAYS * DAY);
    const due = await DMBGdprRequest.find({ status: 'pending', escalatedAt: null, requestedAt: { $lte: cutoff } });
    let escalated = 0;
    for (const r of due) {
        r.escalatedAt = now;
        await r.save();
        try {
            const { raiseAdminAlert } = await import('../platform/platformConfig.service.js');
            await raiseAdminAlert({
                type: 'gdpr_escalation', severity: 'critical',
                title: 'GDPR deletion request is about to miss the 30-day deadline',
                message: `Open for ${GDPR_ESCALATE_AFTER_DAYS}+ days, ${Math.max(0, daysLeft(r.dueAt, now))} day(s) left. Escalated to the Super Admin.`,
                entityType: 'DMBGdprRequest', entityId: r._id, link: '/admin/food/dmb/gdpr', dedupeKey: `gdpr-escalation:${r._id}`
            });
        } catch (err) {
            logger.warn(`GDPR escalation alert failed: ${err.message}`);
        }
        escalated++;
    }
    return { escalated };
};
