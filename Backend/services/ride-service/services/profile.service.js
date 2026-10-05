const http = require('./http');
const { USER_SERVICE_URL, CAPTAIN_SERVICE_URL } = require('./config');

// Rides no longer populate user/captain (those models live in other services),
// so profiles are fetched over HTTP. Any failure returns null; callers fall back to the id.

function clean(profile) {
    if (!profile || typeof profile !== 'object') return null;
    const { password, socketId, __v, ...safe } = profile;
    return safe;
}

async function fetchUser(userId) {
    try {
        const { data } = await http.get(`${USER_SERVICE_URL}/users/${userId}`, { timeout: 4000 });
        return clean(data?.user || data);
    } catch (error) {
        console.error('FETCH USER ERROR:', error.response?.data || error.message);
        return null;
    }
}

async function fetchCaptain(captainId) {
    try {
        const { data } = await http.get(`${CAPTAIN_SERVICE_URL}/captains/${captainId}`, { timeout: 4000 });
        return clean(data?.captain || data);
    } catch (error) {
        console.error('FETCH CAPTAIN ERROR:', error.response?.data || error.message);
        return null;
    }
}

module.exports = { fetchUser, fetchCaptain };
