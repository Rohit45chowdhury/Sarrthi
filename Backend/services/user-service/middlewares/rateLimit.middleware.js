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

// OTP bhejne / verify / google sign-in ke liye
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        message: 'Too many requests. Please try again later.'
    }
});

module.exports = {
    userLoginRateLimiter,
    authLimiter
};