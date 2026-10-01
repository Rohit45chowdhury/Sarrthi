const express = require('express');
const router = express.Router();

const authMiddleware = require('../middlewares/auth.middleware');
const mapController = require('../controllers/map.controller');

const { query } = require('express-validator');

// FIX: auth runs first so unauthenticated callers get 401 instead of
// validation details; .trim() runs before checks, and notEmpty is explicit
const text = (name) =>
    query(name)
        .isString().withMessage(`${name} must be a string`)
        .bail()
        .trim()
        .isLength({ min: 3 }).withMessage(`${name} must be at least 3 characters`);


router.get(
    '/get-coordinates',
    authMiddleware.authUser,
    text('address'),
    mapController.getCoordinates
);


router.get(
    '/get-distance-time',
    authMiddleware.authUser,
    text('origin'),
    text('destination'),
    mapController.getDistanceTime
);


router.get(
    '/get-suggestions',
    authMiddleware.authUser,
    text('input'),
    mapController.getAutoCompleteSuggestions
);


module.exports = router;