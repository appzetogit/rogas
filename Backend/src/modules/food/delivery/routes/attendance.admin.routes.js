import express from 'express';
import { requirePermission } from '../../../../middleware/rbac.middleware.js';
import { adminAttendanceOverview, tomorrowConfirmationStatus } from '../services/attendance.service.js';
import { logger } from '../../../../utils/logger.js';

export const adminAttendanceRouter = express.Router();

const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        logger.error(`Admin attendance error: ${err?.message || err}`);
        res.status(500).json({ success: false, message: err?.message || 'Something went wrong' });
    }
};

// Every approved driver's attendance rate for a month (default: current month). ?maxRate=80 flags drivers below 80%.
adminAttendanceRouter.get('/overview', requirePermission('driverManagement', 'view'), handle(async (req, res) => {
    const { year, month, maxRate, fleetPartnerId } = req.query;
    const data = await adminAttendanceOverview({
        year: year !== undefined ? Number(year) : undefined,
        month: month !== undefined ? Number(month) : undefined,
        maxRate,
        fleetPartnerId: /^[a-f\d]{24}$/i.test(String(fleetPartnerId || '')) ? String(fleetPartnerId) : undefined
    });
    res.json({ success: true, data });
}));

// Confirmed vs not-yet-confirmed shifts for tomorrow (GAP Z).
adminAttendanceRouter.get('/tomorrow', requirePermission('driverManagement', 'view'), handle(async (_req, res) => {
    const data = await tomorrowConfirmationStatus();
    res.json({ success: true, data });
}));
