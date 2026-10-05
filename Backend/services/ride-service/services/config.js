// Read after dotenv.config() has run (server.js does that first).
// 127.0.0.1 (not localhost) avoids Node 18+/25 resolving to IPv6 ::1 and getting ECONNREFUSED.
module.exports = {
    USER_SERVICE_URL: process.env.USER_SERVICE_URL || 'http://127.0.0.1:3001',
    CAPTAIN_SERVICE_URL: process.env.CAPTAIN_SERVICE_URL || 'http://127.0.0.1:3002',
    MAPS_SERVICE_URL: process.env.MAPS_SERVICE_URL || 'http://127.0.0.1:3004',
    NOTIFICATION_SERVICE_URL: process.env.NOTIFICATION_SERVICE_URL || 'http://127.0.0.1:3005'
};
