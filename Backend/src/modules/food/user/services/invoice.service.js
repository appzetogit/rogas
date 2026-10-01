import PDFDocument from 'pdfkit';
import { DMBSubscription } from '../../../dailymealbox/subscription/subscription.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import mongoose from 'mongoose';

export async function generateInvoicePdf(subscriptionId, user) {
    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
        throw new ValidationError('Invalid subscription ID');
    }

    const subscription = await DMBSubscription.findById(subscriptionId).lean();
    if (!subscription) {
        throw new ValidationError('Subscription not found');
    }

    // Ensure it belongs to the user
    if (subscription.userId.toString() !== user._id.toString()) {
        throw new ValidationError('Access denied to this subscription');
    }

    const vendor = await FoodRestaurant.findById(subscription.vendorId).lean();
    if (!vendor) {
        throw new ValidationError('Vendor not found');
    }

    // Determine type from user preference
    const isVat = user.invoiceType === 'b2b_vat';

    if (isVat) {
        if (!user.companyName || !user.companyNip || !user.companyAddress || !user.billingEmail) {
            throw new ValidationError('Missing required billing information for Full VAT Invoice. Please update your profile settings.');
        }
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Header
    doc.fontSize(20).text(isVat ? 'Full VAT Invoice' : 'Receipt', { align: 'center' });
    doc.moveDown();

    // Invoice Details
    doc.fontSize(12).text(`Invoice Number: INV-${subscription.subscriptionId || subscription._id}`);
    doc.text(`Invoice Date: ${new Date().toLocaleDateString()}`);
    doc.moveDown();

    // Vendor Info
    doc.fontSize(14).text('Vendor Details', { underline: true });
    doc.fontSize(12).text(`Name: ${vendor.restaurantName || vendor.ownerName || 'DailyMealBox Vendor'}`);
    doc.text(`Contact: ${vendor.ownerPhone || 'N/A'}`);
    doc.text(`Address: ${vendor.location?.address || 'N/A'}`);
    doc.moveDown();

    // Customer Info
    doc.fontSize(14).text('Customer Details', { underline: true });
    if (isVat) {
        doc.fontSize(12).text(`Company Name: ${user.companyName}`);
        doc.text(`VAT Number (NIP): ${user.companyNip}`);
        doc.text(`Address: ${user.companyAddress}`);
        doc.text(`Billing Email: ${user.billingEmail}`);
        doc.text(`Contact Name: ${user.name}`);
    } else {
        doc.fontSize(12).text(`Name: ${user.name}`);
        doc.text(`Email: ${user.email}`);
    }
    doc.moveDown();

    // Subscription Info
    doc.fontSize(14).text('Subscription Details', { underline: true });
    doc.fontSize(12).text(`Plan Name: ${subscription.mealPlanName || 'DailyMealBox Plan'}`);
    doc.text(`Type: ${subscription.subscriptionType || 'Weekly'}`);
    doc.text(`Start Date: ${new Date(subscription.startDate).toLocaleDateString()}`);
    doc.text(`End Date: ${new Date(subscription.endDate).toLocaleDateString()}`);
    
    const validDays = subscription.durationDays || 0;
    doc.text(`Validity Period: ${validDays} days`);
    doc.text(`Status: ${subscription.status}`);
    doc.moveDown();

    // Financials
    doc.fontSize(14).text('Billing Details', { underline: true });
    
    // We try to pull billing info from subscription.pricing if available, else fallback
    const pricing = subscription.pricing || {};
    const currency = pricing.currency || subscription.currency || 'PLN';
    const total = pricing.totalPrice ?? subscription.totalPrice ?? subscription.planPrice ?? 0;
    const foodVat = pricing.foodVatAmount || 0;
    const deliveryVat = pricing.deliveryVatAmount || 0;
    const totalVat = foodVat + deliveryVat;
    const subtotal = total > 0 ? Math.max(0, total - totalVat) : 0;
    const basePrice = pricing.basePricePerDay ? (pricing.basePricePerDay * (validDays || 7)) : subtotal;
    const deliveryFee = pricing.deliveryFeePerDay ? (pricing.deliveryFeePerDay * (validDays || 7)) : (subscription.deliveryFee || 0);
    const platformFee = pricing.platformFeeAmount ?? pricing.platformFee ?? subscription.platformFee ?? 0;
    const discount = subscription.discountAmount || 0;

    doc.fontSize(12).text(`Subscription Amount: ${currency} ${basePrice.toFixed(2)}`);
    if (deliveryFee > 0) doc.text(`Delivery Fee: ${currency} ${deliveryFee.toFixed(2)}`);
    if (platformFee > 0) doc.text(`Platform Fee: ${currency} ${platformFee.toFixed(2)}`);
    if (discount > 0) doc.text(`Discount: -${currency} ${discount.toFixed(2)}`);
    
    if (isVat) {
        doc.moveDown();
        if (foodVat > 0) doc.text(`Food VAT: ${currency} ${foodVat.toFixed(2)}`);
        if (deliveryVat > 0) doc.text(`Delivery VAT: ${currency} ${deliveryVat.toFixed(2)}`);
        if (totalVat > 0) doc.text(`Total VAT: ${currency} ${totalVat.toFixed(2)}`);
        doc.text(`Total Excluding Tax: ${currency} ${subtotal.toFixed(2)}`);
    }

    doc.moveDown();
    doc.fontSize(14).text(`Total Paid Amount: ${currency} ${total.toFixed(2)}`, { bold: true });
    
    const paymentMethod = subscription.paymentMode || 'Prepaid/Wallet';
    const paymentStatus = subscription.paymentStatus || 'Paid';
    doc.fontSize(12).text(`Payment Method: ${paymentMethod}`);
    doc.text(`Payment Status: ${paymentStatus}`);
    
    doc.end();

    return doc;
}
