import KitchenPartner from '../../../../models/KitchenPartner.js';

/**
 * @desc    Create a new Kitchen Partner
 * @route   POST /api/food/admin/kitchen-partners
 * @access  Private/Admin
 */
export const createKitchenPartner = async (req, res) => {
    try {
        const {
            companyName,
            email,
            vatNumber,
            managementFee,
            status,
            bankDetails,
            address,
            documents,
        } = req.body;

        // Check if email already exists
        const existingPartner = await KitchenPartner.findOne({ email });
        if (existingPartner) {
            return res.status(400).json({
                success: false,
                message: 'A Kitchen Partner with this email already exists',
            });
        }

        const newPartner = new KitchenPartner({
            companyName,
            email,
            vatNumber,
            managementFee: managementFee ? Number(managementFee) : 0,
            status: status || 'Active',
            bankDetails,
            address: address || {},
            documents,
            // homeCooks, orders, earnings will default to 0 as per schema
        });

        await newPartner.save();

        res.status(201).json({
            success: true,
            message: 'Kitchen Partner added successfully',
            data: newPartner,
        });
    } catch (error) {
        console.error('Error creating Kitchen Partner:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server Error',
        });
    }
};

/**
 * @desc    Get all Kitchen Partners
 * @route   GET /api/food/admin/kitchen-partners
 * @access  Private/Admin
 */
export const getKitchenPartners = async (req, res) => {
    try {
        // Optional filters
        const { status, city, search } = req.query;
        let query = {};

        if (status && status !== 'All Status') {
            query.status = status;
        }

        if (city && city !== 'All Cities') {
            query['address.city'] = { $regex: new RegExp(city, 'i') };
        }

        if (search) {
            query.$or = [
                { companyName: { $regex: new RegExp(search, 'i') } },
                { partnerId: { $regex: new RegExp(search, 'i') } },
                { email: { $regex: new RegExp(search, 'i') } },
            ];
        }

        const partners = await KitchenPartner.find(query).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: partners.length,
            data: partners,
        });
    } catch (error) {
        console.error('Error fetching Kitchen Partners:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server Error',
        });
    }
};

/**
 * @desc    Update Kitchen Partner Status
 * @route   PATCH /api/food/admin/kitchen-partners/:id/status
 * @access  Private/Admin
 */
export const updateKitchenPartnerStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // e.g. Active, Inactive, Suspended

        if (!['Active', 'Inactive', 'Suspended'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value',
            });
        }

        const partner = await KitchenPartner.findById(id);
        if (!partner) {
            return res.status(404).json({
                success: false,
                message: 'Kitchen Partner not found',
            });
        }

        partner.status = status;
        await partner.save();

        res.status(200).json({
            success: true,
            message: `Partner status updated to ${status}`,
            data: partner,
        });
    } catch (error) {
        console.error('Error updating Kitchen Partner status:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server Error',
        });
    }
};

/**
 * @desc    Update Kitchen Partner Details
 * @route   PATCH /api/food/admin/kitchen-partners/:id
 * @access  Private/Admin
 */
export const updateKitchenPartner = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        
        // Prevent updating some restricted fields if needed, like partnerId
        delete updateData.partnerId;

        const partner = await KitchenPartner.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
        if (!partner) {
            return res.status(404).json({
                success: false,
                message: 'Kitchen Partner not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Kitchen Partner updated successfully',
            data: partner,
        });
    } catch (error) {
        console.error('Error updating Kitchen Partner:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server Error',
        });
    }
};
