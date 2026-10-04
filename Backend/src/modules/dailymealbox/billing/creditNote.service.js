import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import { logger } from '../../../utils/logger.js';

/**
 * Credit notes for refunded B2B VAT invoices (Amendment 1 #12 - EU VAT law).
 *
 * When a payment of a subscription that was invoiced as a B2B VAT invoice is refunded, a credit note is issued
 * automatically: it references the original invoice, carries negative amounts with the VAT corrected pro rata
 * (credit_amount_ratio = refund / original total), shows both NIPs and has its own sequential number
 * CN-PL-YYYY-MM-NNNN (NNNN counts through the year). B2C receipts need no credit note.
 * Credit notes are kept 7 years and can never be edited or deleted.
 */

const lineSchema = new mongoose.Schema({ key: String, label: String, amount: Number }, { _id: false });
const creditNoteSchema = new mongoose.Schema(
    {
        creditNoteNumber: { type: String, required: true, unique: true },
        sequence: { type: Number, required: true },
        subscriptionId: { type: String, required: true, index: true },
        invoiceNumber: { type: String, required: true },
        paymentPublicId: { type: String, default: '', index: true },
        refundKey: { type: String, default: '', index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, index: true },
        currency: { type: String, default: 'PLN' },
        ratio: { type: Number, required: true },
        lines: { type: [lineSchema], default: [] },
        totals: { gross: Number, vat: Number, net: Number },
        seller: { name: String, nip: String },
        buyer: { name: String, nip: String, email: String },
        reason: { type: String, default: '' },
        issuedAt: { type: Date, default: () => new Date() },
        issuedBy: { type: String, default: '' },
        retentionUntil: { type: Date, required: true }
    },
    { collection: 'dmb_credit_notes', timestamps: true }
);

const forbid = function forbid() {
    throw new Error('Credit notes are legal documents and cannot be changed or deleted');
};
['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'replaceOne'].forEach((op) => creditNoteSchema.pre(op, forbid));
creditNoteSchema.pre('deleteOne', { document: true, query: false }, forbid);
creditNoteSchema.pre('save', function guard(next) {
    if (!this.isNew) return next(new Error('Credit notes are legal documents and cannot be changed'));
    return next();
});

export const DMBCreditNote = mongoose.models.DMBCreditNote || mongoose.model('DMBCreditNote', creditNoteSchema);

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }, { collection: 'dmb_counters' });
const Counter = mongoose.models.DMBCounter || mongoose.model('DMBCounter', counterSchema);

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const addYears = (d, y) => { const x = new Date(d); x.setUTCFullYear(x.getUTCFullYear() + y); return x; };

const nextNumber = async (when) => {
    const year = when.getUTCFullYear();
    const counter = await Counter.findOneAndUpdate({ _id: `credit-note:${year}` }, { $inc: { seq: 1 } }, { upsert: true, new: true });
    const month = String(when.getUTCMonth() + 1).padStart(2, '0');
    return { sequence: counter.seq, creditNoteNumber: `CN-PL-${year}-${month}-${String(counter.seq).padStart(4, '0')}` };
};

/**
 * Called after a provider refund succeeded. Returns the credit note, or null when none is needed/possible.
 * Never throws: a billing-document problem must not undo a refund that already happened.
 */
export const issueCreditNoteForRefund = async ({ tx, amountMinor, refundKey = '', reason = '', actor = '' }) => {
    try {
        if (!tx || tx.purpose !== 'subscription' || !tx.refs?.subscriptionId) return null;
        if (refundKey && await DMBCreditNote.exists({ refundKey })) return null; // already issued for this refund
        const { DMBSubscription } = await import('../subscription/subscription.model.js');
        const sub = await DMBSubscription.findOne({ subscriptionId: tx.refs.subscriptionId }).lean();
        if (!sub || sub.invoiceType !== 'b2b_vat') return null; // B2C receipts need no credit note

        const ratio = tx.amountMinor > 0 ? Math.min(1, amountMinor / tx.amountMinor) : 0;
        if (!(ratio > 0)) return null;
        const q = sub.quote || {};
        const totalGross = Number(q.totals?.total ?? sub.pricing?.totalPrice ?? 0);
        const vatTotal = Number(q.totals?.foodVat || 0) + Number(q.totals?.deliveryVat || 0)
            || Number(sub.pricing?.foodVatAmount || 0) + Number(sub.pricing?.deliveryVatAmount || 0);
        const gross = -r2(totalGross * ratio);
        const vat = -r2(vatTotal * ratio);
        const lines = (q.lines || []).map((l) => ({ key: l.key, label: l.label, amount: -r2(Math.abs(Number(l.amount) || 0) * ratio * (Number(l.amount) < 0 ? -1 : 1)) }));

        const { FoodUser } = await import('../../../core/users/user.model.js');
        const customer = await FoodUser.findById(sub.userId).select('name email companyName companyNip billingEmail').lean();
        const now = new Date();
        const { sequence, creditNoteNumber } = await nextNumber(now);
        const note = await DMBCreditNote.create({
            creditNoteNumber, sequence,
            subscriptionId: sub.subscriptionId,
            invoiceNumber: `INV-${sub.subscriptionId}`,
            paymentPublicId: tx.publicId || '',
            refundKey,
            userId: sub.userId,
            currency: String(tx.currency || sub.pricing?.currency || q.currency || 'PLN').toUpperCase(),
            ratio: Math.round(ratio * 10000) / 10000,
            lines,
            totals: { gross, vat, net: r2(gross - vat) },
            seller: { name: 'DailyMealBox Sp. z o.o.', nip: process.env.COMPANY_NIP || '' },
            buyer: { name: sub.companyName || customer?.companyName || customer?.name || '', nip: sub.companyNip || customer?.companyNip || '', email: sub.billingEmail || customer?.billingEmail || customer?.email || '' },
            reason: String(reason || '').slice(0, 300),
            issuedAt: now,
            issuedBy: String(actor || ''),
            retentionUntil: addYears(now, 7)
        });

        try {
            const { queueEmail } = await import('../../email/email.service.js');
            if (note.buyer.email) {
                await queueEmail({
                    to: note.buyer.email,
                    subjectKey: 'Credit note issued',
                    bodyKey: 'We issued credit note {{number}} for invoice {{invoice}} ({{amount}} {{currency}}) because of your refund. You can get the document from your DailyMealBox support team at any time.',
                    vars: { number: note.creditNoteNumber, invoice: note.invoiceNumber, amount: String(Math.abs(note.totals.gross).toFixed(2)), currency: note.currency },
                    ownerType: 'USER',
                    ownerId: sub.userId
                });
            }
        } catch (mailErr) {
            logger.warn(`Credit note email failed for ${creditNoteNumber}: ${mailErr.message}`);
        }
        logger.info(`Credit note ${creditNoteNumber} issued for ${sub.subscriptionId}`);
        return note.toObject();
    } catch (err) {
        logger.error(`Credit note could not be issued for refund of ${tx?.publicId}: ${err.message}`);
        return null;
    }
};

export const listCreditNotes = async ({ limit = 100, subscriptionId } = {}) => {
    const filter = subscriptionId ? { subscriptionId } : {};
    return DMBCreditNote.find(filter).sort({ issuedAt: -1 }).limit(Math.min(Number(limit) || 100, 500)).lean();
};

/** PDF stream of a credit note (same look as the B2B invoice, negative amounts). */
export const renderCreditNotePdf = async (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('Invalid credit note id');
    const n = await DMBCreditNote.findById(id).lean();
    if (!n) throw new Error('Credit note not found');
    const money = (v) => `${n.currency} ${Number(v || 0).toFixed(2)}`;
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.fontSize(20).text('Credit Note', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Credit Note Number: ${n.creditNoteNumber}`);
    doc.text(`Issue Date: ${new Date(n.issuedAt).toISOString().slice(0, 10)}`);
    doc.text(`Corrects Invoice: ${n.invoiceNumber}`);
    doc.moveDown();
    doc.fontSize(14).text('Seller', { underline: true });
    doc.fontSize(12).text(n.seller?.name || '');
    if (n.seller?.nip) doc.text(`NIP: ${n.seller.nip}`);
    doc.moveDown();
    doc.fontSize(14).text('Buyer', { underline: true });
    doc.fontSize(12).text(n.buyer?.name || '');
    if (n.buyer?.nip) doc.text(`NIP: ${n.buyer.nip}`);
    doc.moveDown();
    doc.fontSize(14).text('Corrected Amounts', { underline: true });
    doc.fontSize(12);
    for (const l of n.lines || []) doc.text(`${l.label}: ${money(l.amount)}`);
    doc.moveDown();
    doc.text(`Total Excluding Tax: ${money(n.totals.net)}`);
    doc.text(`VAT: ${money(n.totals.vat)}`);
    doc.fontSize(14).text(`Total Credited: ${money(n.totals.gross)}`);
    if (n.ratio < 1) doc.fontSize(10).text(`Partial credit note: ${(n.ratio * 100).toFixed(2)}% of the original invoice.`);
    if (n.reason) doc.moveDown().fontSize(10).text(`Reason: ${n.reason}`);
    doc.end();
    return { doc, filename: `${n.creditNoteNumber}.pdf` };
};
