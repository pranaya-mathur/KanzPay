const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel = LEVELS.info;

export function setLogLevel(level) {
    if (LEVELS[level] != null) currentLevel = LEVELS[level];
}

function log(level, message, meta = undefined) {
    if (LEVELS[level] < currentLevel) return;
    const entry = {
        ts: new Date().toISOString(),
        level,
        message,
        ...(meta !== undefined ? { meta } : {}),
    };
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
}

export const logger = {
    debug: (message, meta) => log('debug', message, meta),
    info: (message, meta) => log('info', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    error: (message, meta) => log('error', message, meta),
};

export default logger;
