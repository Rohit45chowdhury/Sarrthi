const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const userModel = require('../models/user.model');
const blackListTokenModel = require('../models/blackListToken.model');

module.exports.authUser = async (req, res, next) => {
    try {
        const header = req.headers.authorization || '';
        const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
        const token = bearer || req.cookies?.token;

        if (!token) {
            return res.status(401).json({ message: 'Token missing' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const isBlacklisted = await blackListTokenModel.findOne({ token });
        if (isBlacklisted) {
            return res.status(401).json({ message: 'Token blacklisted' });
        }

        const id = decoded._id || decoded.id || decoded.userId || decoded.sub;

        let user = id && mongoose.isValidObjectId(id) ? await userModel.findById(id) : null;

        // Purane auth-service ke token (migration se pehle ki id) ke liye email fallback.
        // Migration + sabke naye login ke baad ye 3 lines hata sakte ho.
        if (!user && decoded.email) {
            user = await userModel.findOne({ email: String(decoded.email).toLowerCase() });
        }

        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        req.user = user;
        return next();

    } catch (error) {
        console.log('authUser error:', error.message);
        return res.status(401).json({ message: error.message });
    }
};