require('dotenv').config();

const http = require('http');
const app = require('./app');
const connectToDb = require('./db/db');
const { initLocationKafka, shutdownLocationKafka } = require('./services/locationKafka.service');

const PORT = process.env.PORT || 3002;

if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set');
    process.exit(1);
}

if (!process.env.INTERNAL_API_KEY) {
    console.warn('WARNING: INTERNAL_API_KEY is not set. Internal routes are disabled (ride/notification services will fail).');
}

connectToDb().then(() => {
    const server = http.createServer(app).listen(PORT, () => {
        console.log(`Captain service running on port ${PORT}`);
    });

    // Kafka background mein start hota hai, server ko block nahi karta
    initLocationKafka();

    const stop = async () => {
        await shutdownLocationKafka();
        server.close(() => process.exit(0));
    };

    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
});