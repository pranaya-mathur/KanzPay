import { query } from '../../db/pool.js';

export async function findUserByEmail(email) {
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    return rows[0] || null;
}

export async function findUserById(id) {
    const { rows } = await query('SELECT id, email, phone, created_at FROM users WHERE id = $1', [id]);
    return rows[0] || null;
}

export async function createUser({ email, passwordHash, phone = null }) {
    const { rows } = await query(
        `INSERT INTO users (email, password_hash, phone)
         VALUES ($1, $2, $3)
         RETURNING id, email, phone, created_at`,
        [email.toLowerCase(), passwordHash, phone],
    );
    return rows[0];
}
