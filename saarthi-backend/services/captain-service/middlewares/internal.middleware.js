// Service-to-service guard (ride-service, notification-service).
// FAILS CLOSED: if INTERNAL_API_KEY is not configured these routes stay
// locked, because they can change captain location, status and rating.
module.exports = (req, res, next) => {
    const key = process.env.INTERNAL_API_KEY;

    if (!key) {
        console.error('INTERNAL_API_KEY is not set: internal routes are disabled');
        return res.status(503).json({ message: 'Internal API not configured' });
    }

    if (req.headers['x-internal-key'] !== key) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    next();
};
