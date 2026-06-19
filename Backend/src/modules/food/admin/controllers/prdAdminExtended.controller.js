import * as extService from '../services/prdAdminExtended.service.js';

const ok = (res, message, data) => res.status(200).json({ success: true, message, data });
const created = (res, message, data) => res.status(201).json({ success: true, message, data });

// ─── AP-04 Complaints ──────────────────────────────────────────────────────
export async function listComplaints(req, res, next) {
    try { ok(res, 'Complaints fetched', await extService.listComplaints(req.query || {})); }
    catch (e) { next(e); }
}

export async function getComplaintById(req, res, next) {
    try {
        const data = await extService.getComplaintById(req.params.id);
        if (!data) return res.status(404).json({ success: false, message: 'Complaint not found' });
        ok(res, 'Complaint fetched', data);
    } catch (e) { next(e); }
}

export async function createComplaint(req, res, next) {
    try { created(res, 'Complaint created', { complaint: await extService.createComplaint(req.body || {}, req) }); }
    catch (e) { next(e); }
}

export async function updateComplaintStatus(req, res, next) {
    try {
        const data = await extService.updateComplaintStatus(req.params.id, req.body || {}, req);
        if (!data) return res.status(404).json({ success: false, message: 'Complaint not found' });
        ok(res, 'Complaint status updated', { complaint: data });
    } catch (e) { next(e); }
}

export async function issueComplaintRefund(req, res, next) {
    try {
        const data = await extService.issueComplaintRefund(req.params.id, req.body || {}, req);
        if (!data) return res.status(404).json({ success: false, message: 'Complaint not found' });
        ok(res, 'Refund issued', { complaint: data });
    } catch (e) { next(e); }
}

export async function escalateComplaint(req, res, next) {
    try {
        const data = await extService.escalateComplaint(req.params.id, req.body || {}, req);
        if (!data) return res.status(404).json({ success: false, message: 'Complaint not found' });
        ok(res, 'Complaint escalated', { complaint: data });
    } catch (e) { next(e); }
}

export async function sendComplaintResponse(req, res, next) {
    try {
        const data = await extService.sendComplaintResponse(req.params.id, req.body || {}, req);
        if (!data) return res.status(404).json({ success: false, message: 'Complaint not found' });
        ok(res, 'Response sent', { complaint: data });
    } catch (e) { next(e); }
}

// ─── AP-07 Fleet Invoices ─────────────────────────────────────────────────
export async function listFleetInvoices(req, res, next) {
    try { ok(res, 'Fleet invoices fetched', await extService.listFleetInvoices(req.query || {})); }
    catch (e) { next(e); }
}

export async function approveFleetInvoice(req, res, next) {
    try {
        const data = await extService.approveFleetInvoice(req.params.id, req.body || {}, req);
        if (!data) return res.status(404).json({ success: false, message: 'Invoice not found' });
        ok(res, 'Fleet invoice approved', { invoice: data });
    } catch (e) { next(e); }
}

export async function rejectFleetInvoice(req, res, next) {
    try {
        const data = await extService.rejectFleetInvoice(req.params.id, req.body || {}, req);
        if (!data) return res.status(404).json({ success: false, message: 'Invoice not found' });
        ok(res, 'Fleet invoice rejected', { invoice: data });
    } catch (e) { next(e); }
}

export async function markFleetInvoicePaid(req, res, next) {
    try {
        const data = await extService.markFleetInvoicePaid(req.params.id, req.body || {}, req);
        if (!data) return res.status(404).json({ success: false, message: 'Invoice not found' });
        ok(res, 'Fleet invoice marked as paid', { invoice: data });
    } catch (e) { next(e); }
}

// ─── AP-07 VAT Report ─────────────────────────────────────────────────────
export async function getVatReport(req, res, next) {
    try { ok(res, 'VAT report fetched', await extService.getVatReport(req.query || {})); }
    catch (e) { next(e); }
}

// ─── AP-09 Employee Management ────────────────────────────────────────────
export async function createAdminEmployee(req, res, next) {
    try { created(res, 'Admin employee created', { admin: await extService.createAdminEmployee(req.body || {}, req) }); }
    catch (e) { next(e); }
}

export async function updateAdminEmployee(req, res, next) {
    try {
        const data = await extService.updateAdminEmployee(req.params.id, req.body || {}, req);
        if (!data) return res.status(404).json({ success: false, message: 'Admin employee not found' });
        ok(res, 'Admin employee updated', { admin: data });
    } catch (e) { next(e); }
}

export async function deleteAdminEmployee(req, res, next) {
    try {
        const data = await extService.deleteAdminEmployee(req.params.id, req);
        if (!data) return res.status(404).json({ success: false, message: 'Admin employee not found' });
        ok(res, 'Admin employee deactivated', data);
    } catch (e) { next(e); }
}
