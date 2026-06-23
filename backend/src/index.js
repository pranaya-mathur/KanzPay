import express from 'express';
import cors from 'cors';
import config from './config.js';
import routes from './api/routes.js';
import { setLogLevel, logger } from './shared/utils/logger.js';
import { migrate } from './db/migrate.js';
import { getPool } from './db/pool.js';

setLogLevel(config.logLevel);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api', routes);
// Also mount without prefix for backward compatibility
app.use(routes);

/** Promisify app.listen so listen errors are catchable. */
function listenAsync(port) {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, () => resolve(server));
        server.once('error', reject);
    });
}

async function start() {
    try {
        // Attach pool-level error handler so idle-client errors don't crash the process
        getPool().on('error', (err) => {
            logger.error('Unexpected pg pool error', {
                error: err.message || String(err),
                code: err.code,
            });
        });

        await migrate();

        const server = await listenAsync(config.port);
        logger.info(`KanzPay backend listening on port ${config.port}`);

        // Graceful shutdown
        const shutdown = async (signal) => {
            logger.info(`${signal} received — shutting down`);
            server.close(async () => {
                const { closePool } = await import('./db/pool.js');
                await closePool().catch(() => {});
                process.exit(0);
            });
            // Force exit after 10 s
            setTimeout(() => process.exit(1), 10_000).unref();
        };
        process.once('SIGTERM', () => shutdown('SIGTERM'));
        process.once('SIGINT',  () => shutdown('SIGINT'));

    } catch (err) {
        if (err.code === 'EADDRINUSE') {
            logger.error(`Port ${config.port} is already in use. Either stop the other process or use the running server:`, {
                hint: `curl http://localhost:${config.port}/health`,
                stop: `npm run stop   # then npm start again`,
                port: config.port,
            });
        } else {
            logger.error('Failed to start server', {
                error: err.message || String(err),
                code: err.code,
                stack: err.stack,
            });
        }
        process.exit(1);
    }
}

start();
