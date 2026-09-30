const mapService = require('../services/maps.service');
const { validationResult } = require('express-validator');


// GET COORDINATES
module.exports.getCoordinates = async (req, res) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({
            errors: errors.array()
        });
    }

    const { address } = req.query;

    try {

        const coordinates = await mapService.getAddressCoordinate(address);

        return res.status(200).json(coordinates);

    } catch (error) {

        console.error(error);

        return res.status(404).json({
            message: 'Coordinates not found'
        });
    }
};


// GET DISTANCE AND TIME
module.exports.getDistanceTime = async (req, res) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({
            errors: errors.array()
        });
    }

    const { origin, destination } = req.query;

    try {

        const distanceTime = await mapService.getDistanceTime(
            origin,
            destination
        );

        return res.status(200).json(distanceTime);

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            message: 'Internal server error'
        });
    }
};


// GET AUTOCOMPLETE SUGGESTIONS
module.exports.getAutoCompleteSuggestions = async (req, res) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({
            errors: errors.array()
        });
    }

    const { input } = req.query;

    try {

        const suggestions =
            await mapService.getAutoCompleteSuggestions(input);

        return res.status(200).json(suggestions);

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            message: 'Internal server error'
        });
    }
};