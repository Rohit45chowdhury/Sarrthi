const express = require('express');
const router = express.Router();

const { body, query } = require('express-validator');

const rideController = require('../controllers/ride.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const internalOnly = require('../middlewares/internal.middleware');


// ================= CREATE RIDE =================
router.post(
    '/create',
    authMiddleware.authUser,
    body('pickup').isString().trim().isLength({ min: 3 }).withMessage('Invalid pickup address'),
    body('destination').isString().trim().isLength({ min: 3 }).withMessage('Invalid destination address'),
    body('vehicleType')
        .isString()
        .trim()
        .toLowerCase()
        .customSanitizer(value => {
            if (value === 'moto' || value === 'motorcyle') {
                return 'motorcycle';
            }
            return value;
        })
        .isIn(['auto', 'car', 'motorcycle'])
        .withMessage('Invalid vehicle type'),
    rideController.createRide
);


// ================= GET FARE =================
router.get(
    '/get-fare',
    authMiddleware.authUser,
    query('pickup').isString().trim().isLength({ min: 3 }).withMessage('Invalid pickup address'),
    query('destination').isString().trim().isLength({ min: 3 }).withMessage('Invalid destination address'),
    rideController.getFare
);


// ================= CONFIRM RIDE =================
router.post(
    '/confirm',
    authMiddleware.authCaptain,
    body('rideId').isMongoId().withMessage('Invalid ride id'),
    rideController.confirmRide
);


// ================= START RIDE =================
router.get(
    '/start-ride',
    authMiddleware.authCaptain,
    query('rideId').isMongoId().withMessage('Invalid ride id'),
    query('otp').isString().isLength({ min: 6, max: 6 }).withMessage('Invalid OTP'),
    rideController.startRide
);


// ================= END RIDE =================
router.post(
    '/end-ride',
    authMiddleware.authCaptain,
    body('rideId').isMongoId().withMessage('Invalid ride id'),
    rideController.endRide
);


// ================= PENDING RATING (user) =================
router.get(
    '/pending-rating',
    authMiddleware.authUser,
    rideController.getPendingRating
);


// ================= RATE RIDE (user) =================
router.post(
    '/rate',
    authMiddleware.authUser,
    body('rideId').isMongoId().withMessage('Invalid ride id'),
    body('value').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
    body('comment')
        .optional({ nullable: true })
        .isString()
        .isLength({ max: 300 })
        .withMessage('Comment is too long'),
    rideController.rateRide
);

// ================= CURRENT RIDE (restore) =================
router.get('/active', authMiddleware.authUser, rideController.getCurrentRideUser);
router.get('/captain/active', authMiddleware.authCaptain, rideController.getCurrentRideCaptain);

// ================= HISTORY =================
router.get('/history', authMiddleware.authUser, rideController.getRideHistory);
router.get('/captain/history', authMiddleware.authCaptain, rideController.getRideHistory);

// ================= CANCEL RIDE =================
router.post(
    '/cancel',
    authMiddleware.authUser,
    body('rideId').isMongoId().withMessage('Invalid ride id'),
    body('reason').optional({ nullable: true }).isString().isLength({ max: 200 }),
    rideController.cancelRide
);

router.post(
    '/captain/cancel',
    authMiddleware.authCaptain,
    body('rideId').isMongoId().withMessage('Invalid ride id'),
    body('reason').optional({ nullable: true }).isString().isLength({ max: 200 }),
    rideController.cancelRide
);


// ================= INTERNAL (notification-service only) =================
// Do NOT expose /rides/internal/* through the gateway.
router.get(
    '/internal/active-by-captain/:captainId',
    internalOnly,
    rideController.getActiveRideByCaptain
);

router.get(
    '/internal/captain-stats/:captainId',
    internalOnly,
    rideController.getCaptainStats
);


module.exports = router;
