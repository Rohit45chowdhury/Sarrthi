require('dotenv').config();

const http = require('http');
const app = require('./app');
const connectToDb = require('./db/db');

const port = process.env.PORT || 3001;

if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set');
    process.exit(1);
}

if (!process.env.INTERNAL_API_KEY) {
    console.warn('WARNING: INTERNAL_API_KEY is not set. GET /users/:id is disabled (ride-service cannot show passenger names).');
}

connectToDb().then(() => {
    http.createServer(app).listen(port, () => {
        console.log('Saarthi User Service');
        console.log(`User Service running on port ${port}`);
    });
});
