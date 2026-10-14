
require('dotenv').config();

const http = require('http');
const app = require('./app');
const connectToDb = require('./db/db');

const PORT = process.env.PORT || 3003;

async function startServer() {
    try {
        await connectToDb();

        const server = http.createServer(app);

        server.listen(PORT, '0.0.0.0', () => {
            console.log(`Rides service running on port ${PORT}`);
        });

        const shutdown = (signal) => {
            console.log(`${signal} received. Closing server...`);

            server.close(() => {
                process.exit(0);
            });
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
        console.error('Ride service startup failed:', error.message);
        process.exit(1);
    }
}

startServer();
