import mongoose from 'mongoose';
import { FoodUser } from '../../../core/users/user.model.js';
import { DMBCustomerSegment } from './segment.model.js';
import { assertEnabled, raiseAdminAlert, zoneIdsForCity } from '../platform/platformConfig.service.js';
import { notifyMany } from '../notifications/notify.js';

/**
 * Admin-side customer tools:
 *   Gap Y — customer segments (ACM-160): CRUD, assign/unassign, member list, targeted push.
 *   Gap F — bad-debt report: daily flagging, CS actions (note, COD block, subscription block, escalate, chargebacks).
 */

export class CustomerAdminError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const validIds = (ids) => [...new Set((ids || []).map(String))].filter((id) => mongoose.Types.ObjectId.isValid(id));

// ─── Gap Y: segments ──────────────────────────────────────────────────────────────────────────────────────

export const listSegments = async () => {
    const segments = await DMBCustomerSegment.find({}).sort({ name: 1 }).lean();
    const counts = await FoodUser.aggregate([{ $match: { segmentIds: { $exists: true, $ne: [] } } }, { $unwind: '$segmentIds' }, { $group: { _id: '$segmentIds', n: { $sum: 1 } } }]);
    const byId = new Map(counts.map((c) => [String(c._id), c.n]));
    return segments.map((s) => ({ ...s, members: byId.get(String(s._id)) || 0 }));
};

export const createSegment = async ({ name, description, color }, adminId) => {
    await assertEnabled('customerSegments', {}, 'Customer segments are switched off (ACM-160)');
    if (!String(name || '').trim()) throw new CustomerAdminError('Segment name is required');
    try {
        return (await DMBCustomerSegment.create({ name: String(name).trim(), description, color, createdBy: adminId })).toObject();
    } catch (err) {
        if (err.code === 11000) throw new CustomerAdminError('A segment with this name already exists');
        throw err;
    }
};

export const updateSegment = async (id, { name, description, color }) => {
    const seg = await DMBCustomerSegment.findById(id);
    if (!seg) throw new CustomerAdminError('Segment not found', 404);
    if (name !== undefined) seg.name = String(name).trim();
    if (description !== undefined) seg.description = description;
    if (color !== undefined) seg.color = color;
    await seg.save();
    return seg.toObject();
};

export const deleteSegment = async (id) => {
    await FoodUser.updateMany({ segmentIds: oid(id) }, { $pull: { segmentIds: oid(id) } });
    await DMBCustomerSegment.deleteOne({ _id: id });
    return { deleted: true };
};

export const setSegmentMembers = async (id, { add = [], remove = [] }) => {
    await assertEnabled('customerSegments', {}, 'Customer segments are switched off (ACM-160)');
    if (!(await DMBCustomerSegment.exists({ _id: id }))) throw new CustomerAdminError('Segment not found', 404);
    const a = validIds(add).map(oid);
    const r = validIds(remove).map(oid);
    if (a.length) await FoodUser.updateMany({ _id: { $in: a } }, { $addToSet: { segmentIds: oid(id) } });
    if (r.length) await FoodUser.updateMany({ _id: { $in: r } }, { $pull: { segmentIds: oid(id) } });
    return { added: a.length, removed: r.length };
};

export const segmentMembers = async (id, { page = 1, limit = 50, search = '' } = {}) => {
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const filter = { segmentIds: oid(id) };
    if (search) filter.$or = [{ name: { $regex: String(search).trim(), $options: 'i' } }, { phone: { $regex: String(search).replace(/[^\d+]/g, ''), $options: 'i' } }];
    const [members, total] = await Promise.all([
        FoodUser.find(filter).select('name phone email subscriptionStatus createdAt').sort({ name: 1 }).skip((Math.max(Number(page) || 1, 1) - 1) * lim).limit(lim).lean(),
        FoodUser.countDocuments(filter)
    ]);
    return { members, total };
};

/** Targeted campaign push to a segment (respects customer preferences: sent as a promotion). */
export const pushToSegment = async (id, { title, body, link = '/user/plans' }) => {
    await assertEnabled('customerSegments', {}, 'Customer segments are switched off (ACM-160)');
    if (!String(title || '').trim() || !String(body || '').trim()) throw new CustomerAdminError('Title and message are required');
    const users = await FoodUser.find({ segmentIds: oid(id), isActive: { $ne: false } }).select('_id').lean();
    const res = await notifyMany(users.map((u) => ({ id: u._id })), { to: 'customer', event: 'promotion', title: String(title).slice(0, 80), body: String(body).slice(0, 300), link });
    return { recipients: users.length, delivered: res.sent };
};

// ─── Gap F: bad debt ─────────────────────────────────────────────────────────────────────────────────────

export const BAD_DEBT_RULES = { paymentFailures: 3, paymentFailureDays: 90, refundRequests: 3, refundDays: 60, chargebacks: 1 };

/** Recomputes one customer's counters and flag. Manual blocks are kept until Customer Service lifts them. */
export const evaluateCustomer = async (userId, now = new Date()) => {
    const { PaymentTransaction } = await import('../../payments/payments.models.js');
    const { AdminComplaint } = await import('../../food/admin/models/complaint.model.js');
    const since90 = new Date(now.getTime() - BAD_DEBT_RULES.paymentFailureDays * 86_400_000);
    const since60 = new Date(now.getTime() - BAD_DEBT_RULES.refundDays * 86_400_000);
    const [failures, complaintRefunds, refundedTx, user] = await Promise.all([
        PaymentTransaction.countDocuments({ ownerId: userId, status: 'failed', createdAt: { $gte: since90 } }),
        AdminComplaint.find({ customerId: userId, createdAt: { $gte: since60 }, $or: [{ refundType: { $in: ['full', 'partial'] } }, { refundStatus: { $in: ['pending', 'processed'] } }] }).select('refundAmount').lean(),
        PaymentTransaction.find({ ownerId: userId, 'refunds.0': { $exists: true } }).select('refunds currency').lean(),
        FoodUser.findById(userId).select('badDebt').lean()
    ]);
    const txRefunds = refundedTx.flatMap((t) => (t.refunds || []).filter((r) => new Date(r.createdAt || r.at || 0) >= since60));
    const refundRequests = complaintRefunds.length + txRefunds.length;
    const chargebacks = user?.badDebt?.chargebacks || 0;
    const reasons = [];
    if (failures >= BAD_DEBT_RULES.paymentFailures) reasons.push(`${failures} payment failures in 90 days`);
    if (refundRequests >= BAD_DEBT_RULES.refundRequests) reasons.push(`${refundRequests} refund requests in 60 days`);
    if (chargebacks >= BAD_DEBT_RULES.chargebacks) reasons.push(`${chargebacks} disputed chargeback(s)`);
    const debtAmount = Math.round((complaintRefunds.reduce((s, c) => s + (c.refundAmount || 0), 0)
        + txRefunds.reduce((s, r) => s + (Number(r.amountMinor || 0) / 100 || Number(r.amount) || 0), 0)
        + (user?.badDebt?.chargebackAmount || 0)) * 100) / 100;
    const manual = user?.badDebt?.flaggedBy && user.badDebt.flaggedBy !== 'system';
    const flagged = reasons.length > 0 || Boolean(manual && user?.badDebt?.flagged);
    const set = {
        'badDebt.paymentFailures90d': failures,
        'badDebt.refundRequests60d': refundRequests,
        'badDebt.debtAmount': debtAmount,
        'badDebt.reasons': reasons,
        'badDebt.flagged': flagged,
        'badDebt.lastCheckedAt': now
    };
    if (flagged && !user?.badDebt?.flagged) {
        set['badDebt.flaggedAt'] = now;
        set['badDebt.flaggedBy'] = 'system';
    }
    await FoodUser.updateOne({ _id: userId }, { $set: set });
    return { flagged, reasons, failures, refundRequests, chargebacks, debtAmount, newlyFlagged: flagged && !user?.badDebt?.flagged };
};

/** Daily job: every customer with recent failures / refunds / chargebacks, plus everyone already flagged. */
export const runBadDebtCheck = async (now = new Date()) => {
    const { PaymentTransaction } = await import('../../payments/payments.models.js');
    const { AdminComplaint } = await import('../../food/admin/models/complaint.model.js');
    const since90 = new Date(now.getTime() - 90 * 86_400_000);
    const ids = new Set([
        ...(await PaymentTransaction.distinct('ownerId', { ownerType: 'user', status: 'failed', createdAt: { $gte: since90 } })).map(String),
        ...(await PaymentTransaction.distinct('ownerId', { ownerType: 'user', 'refunds.0': { $exists: true }, updatedAt: { $gte: since90 } })).map(String),
        ...(await AdminComplaint.distinct('customerId', { createdAt: { $gte: since90 }, refundType: { $in: ['full', 'partial'] } })).filter(Boolean).map(String),
        ...(await FoodUser.distinct('_id', { $or: [{ 'badDebt.flagged': true }, { 'badDebt.chargebacks': { $gt: 0 } }] })).map(String)
    ]);
    let flagged = 0;
    for (const id of ids) {
        const res = await evaluateCustomer(id, now);
        if (res.flagged) flagged++;
        if (res.newlyFlagged) {
            await raiseAdminAlert({
                type: 'bad_debt', severity: res.chargebacks ? 'critical' : 'warning',
                title: 'Customer flagged as bad debt', message: res.reasons.join('; '),
                entityType: 'FoodUser', entityId: id, link: '/admin/food/dmb/bad-debt', dedupeKey: `bad_debt:${id}:${now.toISOString().slice(0, 7)}`
            });
        }
    }
    return { checked: ids.size, flagged };
};

const recommendedAction = (b) => {
    if ((b.chargebacks || 0) > 0) return 'Block new subscriptions and escalate to Super Admin';
    if ((b.paymentFailures90d || 0) >= 3) return 'Block cash on delivery; require prepaid';
    if ((b.refundRequests60d || 0) >= 3) return 'Review complaints history before further refunds';
    return 'Monitor';
};

/** AP-11 report. City Managers see their own city only (customers whose latest subscription is in its zones). */
export const badDebtReport = async ({ cityId = null, page = 1, limit = 50 } = {}) => {
    const filter = { 'badDebt.flagged': true };
    if (cityId) {
        const { DMBSubscription } = await import('../subscription/subscription.model.js');
        const zones = await zoneIdsForCity(cityId);
        const ids = await DMBSubscription.distinct('userId', { zoneId: { $in: zones.map(oid) } });
        filter._id = { $in: ids };
    }
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const [rows, total] = await Promise.all([
        FoodUser.find(filter).select('name phone badDebt updatedAt subscriptionStatus').sort({ 'badDebt.flaggedAt': -1 }).skip((Math.max(Number(page) || 1, 1) - 1) * lim).limit(lim).lean(),
        FoodUser.countDocuments(filter)
    ]);
    const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
    const out = [];
    for (const u of rows) {
        const last = await DMBDailyOrder.findOne({ userId: u._id }).sort({ deliveryDate: -1 }).select('deliveryDate').lean();
        const parts = String(u.name || '').trim().split(/\s+/);
        out.push({
            userId: u._id,
            alias: parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : (parts[0] || 'Customer'),
            phoneTail: String(u.phone || '').slice(-3),
            failures: u.badDebt?.paymentFailures90d || 0,
            refunds: u.badDebt?.refundRequests60d || 0,
            chargebacks: u.badDebt?.chargebacks || 0,
            debtAmount: u.badDebt?.debtAmount || 0,
            lastActive: last?.deliveryDate || u.updatedAt,
            reasons: u.badDebt?.reasons || [],
            codBlocked: Boolean(u.badDebt?.codBlocked),
            subscriptionBlocked: Boolean(u.badDebt?.subscriptionBlocked),
            escalated: Boolean(u.badDebt?.escalated),
            notes: u.badDebt?.notes || [],
            recommendedAction: recommendedAction(u.badDebt || {})
        });
    }
    return { rules: BAD_DEBT_RULES, total, customers: out };
};

/** CS actions on a customer: note | cod_block | cod_unblock | subscription_block | subscription_unblock | escalate | chargeback | clear */
export const badDebtAction = async (userId, { action, note, amount, reference }, admin) => {
    const user = await FoodUser.findById(userId).select('name badDebt');
    if (!user) throw new CustomerAdminError('Customer not found', 404);
    const by = admin?.email || 'admin';
    user.badDebt = user.badDebt || {};
    const addNote = (text) => {
        user.badDebt.notes = [...(user.badDebt.notes || []), { text: String(text).slice(0, 500), by, at: new Date() }];
    };
    switch (action) {
        case 'note':
            if (!String(note || '').trim()) throw new CustomerAdminError('Write a note');
            addNote(note);
            break;
        case 'cod_block': user.badDebt.codBlocked = true; addNote(note || 'COD blocked'); break;
        case 'cod_unblock': user.badDebt.codBlocked = false; addNote(note || 'COD unblocked'); break;
        case 'subscription_block': user.badDebt.subscriptionBlocked = true; addNote(note || 'New subscriptions blocked'); break;
        case 'subscription_unblock': user.badDebt.subscriptionBlocked = false; addNote(note || 'New subscriptions allowed'); break;
        case 'escalate':
            user.badDebt.escalated = true;
            addNote(note || 'Escalated to Super Admin');
            await raiseAdminAlert({ type: 'bad_debt_escalation', severity: 'critical', title: `Bad-debt escalation: ${user.name || 'customer'}`, message: note || 'Customer Service escalated this customer', entityType: 'FoodUser', entityId: userId, link: '/admin/food/dmb/bad-debt' });
            break;
        case 'chargeback':
            user.badDebt.chargebacks = (user.badDebt.chargebacks || 0) + 1;
            user.badDebt.chargebackAmount = (user.badDebt.chargebackAmount || 0) + Math.max(0, Number(amount) || 0);
            addNote(`Chargeback recorded${reference ? ` (${reference})` : ''}${amount ? `: ${amount}` : ''}`);
            break;
        case 'clear':
            user.badDebt.flagged = false;
            user.badDebt.flaggedBy = by;
            user.badDebt.codBlocked = false;
            user.badDebt.subscriptionBlocked = false;
            user.badDebt.escalated = false;
            addNote(note || 'Flag cleared');
            break;
        case 'flag':
            user.badDebt.flagged = true;
            user.badDebt.flaggedBy = by;
            user.badDebt.flaggedAt = new Date();
            addNote(note || 'Flagged manually');
            break;
        default:
            throw new CustomerAdminError('Unknown action');
    }
    user.markModified('badDebt');
    await user.save();
    if (action === 'chargeback') await evaluateCustomer(userId);
    return (await FoodUser.findById(userId).select('badDebt').lean()).badDebt;
};
