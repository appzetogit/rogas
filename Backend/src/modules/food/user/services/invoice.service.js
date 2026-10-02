import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import { DMBSubscription } from '../../../dailymealbox/subscription/subscription.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import mongoose from 'mongoose';

/**
 * Subscription receipt / B2B VAT invoice (CA-v2-01 / CA-v2-02).
 *
 * Visibility (Gap O): B2C receipts follow ACM-131 (VAT lines), ACM-132 (fee lines), ACM-133 (vendor name) and
 * ACM-167 ("Prepared by [cook first name]"). The final total and the full B2B VAT breakdown are EU-mandatory and are
 * always printed. Track 1 cooks never appear with a NIP: the seller of record is DailyMealBox (Gap AB).
 */

const money = (currency, n) => `${currency} ${(Number(n) || 0).toFixed(2)}`;

const loadVisibility = async (zoneId) => {
    try {
        const { visibilityFor } = await import('../../../dailymealbox/platform/visibility.js');
        return await visibilityFor('customer', { zoneId });
    } catch {
        return { visCustomerVat: true, visCustomerFees: true, visCustomerVendorName: true, preparedByCredit: false };
    }
};

/** Builds the PDF for a subscription the user owns. `user` may be a FoodUser document or the JWT claims. */
export async function generateInvoicePdf(subscriptionId, user) {
    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
        throw new ValidationError('Invalid subscription ID');
    }
    const userId = user?._id || user?.userId;
    const customer = await FoodUser.findById(userId).lean();
    if (!customer) throw new ValidationError('Customer not found');

    const subscription = await DMBSubscription.findById(subscriptionId).lean();
    if (!subscription) throw new ValidationError('Subscription not found');
    if (String(subscription.userId) !== String(customer._id)) throw new ValidationError('Access denied to this subscription');
    if (subscription.status === 'pending_payment') throw new ValidationError('This subscription has not been paid yet');

    const vendor = await FoodRestaurant.findById(subscription.vendorId).lean();
    if (!vendor) throw new ValidationError('Vendor not found');

    // B2B data is taken from the subscription (what was invoiced at checkout), falling back to the profile.
    const isVat = (subscription.invoiceType || customer.invoiceType) === 'b2b_vat';
    const company = {
        name: subscription.companyName || customer.companyName,
        nip: subscription.companyNip || customer.companyNip,
        address: customer.registeredAddress || customer.companyAddress || '',
        email: subscription.billingEmail || customer.billingEmail || customer.email
    };
    if (isVat && (!company.name || !company.nip)) {
        throw new ValidationError('Missing required billing information for Full VAT Invoice. Please update your profile settings.');
    }
    const vis = await loadVisibility(subscription.zoneId);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.fontSize(20).text(isVat ? 'Full VAT Invoice' : 'Receipt', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Invoice Number: INV-${subscription.subscriptionId || subscription._id}`);
    doc.text(`Invoice Date: ${new Date(subscription.updatedAt || Date.now()).toISOString().slice(0, 10)}`);
    doc.text('Seller: DailyMealBox Sp. z o.o.');
    doc.moveDown();

    if (isVat || vis.visCustomerVendorName) {
        doc.fontSize(14).text('Meals by', { underline: true });
        doc.fontSize(12).text(vendor.restaurantName || 'DailyMealBox maker');
        doc.moveDown();
    }
    // ACM-167: credit line with the cook's first name only — never a surname or business details.
    if (vis.preparedByCredit && vendor.vendorType === 'home_cook') {
        doc.fontSize(12).text(`Prepared by ${String(vendor.ownerName || '').trim().split(/\s+/)[0] || 'our cook'}`);
        doc.moveDown();
    }

    doc.fontSize(14).text('Customer Details', { underline: true });
    if (isVat) {
        doc.fontSize(12).text(`Company Name: ${company.name}`);
        doc.text(`VAT Number (NIP): ${company.nip}`);
        if (company.address) doc.text(`Address: ${company.address}`);
        doc.text(`Billing Email: ${company.email || ''}`);
        doc.text(`Contact Name: ${customer.name || ''}`);
    } else {
        doc.fontSize(12).text(`Name: ${customer.name || ''}`);
        if (customer.email) doc.text(`Email: ${customer.email}`);
    }
    doc.moveDown();

    const cycleLabel = { one_day: 'One day', weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly', annual: 'Annual' };
    doc.fontSize(14).text('Subscription Details', { underline: true });
    doc.fontSize(12).text(`Subscription: ${subscription.subscriptionId}`);
    doc.text(`Plan: ${cycleLabel[subscription.billingCycle || subscription.duration] || subscription.duration || 'Subscription'}${subscription.familyBox?.enabled ? ' — Family Box' : ''}${subscription.subscriptionType === 'rotation' ? ' — Smart Rotation' : ''}`);
    doc.text(`Period: ${new Date(subscription.startDate).toISOString().slice(0, 10)} – ${subscription.endDate ? new Date(subscription.endDate).toISOString().slice(0, 10) : ''}`);
    if (subscription.quote?.orders) doc.text(`Deliveries: ${subscription.quote.orders}`);
    doc.moveDown();

    doc.fontSize(14).text('Billing Details', { underline: true });
    doc.fontSize(12);
    const currency = subscription.pricing?.currency || subscription.quote?.currency || 'PLN';
    const q = subscription.quote;
    const total = q?.totals?.total ?? subscription.pricing?.totalPrice ?? 0;
    if (q?.lines?.length) {
        for (const line of q.lines) {
            const isVatLine = line.key === 'food_vat' || line.key === 'delivery_vat';
            const isFeeLine = line.key === 'delivery' || line.key === 'platform_fee';
            if (!isVat && isVatLine && !vis.visCustomerVat) continue;
            if (!isVat && isFeeLine && !vis.visCustomerFees) continue;
            doc.text(`${line.label}: ${money(currency, line.amount)}`);
        }
        if (isVat) {
            const vat = (q.totals.foodVat || 0) + (q.totals.deliveryVat || 0);
            doc.moveDown();
            doc.text(`Total VAT: ${money(currency, vat)}`);
            doc.text(`Total Excluding Tax: ${money(currency, total - vat)}`);
        } else if (!vis.visCustomerVat) {
            doc.text('All prices include VAT.');
        }
    } else {
        const p = subscription.pricing || {};
        const vat = (p.foodVatAmount || 0) + (p.deliveryVatAmount || 0);
        if (isVat || vis.visCustomerVat) {
            if (p.foodVatAmount) doc.text(`Food VAT: ${money(currency, p.foodVatAmount)}`);
            if (p.deliveryVatAmount) doc.text(`Delivery VAT: ${money(currency, p.deliveryVatAmount)}`);
        }
        if (isVat) doc.text(`Total Excluding Tax: ${money(currency, total - vat)}`);
    }
    doc.moveDown();
    doc.fontSize(14).text(`Total Paid Amount: ${money(currency, total)}`);
    doc.fontSize(12).text(`Payment Method: ${subscription.paymentMethod || 'Online'}`);
    doc.end();
    return doc;
}

/** The PDF as a Buffer (for email/WhatsApp attachments). */
export const renderInvoiceBuffer = async (subscriptionId, userId) => {
    const doc = await generateInvoicePdf(subscriptionId, { _id: userId });
    const chunks = [];
    return new Promise((resolve, reject) => {
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });
};

// ─── Signed download links (WhatsApp / email attachments fetch the PDF without a login) ──────────────────────

const linkSecret = () => process.env.INVOICE_LINK_SECRET || `invoice-link:${process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || ''}`;

export const signInvoiceLink = (subscriptionId, userId, ttlSeconds = 7 * 24 * 3600) => {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = `${subscriptionId}.${userId}.${exp}`;
    const sig = crypto.createHmac('sha256', linkSecret()).update(payload).digest('hex').slice(0, 40);
    const base = String(process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
    return { url: `${base}/api/v1/dmb/invoices/${subscriptionId}/pdf?u=${userId}&exp=${exp}&sig=${sig}`, expiresAt: new Date(exp * 1000) };
};

export const verifyInvoiceLink = ({ subscriptionId, u, exp, sig }) => {
    if (!subscriptionId || !u || !exp || !sig) return false;
    if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
    const expected = crypto.createHmac('sha256', linkSecret()).update(`${subscriptionId}.${u}.${exp}`).digest('hex').slice(0, 40);
    return expected.length === String(sig).length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(sig)));
};
