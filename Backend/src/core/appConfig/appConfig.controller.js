import { AppConfig } from './appConfig.model.js';

export const getAppConfigs = async (req, res) => {
    try {
        const configs = await AppConfig.find();
        res.status(200).json({ success: true, data: configs });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

export const getAppConfigByName = async (req, res) => {
    try {
        const { appName } = req.params;
        const config = await AppConfig.findOne({ appName });
        if (!config) {
            return res.status(404).json({ success: false, message: 'Config not found' });
        }
        res.status(200).json({ success: true, data: config });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

export const updateAppConfig = async (req, res) => {
    try {
        const { appName } = req.params;
        const { primaryColor, secondaryColor, logoUrl, fontFamily, backgroundColor, textColor, slotTimings } = req.body;
        
        let config = await AppConfig.findOne({ appName });
        if (!config) {
            config = new AppConfig({ appName, primaryColor, secondaryColor, logoUrl, fontFamily, backgroundColor, textColor });
        } else {
            if (primaryColor) config.primaryColor = primaryColor;
            if (secondaryColor) config.secondaryColor = secondaryColor;
            if (logoUrl !== undefined) config.logoUrl = logoUrl;
            if (fontFamily) config.fontFamily = fontFamily;
            if (backgroundColor !== undefined) config.backgroundColor = backgroundColor;
            if (textColor !== undefined) config.textColor = textColor;
            if (slotTimings) {
                config.slotTimings = config.slotTimings || {};
                ['breakfast', 'lunch', 'dinner'].forEach(slot => {
                    if (slotTimings[slot]) {
                        config.slotTimings[slot] = {
                            startHour: slotTimings[slot].startHour ?? config.slotTimings[slot]?.startHour,
                            endHour:   slotTimings[slot].endHour   ?? config.slotTimings[slot]?.endHour,
                        };
                    }
                });
            }
        }
        await config.save();
        res.status(200).json({ success: true, data: config, message: 'Configuration updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// Public endpoint — returns slot timings for user_app (no auth required)
export const getSlotTimings = async (req, res) => {
    try {
        const config = await AppConfig.findOne({ appName: 'user_app' }).lean();
        const defaults = {
            breakfast: { startHour: 6,  endHour: 11 },
            lunch:     { startHour: 11, endHour: 16 },
            dinner:    { startHour: 16, endHour: 23 },
        };
        const timings = config?.slotTimings || defaults;
        res.status(200).json({ success: true, data: { slotTimings: { ...defaults, ...timings } } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};
