import { registerMerchant, listMerchants } from './merchants.service.js';

export async function register(req, res, next) {
    try {
        const data = await registerMerchant(req.body);
        return res.status(201).json({
            success: true,
            data: {
                ...data,
                qrPayload: { merchantId: data.id, qrCode: data.qrCode },
            },
        });
    } catch (err) {
        if (err.message?.includes('required')) {
            return res.status(400).json({ success: false, error: err.message });
        }
        return next(err);
    }
}

export async function list(req, res, next) {
    try {
        const data = await listMerchants();
        return res.json({ success: true, data });
    } catch (err) {
        return next(err);
    }
}
