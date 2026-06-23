import fs from 'fs';
import crypto from 'crypto';

export function hashFileContent(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
}
