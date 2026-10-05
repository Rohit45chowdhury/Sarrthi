// Service-to-service guard (ride-service).
// FAILS CLOSED: without INTERNAL_API_KEY these routes stay locked.
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
