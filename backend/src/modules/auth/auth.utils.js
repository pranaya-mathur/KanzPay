import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import config from '../../config.js';

export function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const attempt = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'));
}

export function signToken(payload) {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

export function verifyToken(token) {
    return jwt.verify(token, config.jwtSecret);
}
