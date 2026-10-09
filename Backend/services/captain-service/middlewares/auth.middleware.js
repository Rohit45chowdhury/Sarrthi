const jwt = require('jsonwebtoken');
const captainModel = require('../models/captain.model');
const blackListTokenModel = require('../models/blackListToken.model');

module.exports.authCaptain = async (req, res, next) => {
    try {
        const header = req.headers.authorization || '';
        const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

        // header pehle, cookie fallback (cookie ports ke beech share hoti hai)
        const token = bearer || req.cookies?.token;

        if (!token) {
            return res.status(401).json({ message: 'Token missing' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const isBlacklisted = await blackListTokenModel.findOne({ token });
        if (isBlacklisted) {
            return res.status(401).json({ message: 'Token blacklisted' });
        }

        const captain = await captainModel.findById(decoded._id || decoded.id);
        if (!captain) {
            // token valid hai par captain ka nahi (shayad user ka token)
            return res.status(401).json({ message: 'Not a captain token' });
        }

        req.captain = captain;
        return next();

    } catch (error) {
        console.log('authCaptain error:', error.message);
        return res.status(401).json({ message: error.message });
    }
};