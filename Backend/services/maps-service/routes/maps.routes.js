const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth.middleware');
const mapController = require('../controllers/map.controller');

const { query } = require('express-validator');

// auth runs first so unauthenticated callers get 401 instead of
// validation details; .trim() runs before the length check
const text = (name) =>
    query(name)
        .isString().withMessage(`${name} must be a string`)
        .bail()
        .trim()
        .isLength({ min: 3 }).withMessage(`${name} must be at least 3 characters`);


router.get(
    '/get-coordinates',
    auth,
    text('address'),
    mapController.getCoordinates
);


router.get(
    '/get-distance-time',
    auth,
    text('origin'),
    text('destination'),
    mapController.getDistanceTime
);


router.get(
    '/get-suggestions',
    auth,
    text('input'),
    mapController.getAutoCompleteSuggestions
);


module.exports = router;
