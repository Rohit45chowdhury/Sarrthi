const express = require('express');
const router = express.Router();

const { body, query } = require('express-validator');

const rideController = require('../controllers/ride.controller');
const authMiddleware = require('../middlewares/auth.middleware');


// ================= CREATE RIDE =================

router.post(
    '/create',

    authMiddleware.authUser,

    body('pickup')
        .isString()
        .trim()
        .isLength({ min: 3 })
        .withMessage('Invalid pickup address'),

    body('destination')
        .isString()
        .trim()
        .isLength({ min: 3 })
        .withMessage('Invalid destination address'),

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

    query('pickup')
        .isString()
        .trim()
        .isLength({ min: 3 })
        .withMessage('Invalid pickup address'),

    query('destination')
        .isString()
        .trim()
        .isLength({ min: 3 })
        .withMessage('Invalid destination address'),

    rideController.getFare
);


// ================= CONFIRM RIDE =================

router.post(
    '/confirm',

    authMiddleware.authCaptain,

    body('rideId')
        .isMongoId()
        .withMessage('Invalid ride id'),

    rideController.confirmRide
);


// ================= START RIDE =================

router.get(
    '/start-ride',

    authMiddleware.authCaptain,

    query('rideId')
        .isMongoId()
        .withMessage('Invalid ride id'),

    query('otp')
        .isString()
        .isLength({ min: 6, max: 6 })
        .withMessage('Invalid OTP'),

    rideController.startRide
);


// ================= END RIDE =================

router.post(
    '/end-ride',

    authMiddleware.authCaptain,

    body('rideId')
        .isMongoId()
        .withMessage('Invalid ride id'),

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

    body('rideId')
        .isMongoId()
        .withMessage('Invalid ride id'),

    body('value')
        .isInt({ min: 1, max: 5 })
        .withMessage('Rating must be 1-5'),

    body('comment')
        .optional({ nullable: true })
        .isString()
        .isLength({ max: 300 })
        .withMessage('Comment is too long'),

    rideController.rateRide
);


module.exports = router;