const jwt = require('jsonwebtoken');
const captainModel = require('../models/captain.model');
const blackListTokenModel = require('../models/blackListToken.model');

module.exports.authCaptain = async (req, res, next) => {

    try {
        const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // verify first: junk tokens are rejected without touching the DB
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const isBlacklisted = await blackListTokenModel.findOne({ token });

        if (isBlacklisted) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const captain = await captainModel.findById(decoded._id);

        // A valid token that belongs to a USER (not a captain) lands here.
        // Without this check req.captain was null and controllers crashed with 500.
        if (!captain) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        req.captain = captain;
        return next();

    } catch (error) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
};
