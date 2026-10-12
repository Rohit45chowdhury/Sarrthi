const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');

const captainController = require('../controllers/captain.controller');
const { authCaptain } = require('../middlewares/auth.middleware');
const internalOnly = require('../middlewares/internal.middleware');
const { captainLoginRateLimiter } = require('../middlewares/rateLimit.middleware');


// ---- Verification rules (captain.model.js aur CaptainSignup.jsx jaise hi rakho) ----
const PLATE_REGEX = /^([A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/;
const LICENSE_REGEX = /^[A-Z]{2}[0-9]{2}(19|20)[0-9]{2}[0-9]{7}$/;
const CAPACITY_LIMITS = { motorcycle: 1, auto: 3, car: 8 };

// "br 01-ab 1234" -> "BR01AB1234"
const normalize = (v) =>
    typeof v === 'string' ? v.toUpperCase().replace(/[\s-]/g, '') : v;


// ============================================================
// PUBLIC / CAPTAIN ROUTES (used by the frontend)
// ============================================================

router.post(
    '/register',
    [
        body('email')
            .trim()
            .isEmail().withMessage('Invalid Email')
            .normalizeEmail({ gmail_remove_dots: false }),

        body('fullname.firstname')
            .trim()
            .isLength({ min: 3 }).withMessage('First name must be at least 3 characters long'),

        body('fullname.lastname')
            .optional({ checkFalsy: true })
            .trim()
            .isLength({ min: 3 }).withMessage('Last name must be at least 3 characters long'),

        body('password')
            .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),

        body('licenseNumber')
            .optional({ checkFalsy: true })
            .customSanitizer(normalize)
            .matches(LICENSE_REGEX).withMessage('Invalid driving license number'),

        body('vehicle.color')
            .trim()
            .isLength({ min: 3 }).withMessage('Color must be at least 3 characters long'),

        body('vehicle.model')
            .trim()
            .isLength({ min: 2, max: 40 }).withMessage('Vehicle model must be 2-40 characters long'),

        body('vehicle.plate')
            .customSanitizer(normalize)
            .matches(PLATE_REGEX).withMessage('Invalid vehicle number (example: BR01AB1234)'),

        body('vehicle.vehicleType')
            .isIn(['car', 'motorcycle', 'auto']).withMessage('Invalid vehicle type'),

        body('vehicle.capacity')
            .isInt({ min: 1 }).withMessage('Capacity must be at least 1')
            .bail()
            .custom((value, { req }) => {
                const limit = CAPACITY_LIMITS[req.body?.vehicle?.vehicleType];
                if (limit && Number(value) > limit) {
                    throw new Error(
                        `A ${req.body.vehicle.vehicleType} can carry at most ${limit} passenger(s)`
                    );
                }
                return true;
            })
    ],
    captainController.registerCaptain
);

router.post(
    '/login',

    // Rate limit: 5 attempts per 15 minutes
    captainLoginRateLimiter,

    [
        body('email')
            .isEmail()
            .withMessage('Invalid Email'),

        body('password')
            .isLength({ min: 6 })
            .withMessage('Password must be at least 6 characters long')
    ],

    captainController.loginCaptain
);

router.get('/stats', authCaptain, captainController.getCaptainStats);

// also used by ride-service / maps-service / notification-service to verify a captain token
router.get('/profile', authCaptain, captainController.getCaptainProfile);

router.patch('/status', authCaptain, captainController.updateCaptainStatus);

router.get('/logout', authCaptain, captainController.logoutCaptain);


// ============================================================
// INTERNAL ROUTES (service-to-service, need x-internal-key)
// Keep every static path ABOVE the "/:id" routes.
// The gateway also blocks these, so they are not reachable from outside.
// ============================================================

router.get('/active', internalOnly, captainController.getActiveCaptains);

const idParam = param('id').isMongoId().withMessage('Invalid captain id');

router.get(
    '/:id',
    internalOnly,
    idParam,
    captainController.getCaptainById
);

router.patch(
    '/:id/location',
    internalOnly,
    idParam,
    body('ltd').isFloat({ min: -90, max: 90 }).withMessage('Invalid ltd'),
    body('lng').isFloat({ min: -180, max: 180 }).withMessage('Invalid lng'),
    captainController.updateLocation
);

router.patch(
    '/:id/status',
    internalOnly,
    idParam,
    captainController.updateStatusInternal
);

router.patch(
    '/:id/rating',
    internalOnly,
    idParam,
    body('value').isFloat({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
    captainController.updateRating
);


module.exports = router;