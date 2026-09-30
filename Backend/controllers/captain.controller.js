const captainModel = require('../models/captain.model');
const captainService = require('../services/captain.service');
const blackListTokenModel = require('../models/blackListToken.model');
const { validationResult } = require('express-validator');

module.exports.registerCaptain = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { fullname, email, password, vehicle } = req.body;

    const isCaptainAlreadyExist = await captainModel.findOne({ email });

    if (isCaptainAlreadyExist) {
        return res.status(400).json({ message: 'Captain already exist' });
    }

    const hashedPassword = await captainModel.hashPassword(password);

    const captain = await captainService.createCaptain({
        firstname: fullname.firstname,
        lastname: fullname.lastname,
        email,
        password: hashedPassword,
        color: vehicle.color,
        plate: vehicle.plate,
        capacity: vehicle.capacity,
        vehicleType: vehicle.vehicleType
    });

    const token = captain.generateAuthToken();

    res.status(201).json({ token, captain });
}

module.exports.loginCaptain = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const captain = await captainModel.findOne({ email }).select('+password');

    if (!captain) {
        return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await captain.comparePassword(password);

    if (!isMatch) {
        return res.status(401).json({ message: 'Invalid email or password' });
    }

// Login ke baad captain hamesha inactive rahega
    captain.status = 'inactive';
    await captain.save();

    const token = captain.generateAuthToken();

    res.cookie('token', token);

    res.status(200).json({
        token,
        captain
    });
}

module.exports.getCaptainProfile = async (req, res, next) => {
    try {
        const captain = await captainModel.findById(req.captain._id);

        if (!captain) {
            return res.status(404).json({ message: "Captain not found" });
        }

        res.status(200).json({ captain });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
}

// ================= NAYA STATUS UPDATE CONTROLLER =================
module.exports.updateCaptainStatus = async (req, res, next) => {
    try {
        const { status } = req.body;

        if (!status || !['active', 'inactive'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status. Must be active or inactive.' });
        }

        const captain = await captainModel.findByIdAndUpdate(
            req.captain._id,
            { status },
            { new: true }
        );

        if (!captain) {
            return res.status(404).json({ message: 'Captain not found' });
        }

        res.status(200).json({
            message: 'Status updated successfully',
            captain
        });
    } catch (error) {
        console.error("Update status error:", error);
        res.status(500).json({ message: 'Server error' });
    }
}

module.exports.logoutCaptain = async (req, res, next) => {
    try {

        const token =
            req.cookies.token ||
            req.headers.authorization?.split(' ')[1];

        // Captain ko inactive karo
        const captain = await captainModel.findByIdAndUpdate(
            req.captain._id,
            {
                status: 'inactive'
            },
            {
                new: true
            }
        );

        if (!captain) {
            return res.status(404).json({
                message: 'Captain not found'
            });
        }

        // Token blacklist karo
        if (token) {
            await blackListTokenModel.create({ token });
        }

        // Cookie clear karo
        res.clearCookie('token');

        return res.status(200).json({
            message: 'Logout successfully',
            captain
        });

    } catch (error) {

        console.error('Logout error:', error);

        return res.status(500).json({
            message: 'Logout failed',
            error: error.message
        });
    }
};