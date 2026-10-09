const http = require('../services/http');
const { USER_SERVICE_URL, CAPTAIN_SERVICE_URL } = require('../services/config');

function getToken(req) {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    return bearer || req.cookies?.token;
}

function makeAuth(profileUrl, reqKey, label) {
    return async (req, res, next) => {
        const token = getToken(req);

        if (!token) {
            return res.status(401).json({ message: 'Token missing' });
        }

        try {
            const { data } = await http.get(profileUrl, {
                headers: { Authorization: `Bearer ${token}` },
                timeout: 5000
            });

            const entity = data?.[reqKey] || data;

            if (!entity?._id) {
                return res.status(401).json({ message: `${label} not found` });
            }

            req[reqKey] = entity;
            return next();

        } catch (error) {
            const status = error.response?.status;

            if (status === 401 || status === 403 || status === 404) {
                console.log(`${label} auth denied:`, error.response?.data?.message);
                return res.status(401).json({
                    message: error.response?.data?.message || 'Unauthorized'
                });
            }

            console.error(`${label} auth error:`, error.code, error.config?.url, error.message);
            return res.status(503).json({ message: `${label} auth service unavailable` });
        }
    };
}

module.exports.authUser = makeAuth(`${USER_SERVICE_URL}/users/profile`, 'user', 'User');
module.exports.authCaptain = makeAuth(`${CAPTAIN_SERVICE_URL}/captains/profile`, 'captain', 'Captain');