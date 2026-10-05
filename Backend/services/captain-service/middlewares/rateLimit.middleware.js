const rateLimit = require('express-rate-limit');

const captainLoginRateLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5, // maximum 5 login attempts
    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        message: 'Too many login attempts. Please try again after 15 minutes.'
    }
});

module.exports = {
    captainLoginRateLimiter
};