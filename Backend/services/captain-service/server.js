
require('dotenv').config();

const http = require('http');
const app = require('./app');
const connectToDb = require('./db/db');
const {
    initLocationKafka,
    shutdownLocationKafka
} = require('./services/locationKafka.service');

const PORT = process.env.PORT || 3002;

if (!process.env.JWT_SECRET) {
    console.error('ERROR: JWT_SECRET is not set');
    process.exit(1);
}

if (!process.env.DB_CONNECT) {
    console.error('ERROR: DB_CONNECT is not set');
    process.exit(1);
}

if (!process.env.INTERNAL_API_KEY) {
    console.warn(
        'WARNING: INTERNAL_API_KEY is missing. ' +
        'Internal service-to-service requests may fail.'
    );
}

let server;
let isShuttingDown = false;

async function startServer() {
    try {
        // 1. Database connection must succeed first
        await connectToDb();

        // 2. Start HTTP server
        server = http.createServer(app);

        server.listen(PORT, '0.0.0.0', () => {
            console.log(`Captain service running on port ${PORT}`);
        });

        // 3. Start Kafka without blocking HTTP startup
        Promise.resolve()
            .then(() => initLocationKafka())
            .catch((err) => {
                console.error('Kafka initialization failed:', err.message);
            });

    } catch (err) {
        console.error('Captain service startup failed:', err.message);
        process.exit(1);
    }
}

async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`${signal} received. Shutting down captain service...`);

    try {
        if (server) {
            await new Promise((resolve) => {
                server.close(resolve);
            });
        }

        await shutdownLocationKafka();

        console.log('Captain service shut down successfully');
        process.exit(0);
    } catch (err) {
        console.error('Shutdown error:', err.message);
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer();
