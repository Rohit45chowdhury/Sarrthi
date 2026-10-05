const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');

const captainController = require('../controllers/captain.controller');
const { authCaptain } = require('../middlewares/auth.middleware');
const internalOnly = require('../middlewares/internal.middleware');
const {captainLoginRateLimiter} = require('../middlewares/rateLimit.middleware');


// ============================================================
// PUBLIC / CAPTAIN ROUTES (used by the frontend)
// ============================================================

router.post(
    '/register',
    [
        body('email').isEmail().withMessage('Invalid Email'),
        body('fullname.firstname').isLength({ min: 3 }).withMessage('First name must be at least 3 characters long'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
        body('vehicle.color').isLength({ min: 3 }).withMessage('Color must be at least 3 characters long'),
        body('vehicle.plate').isLength({ min: 3 }).withMessage('Plate must be at least 3 characters long'),
        body('vehicle.capacity').isInt({ min: 1 }).withMessage('Capacity must be at least 1'),
        body('vehicle.vehicleType').isIn(['car', 'motorcycle', 'auto']).withMessage('Invalid vehicle type')
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
