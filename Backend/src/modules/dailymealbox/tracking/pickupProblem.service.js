import mongoose from 'mongoose';
import { localToday, addDays } from '../../../utils/platformTime.js';
import { CollectionBatch } from '../delivery/collectionBatch.model.js';
import { notify } from '../notifications/notify.js';
import { msg } from '../../i18n/i18n.service.js';
import { raiseAdminAlert, updateAdminAlertStatus } from '../platform/platformConfig.service.js';
import { DMBAdminAlert } from '../platform/platform.models.js';

/**
 * A driver's problem at the vendor, before the box is collected ("problem at merchant").
 *  - blocking reasons (items missing, vendor closed, refused handover, other) stop the collection PIN from being accepted
 *    until an admin clears the alert: "resume" lets the same driver carry on, "release_driver" frees the pickup so the
 *    vendor can send it to another driver.
 *  - non-blocking reasons (order not ready yet, vendor not answering) only tell admin and the vendor; the driver may keep
 *    waiting and collect as soon as the box is handed over.
 * Admin sees it on the Alerts page (type pickup_problem) with the reason, note and photo.
 */

export const PICKUP_REASONS = {
    order_not_ready: { blocking: false, photoRequired: false, noteRequired: false, label: 'Order is not ready yet' },
    vendor_unreachable: { blocking: false, photoRequired: false, noteRequired: false, label: 'Nobody is answering at the vendor' },
    items_missing: { blocking: true, photoRequired: true, noteRequired: false, label: 'Items missing or wrong' },
    vendor_closed: { blocking: true, photoRequired: true, noteRequired: false, label: 'Vendor is closed' },
    vendor_refused: { blocking: true, photoRequired: false, noteRequired: false, label: 'Vendor refused to hand over the order' },
    other: { blocking: true, photoRequired: false, noteRequired: true, label: 'Other problem' }
};

export class PickupProblemError extends Error {
    constructor(message, statusCode = 400, code = 'PICKUP_PROBLEM') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
    }
}

/** The batch a driver is collecting from this vendor in this slot today (same lookup the collection-PIN route uses). */
export const findPickupBatch = async ({ driverId, vendorId, slot }) => {
    const today = localToday(); // UTC midnight of the platform's calendar day, as batches are stored
    const tomorrow = addDays(today, 1);
    let batch = null;
    if (vendorId && slot && mongoose.Types.ObjectId.isValid(String(vendorId))) {
        batch = await CollectionBatch.findOne({ vendorId, deliveryDate: { $gte: today, $lt: tomorrow }, deliverySlot: slot, status: { $nin: ['collected', 'failed'] } });
    }
    if (!batch) batch = await CollectionBatch.findOne({ driverId, status: { $in: ['driver_assigned', 'pending'] } });
    return batch;
};

/** The open blocking problem on a batch, if any. */
export const openBlockingIssue = (batch) => (batch?.pickupIssues || []).find((i) => i.status === 'open' && i.blocking) || null;

export const reportPickupProblem = async ({ driverId, vendorId, slot, reason, note, photoUrl }) => {
    const def = PICKUP_REASONS[reason];
    if (!def) throw new PickupProblemError('Choose what the problem is');
    const text = String(note || '').trim().slice(0, 300);
    if (def.noteRequired && !text) throw new PickupProblemError('Describe the problem');
    const photo = String(photoUrl || '');
    const hasPhoto = /^https?:\/\//i.test(photo);
    if (def.photoRequired && !hasPhoto) throw new PickupProblemError('A photo is required for this problem');

    const batch = await findPickupBatch({ driverId, vendorId, slot });
    if (!batch) throw new PickupProblemError('No active pickup found', 404, 'NOT_FOUND');
    if (!batch.driverId || String(batch.driverId) !== String(driverId)) throw new PickupProblemError('This pickup is not assigned to you', 403, 'NOT_ASSIGNED');

    const already = batch.pickupIssues.find((i) => i.status === 'open' && i.reason === reason);
    if (already) return { issueId: String(already._id), blocking: def.blocking, alreadyReported: true };

    batch.pickupIssues.push({ reason, blocking: def.blocking, note: text, photoUrl: hasPhoto ? photo : '', reportedBy: driverId });
    await batch.save();
    const issue = batch.pickupIssues[batch.pickupIssues.length - 1];

    const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const [driver, vendor] = await Promise.all([
        FoodDeliveryPartner.findById(driverId).select('name').lean(),
        FoodRestaurant.findById(batch.vendorId).select('restaurantName zoneId').lean()
    ]);
    await raiseAdminAlert({
        type: 'pickup_problem', severity: def.blocking ? 'critical' : 'warning',
        title: `Pickup problem at ${vendor?.restaurantName || 'a vendor'} (${batch.batchId})`,
        message: `${def.label} — driver ${driver?.name || ''}${text ? `: ${text}` : ''}`,
        entityType: 'CollectionBatch', entityId: batch._id, link: '/admin/food/dmb/alerts',
        data: { batchId: batch.batchId, issueId: String(issue._id), reason, blocking: def.blocking, note: text, photoUrl: issue.photoUrl, driverId: String(driverId), vendorId: String(batch.vendorId) },
        dedupeKey: `pickup:${batch._id}:${issue._id}`
    });
    await notify({
        to: 'vendor', id: batch.vendorId, event: 'pickup_problem',
        title: msg('The driver reported a problem at pickup'),
        body: msg('Driver {{driver}} reported: {{problem}}. Support has been told.', { driver: driver?.name || '', problem: def.label }),
        data: { batchId: batch.batchId }
    });
    try {
        const { getIO } = await import('../../../config/socket.js');
        getIO()?.to(`vendor_${batch.vendorId}`).emit('pickup_problem_reported', { batchId: batch.batchId, reason, blocking: def.blocking });
    } catch { /* sockets optional */ }
    return { issueId: String(issue._id), blocking: def.blocking, alreadyReported: false };
};

/**
 * Admin answer to a pickup_problem alert.
 *   resume         - the problem is cleared, the driver may collect.
 *   release_driver - the driver is taken off this pickup; the vendor can send it to another driver (Resend).
 */
export const resolvePickupProblem = async ({ alertId, action, adminId }) => {
    if (!['resume', 'release_driver'].includes(action)) throw new PickupProblemError('Choose what to do with this pickup');
    const alert = await DMBAdminAlert.findById(alertId).lean();
    if (!alert || alert.type !== 'pickup_problem') throw new PickupProblemError('Alert not found', 404, 'NOT_FOUND');
    const batch = await CollectionBatch.findById(alert.entityId);
    if (batch) {
        const now = new Date();
        const close = (i) => { i.status = 'resolved'; i.resolvedAt = now; i.resolvedBy = adminId || null; i.resolution = action; };
        const issue = batch.pickupIssues.id(alert.data?.issueId);
        if (issue && issue.status === 'open') close(issue);
        const driverId = batch.driverId;
        if (action === 'release_driver' && batch.status !== 'collected') {
            batch.driverId = null;
            batch.status = 'pending';
            batch.assignedAt = null;
            // The driver is taken off this pickup, so none of his other open reports on it can keep blocking.
            batch.pickupIssues.forEach((i) => { if (i.status === 'open') close(i); });
        }
        await batch.save();
        if (driverId) {
            await notify({
                to: 'driver', id: driverId, event: 'pickup_problem',
                title: action === 'resume' ? msg('You can continue the pickup') : msg('You have been released from this pickup'),
                body: action === 'resume' ? msg('Support cleared the problem. Collect the order with the PIN.') : msg('Support released you from this pickup. Another driver will collect it.'),
                data: { batchId: batch.batchId }
            });
        }
        if (action === 'release_driver') {
            await notify({
                to: 'vendor', id: batch.vendorId, event: 'pickup_problem',
                title: msg('Pickup request reopened'),
                body: msg('The driver was released from this pickup. Press Resend to send it to another driver.'),
                data: { batchId: batch.batchId }
            });
        }
    }
    return updateAdminAlertStatus(alertId, 'resolved', adminId);
};
