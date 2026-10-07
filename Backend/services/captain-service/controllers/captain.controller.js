const axios = require('axios');
const { validationResult } = require('express-validator');

const captainModel = require('../models/captain.model');
const blackListTokenModel = require('../models/blackListToken.model');
const captainService = require('../services/captain.service');
const { publishLocation } = require('../services/locationKafka.service');

const RIDE_SERVICE_URL = process.env.RIDE_SERVICE_URL || 'http://127.0.0.1:3003';

const VEHICLE_TYPES = ['car', 'motorcycle', 'auto'];


// ---------------- HELPERS ----------------

// Never send the password hash to the client.
// (create() and select('+password') both return it on the document.)
function publicCaptain(captain) {
    const obj = captain?.toObject ? captain.toObject() : { ...captain };
    delete obj.password;
    delete obj.__v;
    return obj;
}

function validationFailed(req, res) {
    const errors = validationResult(req);
    if (errors.isEmpty()) return false;
    res.status(400).json({ errors: errors.array() });
    return true;
}

function normalizeVehicleType(type) {
    const map = { auto: 'auto', car: 'car', moto: 'motorcycle', motorcycle: 'motorcycle', motorcyle: 'motorcycle' };
    return map[String(type || '').toLowerCase().trim()];
}


// ============================================================
// REGISTER CAPTAIN   POST /captains/register
// ============================================================
module.exports.registerCaptain = async (req, res) => {

    try {
        if (validationFailed(req, res)) return;

        const { fullname, password, vehicle } = req.body;
        const email = String(req.body.email).toLowerCase().trim();

        const exists = await captainModel.findOne({ email });

        if (exists) {
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

        return res.status(201).json({ token, captain: publicCaptain(captain) });

    } catch (error) {
        // two simultaneous registrations with the same email
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Captain already exist' });
        }

        console.error('Register captain error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
};





// ============================================================
// LOGIN CAPTAIN   POST /captains/login
// ============================================================
module.exports.loginCaptain = async (req, res) => {

    try {
        if (validationFailed(req, res)) return;

        const { password } = req.body;
        const email = String(req.body.email).toLowerCase().trim();

        const captain = await captainModel.findOne({ email }).select('+password');

        if (!captain) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isMatch = await captain.comparePassword(password);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Captain stays inactive after login; goes online from the dashboard.
        captain.status = 'inactive';
        await captain.save();

        const token = captain.generateAuthToken();

        res.cookie('token', token);

        return res.status(200).json({ token, captain: publicCaptain(captain) });

    } catch (error) {
        console.error('Captain login error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
};


// ============================================================
// PROFILE   GET /captains/profile
// ============================================================
module.exports.getCaptainProfile = async (req, res) => {
    // authCaptain already loaded the captain from the DB
    return res.status(200).json({ captain: publicCaptain(req.captain) });
};


// ============================================================
// STATS   GET /captains/stats
// Rides belong to ride-service, so the numbers come from there.
// ============================================================
module.exports.getCaptainStats = async (req, res) => {

    try {
        const captainId = req.captain._id;

        let rideStats = { trips: 0, totalEarnings: 0, todayEarnings: 0 };

        try {
            const { data } = await axios.get(
                `${RIDE_SERVICE_URL}/rides/internal/captain-stats/${captainId}`,
                {
                    timeout: 5000,
                    headers: { 'x-internal-key': process.env.INTERNAL_API_KEY || '' }
                }
            );
            rideStats = { ...rideStats, ...data };

        } catch (error) {
            console.error('Captain stats (ride-service) error:', error.response?.data || error.message);
            return res.status(503).json({ message: 'Ride service unavailable, try again' });
        }

        return res.status(200).json({
            todayEarnings: Number(rideStats.todayEarnings) || 0,
            totalEarnings: Number(rideStats.totalEarnings) || 0,
            trips: Number(rideStats.trips) || 0,
            rating: Number(req.captain.rating) || 0
        });

    } catch (error) {
        console.error('CAPTAIN STATS ERROR:', error);
        return res.status(500).json({ message: 'Failed to fetch captain stats', error: error.message });
    }
};


// ============================================================
// STATUS   PATCH /captains/status        (captain, own status)
//          PATCH /captains/:id/status    (internal)
// ============================================================
async function setStatus(captainId, status, res) {

    if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status. Must be active or inactive.' });
    }

    const captain = await captainModel.findByIdAndUpdate(
        captainId,
        { status },
        { new: true }
    );

    if (!captain) {
        return res.status(404).json({ message: 'Captain not found' });
    }

    return res.status(200).json({
        message: 'Status updated successfully',
        captain: publicCaptain(captain)
    });
}

module.exports.updateCaptainStatus = async (req, res) => {
    try {
        return await setStatus(req.captain._id, req.body?.status, res);
    } catch (error) {
        console.error('Update status error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
};

module.exports.updateStatusInternal = async (req, res) => {
    if (validationFailed(req, res)) return;

    try {
        return await setStatus(req.params.id, req.body?.status, res);
    } catch (error) {
        console.error('Update status (internal) error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
};


// ============================================================
// LOGOUT   GET /captains/logout
// ============================================================
module.exports.logoutCaptain = async (req, res) => {

    try {
        const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];

        const captain = await captainModel.findByIdAndUpdate(
            req.captain._id,
            { status: 'inactive' },
            { new: true }
        );

        if (!captain) {
            return res.status(404).json({ message: 'Captain not found' });
        }

        if (token) {
            try {
                await blackListTokenModel.create({ token });
            } catch (error) {
                if (error.code !== 11000) throw error; // already blacklisted: fine
            }
        }

        res.clearCookie('token');

        return res.status(200).json({
            message: 'Logout successfully',
            captain: publicCaptain(captain)
        });

    } catch (error) {
        console.error('Logout error:', error);
        return res.status(500).json({ message: 'Logout failed', error: error.message });
    }
};


// ============================================================
// INTERNAL (called by ride-service / notification-service)
// ============================================================

// GET /captains/active?vehicleType=car
// Online captains that have a saved location (ride-service filters by distance).
module.exports.getActiveCaptains = async (req, res) => {

    try {
        const query = {
            status: 'active',
            'location.ltd': { $exists: true, $ne: null },
            'location.lng': { $exists: true, $ne: null }
        };

        if (req.query.vehicleType) {
            const type = normalizeVehicleType(req.query.vehicleType);

            if (!type || !VEHICLE_TYPES.includes(type)) {
                return res.status(400).json({ message: 'Invalid vehicleType' });
            }

            query['vehicle.vehicleType'] = type;
        }

        const captains = await captainModel
            .find(query)
            .select('fullname vehicle location rating')
            .lean();

        return res.status(200).json({ captains });

    } catch (error) {
        console.error('Get active captains error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
};

// GET /captains/:id   (details shown to the passenger)
module.exports.getCaptainById = async (req, res) => {

    if (validationFailed(req, res)) return;

    try {
        const captain = await captainModel.findById(req.params.id);

        if (!captain) {
            return res.status(404).json({ message: 'Captain not found' });
        }

        return res.status(200).json({ captain: publicCaptain(captain) });

    } catch (error) {
        console.error('Get captain error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
};

// PATCH /captains/:id/location   body: { ltd, lng }
// Location Kafka mein jaati hai, consumer DB mein bulk write karta hai.
// Kafka down ho to direct DB write (fallback).
module.exports.updateLocation = async (req, res) => {

    if (validationFailed(req, res)) return;

    try {
        const captainId = req.params.id;
        const ltd = Number(req.body.ltd);
        const lng = Number(req.body.lng);

        const queued = await publishLocation({ captainId, ltd, lng });

        if (queued) {
            return res.status(202).json({ success: true, queued: true });
        }

        // fallback: direct write
        const captain = await captainModel.findByIdAndUpdate(
            captainId,
            { $set: { 'location.ltd': ltd, 'location.lng': lng } },
            { new: true }
        );

        if (!captain) {
            return res.status(404).json({ message: 'Captain not found' });
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Update location error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
};

// PATCH /captains/:id/rating   body: { value }   (1-5)
// Running average, calculated inside MongoDB so two ratings at the same
// time cannot overwrite each other.
module.exports.updateRating = async (req, res) => {

    if (validationFailed(req, res)) return;

    try {
        const value = Number(req.body.value);

        const captain = await captainModel.findByIdAndUpdate(
            req.params.id,
            [
                {
                    $set: {
                        rating: {
                            $round: [
                                {
                                    $divide: [
                                        {
                                            $add: [
                                                { $multiply: [{ $ifNull: ['$rating', 0] }, { $ifNull: ['$ratingCount', 0] }] },
                                                value
                                            ]
                                        },
                                        { $add: [{ $ifNull: ['$ratingCount', 0] }, 1] }
                                    ]
                                },
                                2
                            ]
                        },
                        ratingCount: { $add: [{ $ifNull: ['$ratingCount', 0] }, 1] }
                    }
                }
            ],
            { new: true, updatePipeline: true }
        );

        if (!captain) {
            return res.status(404).json({ message: 'Captain not found' });
        }

        return res.status(200).json({
            success: true,
            rating: captain.rating,
            ratingCount: captain.ratingCount
        });

    } catch (error) {
        console.error('Update rating error:', error);
        return res.status(500).json({ message: 'Server error' });
    }
};
