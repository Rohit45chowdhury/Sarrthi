require('dotenv').config();

const http = require('http');
const app = require('./app');

const PORT = process.env.PORT || 3004;

if (!process.env.INTERNAL_API_KEY) {
    console.warn(
        'WARNING: INTERNAL_API_KEY is not set. ride-service calls will be rejected (401).'
    );
}

http.createServer(app).listen(PORT, () => {
    console.log(`Maps service running on port ${PORT}`);
});
