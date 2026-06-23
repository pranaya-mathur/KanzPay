import { verifyToken } from '../../modules/auth/auth.utils.js';

export function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ success: false, error: 'authentication required' });
    }
    try {
        const payload = verifyToken(token);
        req.user = { id: payload.userId, email: payload.email };
        return next();
    } catch {
        return res.status(401).json({ success: false, error: 'invalid or expired token' });
    }
}
