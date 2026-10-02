import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import { isEnabled } from '../platform/platformConfig.service.js';
import { notify } from '../notifications/notify.js';
import { msg } from '../../i18n/i18n.service.js';
import { localToday } from '../../../utils/platformTime.js';
import { logger } from '../../../utils/logger.js';

/**
 * Monthly Settlement Statements — "Rozliczenie" (Gap AB, ACM-166) — self-billing records for parties that cannot
 * invoice DailyMealBox because they trade under działalność nierejestrowana:
 *   cook           Track 1 home cooks (gross = food value of their delivered orders; 15% commission)
 *   fleet_partner  individual_unregistered delivery partners (gross = their drivers' delivery earnings) — Gap AD
 * Not a VAT invoice: VAT is always 0. Generated on the 1st at 06:00 for the previous month; PDFs are produced on
 * demand from the stored figures (identical every time). Annual summary = the 12 monthly statements (for PIT).
 */

const settlementSchema = new mongoose.Schema(
    {
        entityType: { type: String, enum: ['cook', 'fleet_partner'], required: true },
        entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        period: { type: String, required: true }, // YYYY-MM
        entityName: { type: String, default: '' },
        grossAmount: { type: Number, required: true },
        commissionRate: { type: Number, default: 0 },
        commissionAmount: { type: Number, default: 0 },
        netAmount: { type: Number, required: true },
        vatAmount: { type: Number, default: 0 },
        orderCount: { type: Number, default: 0 },
        currency: { type: String, default: 'PLN' },
        generatedAt: { type: Date, default: () => new Date() },
        number: { type: String, unique: true }
    },
    { collection: 'dmb_settlements', timestamps: true }
);
settlementSchema.index({ entityType: 1, entityId: 1, period: 1 }, { unique: true });
export const DMBSettlement = mongoose.models.DMBSettlement || mongoose.model('DMBSettlement', settlementSchema);

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
const periodBounds = (period) => {
    const [y, m] = period.split('-').map(Number);
    return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
};
export const previousPeriod = (now = new Date()) => {
    const t = localToday(now);
    const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

/** Builds (or returns the existing) statement of one cook for one month. */
export const settleCook = async (vendor, period) => {
    const existing = await DMBSettlement.findOne({ entityType: 'cook', entityId: vendor._id, period }).lean();
    if (existing) return existing;
    const { from, to: monthEnd } = periodBounds(period);
    // Settlements stop when the cook moved to Track 2: only orders before the switch count.
    let to = monthEnd;
    if (vendor.cookTrack !== 1 && vendor.cookTrackChangedAt && new Date(vendor.cookTrackChangedAt) < monthEnd) to = new Date(vendor.cookTrackChangedAt);
    if (vendor.track1JoinedAt && new Date(vendor.track1JoinedAt) >= monthEnd) return null;
    const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
    const [row] = await DMBDailyOrder.aggregate([
        { $match: { vendorId: vendor._id, status: 'delivered', deliveryDate: { $gte: from, $lt: to } } },
        { $group: { _id: null, gross: { $sum: '$pricing.foodCost' }, n: { $sum: 1 }, currency: { $first: '$pricing.currency' } } }
    ]);
    if (!row?.n) return null;
    const rate = Number(vendor.commissionRate ?? 0.15);
    const gross = r2(row.gross);
    const commission = r2(gross * rate);
    const doc = await DMBSettlement.create({
        entityType: 'cook', entityId: vendor._id, period, entityName: vendor.ownerName || vendor.restaurantName,
        grossAmount: gross, commissionRate: rate, commissionAmount: commission, netAmount: r2(gross - commission), vatAmount: 0,
        orderCount: row.n, currency: row.currency || 'PLN', number: `RZ/${period}/${String(vendor._id).slice(-6).toUpperCase()}`
    });
    return doc.toObject();
};

/** Self-billing statement for an individual (unregistered) delivery partner — their drivers' earnings that month. */
export const settleFleetPartner = async (partner, period) => {
    const existing = await DMBSettlement.findOne({ entityType: 'fleet_partner', entityId: partner._id, period }).lean();
    if (existing) return existing;
    const { from, to } = periodBounds(period);
    const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
    const driverIds = await FoodDeliveryPartner.distinct('_id', { fleetPartnerId: partner._id });
    if (!driverIds.length) return null;
    const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
    const [row] = await DMBDailyOrder.aggregate([
        { $match: { 'dispatch.deliveryPartnerId': { $in: driverIds }, status: 'delivered', deliveryDate: { $gte: from, $lt: to } } },
        { $group: { _id: null, gross: { $sum: { $add: [{ $ifNull: ['$riderEarning', 0] }, { $ifNull: ['$driverTip', 0] }] } }, n: { $sum: 1 } } }
    ]);
    if (!row?.n) return null;
    const gross = r2(row.gross);
    const doc = await DMBSettlement.create({
        entityType: 'fleet_partner', entityId: partner._id, period, entityName: partner.contactName || partner.companyName,
        grossAmount: gross, commissionRate: 0, commissionAmount: 0, netAmount: gross, vatAmount: 0, orderCount: row.n, currency: 'PLN',
        number: `RZ-F/${period}/${String(partner._id).slice(-6).toUpperCase()}`
    });
    return doc.toObject();
};

/** Job (1st of month, 06:00): statements for the previous month. ACM-166 off → nothing new (history stays). */
export const generateMonthlySettlements = async (now = new Date()) => {
    if (!(await isEnabled('settlementStatements'))) return { skipped: 'disabled' };
    const period = previousPeriod(now);
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const { from } = periodBounds(period);
    const cooks = await FoodRestaurant.find({ $or: [{ cookTrack: 1 }, { cookTrack: 2, cookTrackChangedAt: { $gte: from }, track1JoinedAt: { $ne: null } }] })
        .select('restaurantName ownerName cookTrack cookTrackChangedAt track1JoinedAt commissionRate').lean();
    let created = 0;
    for (const cook of cooks) {
        try {
            const had = await DMBSettlement.exists({ entityType: 'cook', entityId: cook._id, period });
            const res = await settleCook(cook, period);
            if (res && !had) {
                created++;
                await notify({ to: 'vendor', id: cook._id, event: 'settlement_ready', title: msg('Your settlement statement for {{period}} is ready', { period }), body: msg('Download it from Earnings. Keep it for your annual PIT return.') });
            }
        } catch (err) {
            logger.warn(`[settlements] cook ${cook._id}: ${err.message}`);
        }
    }
    const { FleetPartner } = await import('./fleetPartner.model.js');
    const individuals = await FleetPartner.find({ entityType: 'individual_unregistered' }).select('companyName contactName').lean();
    for (const p of individuals) {
        try {
            if (await settleFleetPartner(p, period)) created++;
        } catch (err) {
            logger.warn(`[settlements] fleet partner ${p._id}: ${err.message}`);
        }
    }
    return { period, created };
};

export const listSettlements = async (entityType, entityId) =>
    DMBSettlement.find({ entityType, entityId }).sort({ period: -1 }).lean();

/** Running current-month figure (the same number the ACM-162 threshold check uses). */
export const currentMonthRunning = async (vendorId) => {
    const { monthlyGross } = await import('./vendorAmendment.service.js');
    return monthlyGross(vendorId);
};

const statementHeader = (doc, title, entityName, entityLabel) => {
    doc.fontSize(18).text(title, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#555').text('Issued by DailyMealBox Sp. z o.o. on behalf of the recipient (self-billing record)', { align: 'center' });
    doc.fillColor('#000').moveDown();
    doc.fontSize(12).text(`${entityLabel}: ${entityName}`);
};

const VAT_NOTE = 'No VAT — seller not VAT-registered (działalność nierejestrowana). This statement is not a VAT invoice.';

export const renderSettlementPdf = (s) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    statementHeader(doc, 'Rozliczenie / Settlement Statement', s.entityName, s.entityType === 'cook' ? 'Cook' : 'Delivery partner');
    doc.text(`Statement number: ${s.number}`);
    doc.text(`Period: ${s.period}`);
    doc.text(`Generated: ${new Date(s.generatedAt).toISOString().slice(0, 10)}`);
    doc.moveDown();
    doc.text(`Orders: ${s.orderCount}`);
    doc.text(`Gross earnings: ${s.currency} ${s.grossAmount.toFixed(2)}`);
    doc.text(`Platform commission (${Math.round((s.commissionRate || 0) * 100)}%): -${s.currency} ${s.commissionAmount.toFixed(2)}`);
    doc.text(`VAT: ${s.currency} 0.00`);
    doc.moveDown(0.5);
    doc.fontSize(14).text(`Net amount paid: ${s.currency} ${s.netAmount.toFixed(2)}`);
    doc.moveDown();
    doc.fontSize(10).text(VAT_NOTE);
    doc.end();
    return doc;
};

export const renderAnnualPdf = (entity, year, rows) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    statementHeader(doc, `Annual summary ${year} / Podsumowanie roczne`, entity.name, entity.label);
    doc.text('For PIT-36 / PIT-37 — income from działalność nierejestrowana (or "inne źródła").');
    doc.moveDown();
    let gross = 0, commission = 0, net = 0, orders = 0;
    const currency = rows[0]?.currency || 'PLN';
    for (const r of rows) {
        doc.fontSize(11).text(`${r.period}   gross ${r.grossAmount.toFixed(2)}   commission ${r.commissionAmount.toFixed(2)}   net ${r.netAmount.toFixed(2)}   (${r.number})`);
        gross += r.grossAmount; commission += r.commissionAmount; net += r.netAmount; orders += r.orderCount;
    }
    doc.moveDown();
    doc.fontSize(12).text(`Orders: ${orders}`);
    doc.text(`Total gross: ${currency} ${r2(gross).toFixed(2)}`);
    doc.text(`Total commission: ${currency} ${r2(commission).toFixed(2)}`);
    doc.fontSize(14).text(`Total net paid: ${currency} ${r2(net).toFixed(2)}`);
    doc.moveDown();
    doc.fontSize(10).text(VAT_NOTE);
    doc.end();
    return doc;
};
