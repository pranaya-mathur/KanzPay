import { hashPassword, verifyPassword, signToken } from './auth.utils.js';
import * as repo from './auth.repository.js';
import { query } from '../../db/pool.js';

export async function registerUser({ email, password, phone }) {
    if (!email || !password) throw new Error('email and password are required');
    if (password.length < 6) throw new Error('password must be at least 6 characters');

    const existing = await repo.findUserByEmail(email);
    if (existing) throw new Error('email already registered');

    const user = await repo.createUser({
        email,
        passwordHash: hashPassword(password),
        phone,
    });

    const token = signToken({ userId: user.id, email: user.email });
    return { user, token };
}

export async function loginUser({ email, password }) {
    if (!email || !password) throw new Error('email and password are required');

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
        throw new Error('invalid email or password');
    }

    const token = signToken({ userId: user.id, email: user.email });
    return {
        user: { id: user.id, email: user.email, phone: user.phone, createdAt: user.created_at },
        token,
    };
}
