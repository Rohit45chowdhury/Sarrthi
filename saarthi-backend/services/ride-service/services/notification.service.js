const http = require('./http');
const { NOTIFICATION_SERVICE_URL } = require('./config');

// Sockets live in notification-service, so rides-service talks to it over HTTP.
// Failures are logged and swallowed: a failed push must never fail the ride API.
async function post(endpoint, body) {
    try {
        const { data } = await http.post(`${NOTIFICATION_SERVICE_URL}${endpoint}`, body, {
            timeout: 8000
        });
        return data;
    } catch (error) {
        console.error(`Notification ${endpoint} failed:`, error.response?.data || error.message);
        return null;
    }
}

// emit `event` to one captain's socket
const notifyCaptain = (captainId, event, data) =>
    post('/notifications/captain', { captainId, event, data });

// emit `event` to one user's socket
const notifyUser = (userId, event, data) =>
    post('/notifications/user', { userId, event, data });

// start relaying captain live-location to the user for this ride
// phase: 'accepted' (heading to pickup) | 'ongoing' (ride in progress)
const trackCaptainRide = ({ captainId, rideId, userId, phase = 'accepted' }) =>
    post('/notifications/track-ride', { captainId, rideId, userId, phase });

// stop relaying (ride ended)
const untrackCaptainRide = (captainId) =>
    post('/notifications/untrack-ride', { captainId });

module.exports = { notifyCaptain, notifyUser, trackCaptainRide, untrackCaptainRide };
