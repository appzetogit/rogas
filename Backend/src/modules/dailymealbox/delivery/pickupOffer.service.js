import { getIO } from '../../../config/socket.js';
import { logger } from '../../../utils/logger.js';
import { sendNotificationToUser } from '../../../core/notifications/notification.service.js';
import { msg } from '../../i18n/i18n.service.js';

/**
 * Offers a vendor's pickup batch to drivers over two channels:
 *  - socket  → `new_delivery_request` into the driver's room (instant pop-up while the app is open), and
 *  - FCM push → reaches drivers whose app is closed / socket dropped.
 *
 * mode 'initial' (vendor just marked ready): socket to everyone AND push to everyone, so a missed socket event is
 *   never the only chance a driver gets.
 * mode 'resend' (vendor pressed "Resend"): socket to everyone, push only to drivers with no live socket right now.
 */

const roomOf = (driverId) => `delivery:${String(driverId)}`;

/** Driver ids (as strings) that currently have at least one live socket in their room. */
const connectedDriverIds = async (io, driverIds) => {
    const live = new Set();
    if (!io) return live;
    await Promise.all(driverIds.map(async (id) => {
        try {
            const sockets = await io.in(roomOf(id)).fetchSockets();
            if (sockets.length > 0) live.add(String(id));
        } catch (err) {
            logger.warn(`[PICKUP-OFFER] socket presence check failed for ${id}: ${err.message}`);
        }
    }));
    return live;
};

export const offerPickupToDrivers = async ({ driverIds, batch, vendor, payload, mode = 'initial' }) => {
    const ids = [...new Set((driverIds || []).map(String))];
    const summary = { drivers: ids.length, socketLive: 0, pushAttempted: 0, pushDelivered: 0, unreachable: 0 };
    if (ids.length === 0) return summary;

    const io = getIO();
    const live = await connectedDriverIds(io, ids);
    summary.socketLive = live.size;

    if (io && payload) {
        for (const id of ids) io.to(roomOf(id)).emit('new_delivery_request', payload);
    }

    const pushTargets = mode === 'resend' ? ids.filter((id) => !live.has(id)) : ids;
    const data = {
        screen: 'pickup_request',
        event: 'new_delivery_request',
        batch_id: batch.batchId,
        vendor_id: String(vendor?._id || batch.vendorId || ''),
        vendor_name: vendor?.restaurantName || '',
        vendor_address: vendor?.addressLine1 || '',
        box_count: batch.boxCount,
        slot: batch.deliverySlot,
        total_earnings: payload?.totalEarnings ?? '',
        link: `/food/delivery?batch=${encodeURIComponent(batch.batchId)}`,
        targetUrl: `/food/delivery?batch=${encodeURIComponent(batch.batchId)}`
    };

    const pushed = await Promise.all(pushTargets.map(async (id) => {
        summary.pushAttempted += 1;
        try {
            const res = await sendNotificationToUser({
                recipientId: id,
                recipientType: 'driver',
                title: msg('New pickup request 🍱'),
                body: msg('{{count}} boxes to collect from {{vendor}} ({{slot}}). Open the app to accept.', {
                    count: batch.boxCount,
                    vendor: vendor?.restaurantName || '',
                    slot: batch.deliverySlot
                }),
                data,
                canDisable: false
            });
            return Number(res?.successCount) > 0;
        } catch (err) {
            logger.warn(`[PICKUP-OFFER] push to driver ${id} failed: ${err.message}`);
            return false;
        }
    }));
    summary.pushDelivered = pushed.filter(Boolean).length;
    // Reached by neither channel: no live socket and no push delivered.
    summary.unreachable = ids.filter((id, i) => {
        const pi = pushTargets.indexOf(id);
        return !live.has(id) && !(pi >= 0 && pushed[pi]);
    }).length;

    logger.info(`[PICKUP-OFFER] batch ${batch.batchId} (${mode}): ${JSON.stringify(summary)}`);
    return summary;
};
