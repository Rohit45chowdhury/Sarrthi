const axios = require('axios');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://127.0.0.1:3001';
const CAPTAIN_SERVICE_URL = process.env.CAPTAIN_SERVICE_URL || 'http://127.0.0.1:3002';

const http = axios.create({ timeout: 5000 });

// maps-service has no user/captain/blacklist models, so it lets the owning
// service validate tokens. Results are cached briefly because the frontend
// calls /maps/get-suggestions often. (A logged-out token stays valid here
// for up to TOKEN_CACHE_MS.)
const TOKEN_CACHE_MS = 30 * 1000;
const TOKEN_CACHE_MAX = 1000;
const okTokens = new Map(); // token -> expiresAt

function cachedOk(token) {
    const exp = okTokens.get(token);
    if (!exp) return false;
    if (exp < Date.now()) {
        okTokens.delete(token);
        return false;
    }
    return true;
}

function rememberOk(token) {
    if (okTokens.size >= TOKEN_CACHE_MAX) {
        okTokens.delete(okTokens.keys().next().value);
    }
    okTokens.set(token, Date.now() + TOKEN_CACHE_MS);
}

// header pehle, cookie fallback (cookie ports ke beech share hoti hai)
function getToken(req) {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    return bearer || req.cookies?.token || null;
}

// -> { result: 'ok' | 'denied' | 'error', reason? }
async function check(url, token) {
    try {
        const { data } = await http.get(url, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const entity = data?.user || data?.captain || data;

        return entity?._id
            ? { result: 'ok' }
            : { result: 'denied', reason: 'Profile has no _id' };

    } catch (error) {
        const status = error.response?.status;

        if (status === 401 || status === 403 || status === 404) {
            return {
                result: 'denied',
                reason: error.response?.data?.message || `HTTP ${status}`
            };
        }

        console.error('Auth check failed:', url, error.code || error.message);
        return { result: 'error', reason: error.code || error.message };
    }
}

// Allows either:
//  1) another Saarthi service  (x-internal-key header = INTERNAL_API_KEY)
//  2) a logged-in user OR captain (Bearer token / cookie)
module.exports = async (req, res, next) => {

    const key = process.env.INTERNAL_API_KEY;

    if (key && req.headers['x-internal-key'] === key) {
        return next();
    }

    const token = getToken(req);

    if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({ message: 'Token missing' });
    }

    if (cachedOk(token)) {
        return next();
    }

    const asUser = await check(`${USER_SERVICE_URL}/users/profile`, token);

    if (asUser.result === 'ok') {
        rememberOk(token);
        return next();
    }

    const asCaptain = await check(`${CAPTAIN_SERVICE_URL}/captains/profile`, token);

    if (asCaptain.result === 'ok') {
        rememberOk(token);
        return next();
    }

    if (asUser.result === 'denied' && asCaptain.result === 'denied') {
        console.log('maps auth denied -> user:', asUser.reason, '| captain:', asCaptain.reason);

        return res.status(401).json({
            message: 'Unauthorized',
            user: asUser.reason,
            captain: asCaptain.reason
        });
    }

    console.error('maps auth unavailable -> user:', asUser.reason, '| captain:', asCaptain.reason);
    return res.status(503).json({ message: 'Auth service unavailable' });
};