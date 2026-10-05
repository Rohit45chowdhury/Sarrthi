const { validationResult } = require('express-validator');

const userModel = require('../models/user.model');
const userService = require('../services/user.service');
const blackListTokenModel = require('../models/blackListToken.model');


// Never send the password hash to the client
// (create() and select('+password') both return it on the document).
function publicUser(user) {
    const obj = user?.toObject ? user.toObject() : { ...user };
    delete obj.password;
    delete obj.__v;
    return obj;
}


// POST /users/register
module.exports.registerUser = async (req, res) => {

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { fullname, password } = req.body;
        const email = String(req.body.email).toLowerCase().trim();

        const isUserAlready = await userModel.findOne({ email });

        if (isUserAlready) {
            return res.status(400).json({ message: 'User already exist' });
        }

        const hashedPassword = await userModel.hashPassword(password);

        const user = await userService.createUser({
            firstname: fullname.firstname,
            lastname: fullname.lastname,
            email,
            password: hashedPassword
        });

        const token = user.generateAuthToken();

        return res.status(201).json({ token, user: publicUser(user) });

    } catch (error) {
        // two simultaneous registrations with the same email
        if (error.code === 11000) {
            return res.status(400).json({ message: 'User already exist' });
        }

        console.error('Register user error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
};


// POST /users/login
module.exports.loginUser = async (req, res) => {

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { password } = req.body;
        const email = String(req.body.email).toLowerCase().trim();

        const user = await userModel.findOne({ email }).select('+password');

        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = user.generateAuthToken();

        res.cookie('token', token);

        return res.status(200).json({ token, user: publicUser(user) });

    } catch (error) {
        console.error('Login user error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
};


// GET /users/profile
// (also used by ride-service / maps-service / notification-service to verify a user token)
module.exports.getUserProfile = async (req, res) => {
    return res.status(200).json(publicUser(req.user));
};


// GET /users/logout
module.exports.logoutUser = async (req, res) => {

    try {
        const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];

        if (token) {
            try {
                await blackListTokenModel.create({ token });
            } catch (error) {
                if (error.code !== 11000) throw error; // already blacklisted: fine
            }
        }

        res.clearCookie('token');

        return res.status(200).json({ message: 'Logged out' });

    } catch (error) {
        console.error('Logout user error:', error);
        return res.status(500).json({ message: 'Logout failed' });
    }
};


// GET /users/:id   (internal: ride-service shows the passenger to the captain)
// Only what a captain needs: id + name. No email, no password.
module.exports.getUserById = async (req, res) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const user = await userModel.findById(req.params.id).select('fullname');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.status(200).json({ user: { _id: user._id, fullname: user.fullname } });

    } catch (error) {
        console.error('Get user error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
};
