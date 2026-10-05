const mapService = require('../services/maps.service');
const { validationResult } = require('express-validator');


// Maps service errors to a proper HTTP response
function sendError(res, error, fallbackMessage) {
    console.error(error);

    const status = error.status || 500;

    return res.status(status).json({
        message: status === 500 ? fallbackMessage : error.message
    });
}


// GET COORDINATES
module.exports.getCoordinates = async (req, res) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { address } = req.query;

    try {

        const coordinates = await mapService.getAddressCoordinates(address);

        return res.status(200).json(coordinates);

    } catch (error) {

        return sendError(res, error, 'Internal server error');
    }
};


// GET DISTANCE AND TIME
module.exports.getDistanceTime = async (req, res) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { origin, destination } = req.query;

    try {

        const distanceTime = await mapService.getDistanceTime(origin, destination);

        return res.status(200).json(distanceTime);

    } catch (error) {

        return sendError(res, error, 'Internal server error');
    }
};


// GET AUTOCOMPLETE SUGGESTIONS
module.exports.getAutoCompleteSuggestions = async (req, res) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { input } = req.query;

    try {

        const suggestions = await mapService.getAutoCompleteSuggestions(input);

        return res.status(200).json(suggestions);

    } catch (error) {

        return sendError(res, error, 'Internal server error');
    }
};
