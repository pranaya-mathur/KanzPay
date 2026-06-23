import { listCardProducts } from './cards.service.js';

export async function listProducts(req, res, next) {
    try {
        const data = await listCardProducts(req.query);
        return res.status(200).json({ success: true, data });
    } catch (err) {
        return next(err);
    }
}
