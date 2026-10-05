const axios = require('axios');

// Shared axios client for service-to-service calls.
// If INTERNAL_API_KEY is set, it is sent so other services can reject outside callers.
const headers = {};
if (process.env.INTERNAL_API_KEY) {
    headers['x-internal-key'] = process.env.INTERNAL_API_KEY;
}

module.exports = axios.create({ timeout: 8000, headers });
