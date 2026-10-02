import { getControl } from './platformConfig.service.js';

/**
 * Information visibility (Gap O, ACM-131 → ACM-145, ACM-167).
 * Enforced on the server: a hidden field is removed or masked in the API response itself, so it can never be read
 * from the app. The EU-locked items (final price, B2B VAT invoice breakdown, B2C receipt total, GDPR notice) are not
 * controls at all and are never touched here.
 */

const KEYS = {
    customer: ['visCustomerVat', 'visCustomerFees', 'visCustomerVendorName', 'visCustomerDriverIdentity', 'visCustomerDriverPhone', 'preparedByCredit'],
    vendor: ['visVendorCustomerName', 'visVendorCustomerPhone', 'visVendorCustomerAddress', 'visVendorCommission', 'visVendorCustomerPaid'],
    driver: ['visDriverCustomerName', 'visDriverCustomerPhone', 'visDriverOrderValue', 'visDriverEarningsBreakdown'],
    fleet: ['visFleetDriverEarnings']
};

/** { visCustomerVat: true, … } for one audience, resolved for the city of `ctx` ({ zoneId } or { cityId }). */
export const visibilityFor = async (audience, ctx = {}) => {
    const out = {};
    for (const key of KEYS[audience] || []) out[key] = Boolean((await getControl(key, ctx)).enabled);
    return out;
};

/** "Anna Kowalska" → "Anna K." */
export const maskName = (name) => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
};

/** "+48600123456" → "••• ••• 456" */
export const maskPhone = (phone) => {
    const s = String(phone || '').replace(/\s+/g, '');
    if (!s) return '';
    return `••• ••• ${s.slice(-3)}`;
};

/** Customer-facing order card: driver name/photo/phone and price lines per ACM-131/132/134/135. */
export const applyCustomerOrderVisibility = (card, vis) => {
    if (!card) return card;
    const out = { ...card };
    const partner = out.dispatch?.deliveryPartner;
    if (partner) {
        const p = { ...partner };
        if (!vis.visCustomerDriverIdentity) {
            p.name = '';
            p.profilePhoto = '';
        } else {
            p.name = maskName(p.name).split(' ')[0] || p.name; // first name only
        }
        if (!vis.visCustomerDriverPhone) p.phone = '';
        out.dispatch = { ...out.dispatch, deliveryPartner: p };
    }
    if (out.pricing && out.invoiceType !== 'b2b_vat') {
        const pr = { ...out.pricing };
        if (!vis.visCustomerVat) {
            pr.foodCost = Math.round(((pr.foodCost || 0) + (pr.foodVatAmount || 0)) * 100) / 100;
            pr.deliveryFee = Math.round(((pr.deliveryFee || 0) + (pr.deliveryVatAmount || 0)) * 100) / 100;
            delete pr.foodVat; delete pr.foodVatAmount; delete pr.deliveryVat; delete pr.deliveryVatAmount;
            pr.vatIncluded = true;
        }
        if (!vis.visCustomerFees) {
            pr.foodCost = Math.round(((pr.foodCost || 0) + (pr.deliveryFee || 0) + (pr.platformFee || 0)) * 100) / 100;
            delete pr.deliveryFee; delete pr.platformFee; delete pr.deliveryVatAmount;
            pr.feesIncluded = true;
        }
        // totalPrice (EU-locked) always stays.
        out.pricing = pr;
    }
    return out;
};

/** What a vendor may see about a customer (ACM-136/137/138). */
export const vendorCustomerView = (customer = {}, address, vis) => ({
    name: vis.visVendorCustomerName ? (customer.name || '') : maskName(customer.name),
    phone: vis.visVendorCustomerPhone ? (customer.phone || '') : '',
    ...(address !== undefined ? { address: vis.visVendorCustomerAddress ? address : null } : {})
});

/** What a driver may see about a customer (ACM-141/142). The address is always needed to deliver. */
export const driverCustomerView = (customer = {}, vis) => ({
    name: vis.visDriverCustomerName ? (customer.name || '') : maskName(customer.name),
    phone: vis.visDriverCustomerPhone ? (customer.phone || '') : ''
});

/** Order pricing as a vendor sees it (ACM-139/140). */
export const vendorPricingView = (pricing = {}, vis, commissionRate = 0.15) => {
    const food = Number(pricing.foodCost) || 0;
    const commission = Math.round(food * commissionRate * 100) / 100;
    const out = { foodCost: food, currency: pricing.currency };
    if (vis.visVendorCommission) {
        out.commission = commission;
        out.commissionRate = commissionRate;
        out.netEarning = Math.round((food - commission) * 100) / 100;
    }
    if (vis.visVendorCustomerPaid) out.customerPaid = Number(pricing.totalPrice) || 0;
    return out;
};

/** Order pricing as a driver sees it (ACM-143). */
export const driverPricingView = (pricing = {}, vis) => (vis.visDriverOrderValue ? { totalPrice: Number(pricing.totalPrice) || 0, currency: pricing.currency } : { currency: pricing.currency });
