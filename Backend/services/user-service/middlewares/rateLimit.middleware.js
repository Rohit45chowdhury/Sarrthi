const rateLimit = require('express-rate-limit');

const userLoginRateLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5, // Maximum 5 login attempts

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        message: 'Too many login attempts. Please try again after 15 minutes.'
    }
});

module.exports = {
    userLoginRateLimiter
};