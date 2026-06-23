import { registerUser, loginUser } from './auth.service.js';

export async function register(req, res, next) {
    try {
        const { email, password, phone } = req.body || {};
        const result = await registerUser({ email, password, phone });
        return res.status(201).json({ success: true, data: result });
    } catch (err) {
        if (err.message?.includes('required') || err.message?.includes('already') || err.message?.includes('at least')) {
            return res.status(400).json({ success: false, error: err.message });
        }
        return next(err);
    }
}

export async function login(req, res, next) {
    try {
        const { email, password } = req.body || {};
        const result = await loginUser({ email, password });
        return res.status(200).json({ success: true, data: result });
    } catch (err) {
        if (err.message?.includes('invalid') || err.message?.includes('required')) {
            return res.status(401).json({ success: false, error: err.message });
        }
        return next(err);
    }
}
