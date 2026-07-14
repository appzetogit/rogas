import { generateInvoicePdf } from '../services/invoice.service.js';

export async function downloadInvoiceController(req, res, next) {
    try {
        const { orderId } = req.params; // Using orderId to represent the subscription id
        const user = req.user; // Added by authMiddleware

        if (!user) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const doc = await generateInvoicePdf(orderId, user);

        // Set response headers to force download as PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Invoice-${orderId}.pdf`);

        // Pipe the PDF document to the response
        doc.pipe(res);
    } catch (error) {
        if (error.name === 'ValidationError' || error.name === 'AuthError') {
            return res.status(400).json({ success: false, message: error.message });
        }
        console.error('Error generating invoice PDF:', error);
        return res.status(500).json({ success: false, message: 'Failed to generate invoice PDF' });
    }
}
