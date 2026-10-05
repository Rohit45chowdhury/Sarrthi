const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model');
const blackListTokenModel = require('../models/blackListToken.model');

module.exports.authUser = async (req, res, next) => {

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

        const user = await userModel.findById(decoded._id);

        // valid token of a CAPTAIN (same JWT_SECRET) ends up here
        if (!user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        req.user = user;
        return next();

    } catch (error) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
};
