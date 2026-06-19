import * as prdAdminService from '../services/prdAdmin.service.js';

const ok = (res, message, data) => res.status(200).json({ success: true, message, data });
const created = (res, message, data) => res.status(201).json({ success: true, message, data });

export async function getRoleMatrix(_req, res, next) {
    try {
        ok(res, 'Admin role matrix fetched successfully', { roles: prdAdminService.getRoleMatrix() });
    } catch (error) {
        next(error);
    }
}

export async function listAdminUsers(req, res, next) {
    try {
        ok(res, 'Admin users fetched successfully', await prdAdminService.listAdminUsers(req.query || {}));
    } catch (error) {
        next(error);
    }
}

export async function updateAdminRole(req, res, next) {
    try {
        const admin = await prdAdminService.updateAdminRole(req.params.id, req.body || {}, req);
        if (!admin) return res.status(404).json({ success: false, message: 'Admin user not found' });
        ok(res, 'Admin role updated successfully', { admin });
    } catch (error) {
        next(error);
    }
}

export async function listAuditLogs(req, res, next) {
    try {
        ok(res, 'Audit logs fetched successfully', await prdAdminService.listAuditLogs(req.query || {}));
    } catch (error) {
        next(error);
    }
}

export async function listCities(req, res, next) {
    try {
        ok(res, 'Cities fetched successfully', await prdAdminService.listCities(req.query || {}));
    } catch (error) {
        next(error);
    }
}

export async function createCity(req, res, next) {
    try {
        created(res, 'City created successfully', { city: await prdAdminService.createCity(req.body || {}, req) });
    } catch (error) {
        next(error);
    }
}

export async function updateCity(req, res, next) {
    try {
        const city = await prdAdminService.updateCity(req.params.id, req.body || {}, req);
        if (!city) return res.status(404).json({ success: false, message: 'City not found' });
        ok(res, 'City updated successfully', { city });
    } catch (error) {
        next(error);
    }
}

export async function getCityChecklist(req, res, next) {
    try {
        const data = await prdAdminService.getCityChecklist(req.params.id);
        if (!data) return res.status(404).json({ success: false, message: 'City not found' });
        ok(res, 'City activation checklist fetched successfully', data);
    } catch (error) {
        next(error);
    }
}

export async function listFeatureToggles(req, res, next) {
    try {
        ok(res, 'Feature toggles fetched successfully', await prdAdminService.listFeatureToggles(req.query || {}));
    } catch (error) {
        next(error);
    }
}

export async function upsertFeatureToggle(req, res, next) {
    try {
        ok(res, 'Feature toggle saved successfully', { toggle: await prdAdminService.upsertFeatureToggle(req.body || {}, req) });
    } catch (error) {
        next(error);
    }
}

export async function rollbackFeatureToggle(req, res, next) {
    try {
        const toggle = await prdAdminService.rollbackFeatureToggle(req.params.id, req);
        if (!toggle) return res.status(404).json({ success: false, message: 'Feature toggle not found' });
        ok(res, 'Feature toggle rolled back successfully', { toggle });
    } catch (error) {
        next(error);
    }
}

export async function listIntegrations(req, res, next) {
    try {
        ok(res, 'Integration settings fetched successfully', await prdAdminService.listIntegrations(req.query || {}));
    } catch (error) {
        next(error);
    }
}

export async function upsertIntegration(req, res, next) {
    try {
        ok(res, 'Integration setting saved successfully', { integration: await prdAdminService.upsertIntegration(req.body || {}, req) });
    } catch (error) {
        next(error);
    }
}

export async function listEnvironments(_req, res, next) {
    try {
        ok(res, 'Environment settings fetched successfully', await prdAdminService.listEnvironments());
    } catch (error) {
        next(error);
    }
}

export async function upsertEnvironment(req, res, next) {
    try {
        ok(res, 'Environment setting saved successfully', { environment: await prdAdminService.upsertEnvironment(req.body || {}, req) });
    } catch (error) {
        next(error);
    }
}

export async function listOtaConfigs(req, res, next) {
    try {
        ok(res, 'OTA configs fetched successfully', await prdAdminService.listOtaConfigs(req.query || {}));
    } catch (error) {
        next(error);
    }
}

export async function createOtaConfig(req, res, next) {
    try {
        created(res, 'OTA config created successfully', { config: await prdAdminService.createOtaConfig(req.body || {}, req) });
    } catch (error) {
        next(error);
    }
}

export async function publishOtaConfig(req, res, next) {
    try {
        const config = await prdAdminService.publishOtaConfig(req.params.id, req);
        if (!config) return res.status(404).json({ success: false, message: 'OTA config not found' });
        ok(res, 'OTA config published successfully', { config });
    } catch (error) {
        next(error);
    }
}

export async function getFleetDashboard(_req, res, next) {
    try {
        ok(res, 'Fleet dashboard fetched successfully', await prdAdminService.getFleetDashboard());
    } catch (error) {
        next(error);
    }
}

export async function listFleetPartners(req, res, next) {
    try {
        ok(res, 'Fleet partners fetched successfully', await prdAdminService.listFleetPartners(req.query || {}));
    } catch (error) {
        next(error);
    }
}

export async function createFleetPartner(req, res, next) {
    try {
        created(res, 'Fleet partner created successfully', { partner: await prdAdminService.createFleetPartner(req.body || {}, req) });
    } catch (error) {
        next(error);
    }
}

export async function updateFleetPartnerStatus(req, res, next) {
    try {
        const partner = await prdAdminService.updateFleetPartnerStatus(req.params.id, req.body || {}, req);
        if (!partner) return res.status(404).json({ success: false, message: 'Fleet partner not found' });
        ok(res, 'Fleet partner status updated successfully', { partner });
    } catch (error) {
        next(error);
    }
}

export async function listDriverDocuments(req, res, next) {
    try {
        ok(res, 'Driver document queue fetched successfully', await prdAdminService.listDriverDocuments(req.query || {}));
    } catch (error) {
        next(error);
    }
}

export async function upsertDriverDocument(req, res, next) {
    try {
        ok(res, 'Driver document saved successfully', { document: await prdAdminService.upsertDriverDocument(req.body || {}, req) });
    } catch (error) {
        next(error);
    }
}

export async function reviewDriverDocument(req, res, next) {
    try {
        const document = await prdAdminService.reviewDriverDocument(req.params.id, req.body || {}, req);
        if (!document) return res.status(404).json({ success: false, message: 'Driver document not found' });
        ok(res, 'Driver document reviewed successfully', { document });
    } catch (error) {
        next(error);
    }
}

export async function getOperationsSnapshot(req, res, next) {
    try {
        ok(res, 'Operations snapshot fetched successfully', await prdAdminService.getOperationsSnapshot(req.query || {}));
    } catch (error) {
        next(error);
    }
}

export async function getFraudAlerts(req, res, next) {
    try {
        ok(res, 'Fraud alerts fetched successfully', await prdAdminService.getFraudAlerts(req.query || {}));
    } catch (error) {
        next(error);
    }
}

export async function createManualOrder(req, res, next) {
    try {
        created(res, 'Manual order created successfully', await prdAdminService.createManualOrder(req.body || {}, req));
    } catch (error) {
        next(error);
    }
}
