// Service-to-service guard. If INTERNAL_API_KEY is set, callers must send it
// in the x-internal-key header. With no key configured it is open (dev only).
module.exports = (req, res, next) => {
    const key = process.env.INTERNAL_API_KEY;

    if (!key) return next();

    if (req.headers['x-internal-key'] !== key) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    next();
};
