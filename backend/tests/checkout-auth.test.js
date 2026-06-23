import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, signToken, verifyToken } from '../src/modules/auth/auth.utils.js';

describe('auth utils', () => {
    it('hashes and verifies password', () => {
        const hash = hashPassword('secret123');
        assert.ok(verifyPassword('secret123', hash));
        assert.equal(verifyPassword('wrong', hash), false);
    });

    it('signs and verifies JWT', () => {
        const token = signToken({ userId: 'abc', email: 'test@example.com' });
        const payload = verifyToken(token);
        assert.equal(payload.userId, 'abc');
        assert.equal(payload.email, 'test@example.com');
    });
});
