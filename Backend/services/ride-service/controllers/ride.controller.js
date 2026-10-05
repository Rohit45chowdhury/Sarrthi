const rideService = require('../services/ride.service');
const mapService = require('../services/maps.service');
const { fetchUser, fetchCaptain } = require('../services/profile.service');
const { validationResult } = require('express-validator');

const {
    notifyCaptain,
    notifyUser,
    trackCaptainRide,
    untrackCaptainRide
} = require('../services/notification.service');

const axios = require('axios');
const { CAPTAIN_SERVICE_URL } = require('../services/config');

// Completed ride is available for rating for 30 minutes
const PENDING_RATING_WINDOW_MS = 30 * 60 * 1000;


// ---------------- HELPERS ----------------

// ObjectId | string | object containing _id  ->  id
function getId(value) {
    if (!value) return null;
    if (typeof value === 'object' && value._id) return value._id;
    return value;
}

// Plain object copy of the ride, with OTP stripped
function withoutOtp(ride) {
    const obj = ride?.toObject ? ride.toObject() : { ...ride };
    delete obj.otp;
    delete obj.OTP;
    return obj;
}

// Captain details live in captain-service, so only the id is sent here.
function ratingPayload(ride) {
    const obj = withoutOtp(ride);

    if (obj.captain) {
        obj.captain = { _id: getId(obj.captain) };
    }

    return obj;
}

function validationFailed(req, res) {
    const errors = validationResult(req);
    if (errors.isEmpty()) return false;
    res.status(400).json({ errors: errors.array() });
    return true;
}


// ---------------- CREATE RIDE ----------------
module.exports.createRide = async (req, res) => {
    if (validationFailed(req, res)) return;

    const { pickup, destination, vehicleType } = req.body;

    try {
        const userId = getId(req.user);

        if (!userId) {
            return res.status(401).json({ message: 'User authentication required' });
        }

        const ride = await rideService.createRide({
            user: userId,
            pickup,
            destination,
            vehicleType
        });

        console.log('RIDE CREATED:', ride._id, vehicleType, ride.fare);

        // Ride already exists: a captain-search failure must not turn this into a 500
        let nearbyCaptains = [];
        try {
            nearbyCaptains = await rideService.getNearbyCaptains({ pickup, vehicleType });
        } catch (error) {
            console.error('NEARBY CAPTAINS ERROR:', error.message);
        }

        console.log('NEARBY CAPTAINS:', nearbyCaptains.length);

        // Fire-and-forget: notification.service never throws
        nearbyCaptains.forEach((item) => {
            const captain = item.captain || item;
            const captainId = getId(captain);
            const distance = Number(item.distance || 0);

            if (!captainId) return;

            notifyCaptain(captainId, 'new-ride', {
                rideId: ride._id,
                pickup: ride.pickup,
                destination: ride.destination,
                fare: ride.fare,
                vehicleType: ride.vehicleType,
                status: ride.status,
                distance: Number(distance.toFixed(2))
            });
        });

        return res.status(201).json({
            success: true,
            message: 'Ride created successfully',
            ride: withoutOtp(ride),   // OTP is delivered to the user via ride-accepted
            nearbyCaptains: nearbyCaptains.length
        });

    } catch (error) {
        console.error('CREATE RIDE ERROR:', error);
        return res.status(500).json({ message: error.message });
    }
};


// ---------------- GET FARE ----------------
module.exports.getFare = async (req, res) => {
    if (validationFailed(req, res)) return;

    const { pickup, destination } = req.query;

    try {
        const fare = await rideService.getFare(pickup, destination);
        return res.status(200).json(fare);
    } catch (error) {
        console.error('GET FARE ERROR:', error);
        return res.status(500).json({ message: error.message });
    }
};


// ---------------- CONFIRM RIDE ----------------
module.exports.confirmRide = async (req, res) => {
    if (validationFailed(req, res)) return;

    try {
        const captainId = getId(req.captain);

        if (!captainId) {
            return res.status(401).json({ message: 'Captain authentication required' });
        }

        const ride = await rideService.confirmRide({
            rideId: req.body.rideId,
            captain: captainId
        });

        console.log('RIDE ACCEPTED:', ride._id, 'captain:', captainId);

        const userId = getId(ride.user);

        // start live tracking (fire-and-forget)
        trackCaptainRide({ captainId, rideId: ride._id, userId });

        // pickup coords + both profiles in parallel; any failure degrades to null
        const [pickupCoordinates, userProfile, captainProfile] = await Promise.all([
            mapService.getAddressCoordinates(ride.pickup).catch((error) => {
                console.error('PICKUP COORDINATES ERROR:', error.message);
                return null;
            }),
            fetchUser(userId),
            fetchCaptain(captainId)
        ]);

        // USER gets the full ride (including OTP) + captain details
        if (userId) {
            const full = ride.toObject();

            notifyUser(userId, 'ride-accepted', {
                ...full,
                captain: captainProfile || full.captain,
                pickupCoordinates
            });
        }

        // CAPTAIN response: OTP MUST NOT GO TO CAPTAIN
        const captainView = withoutOtp(ride);
        captainView.user = userProfile || captainView.user;

        return res.status(200).json({
            success: true,
            ...captainView,
            pickupCoordinates
        });

    } catch (error) {
        console.error('CONFIRM RIDE ERROR:', error);
        return res.status(400).json({ message: error.message });
    }
};


// ---------------- START RIDE ----------------
module.exports.startRide = async (req, res) => {
    if (validationFailed(req, res)) return;

    try {
        const captainId = getId(req.captain);

        const ride = await rideService.startRide({
            rideId: req.query.rideId,
            otp: req.query.otp,
            captain: captainId
        });

        const userId = getId(ride.user);

        if (userId) {
            notifyUser(userId, 'ride-started', withoutOtp(ride));
        }

        // switch live tracking to the "ongoing" phase
        trackCaptainRide({ captainId, rideId: ride._id, userId, phase: 'ongoing' });

        return res.status(200).json(withoutOtp(ride));

    } catch (error) {
        console.error('START RIDE ERROR:', error);
        return res.status(400).json({ message: error.message });
    }
};


// ---------------- END RIDE ----------------
module.exports.endRide = async (req, res) => {
    if (validationFailed(req, res)) return;

    try {
        const captainId = getId(req.captain);

        const ride = await rideService.endRide({
            rideId: req.body.rideId,
            captain: captainId
        });

        const userId = getId(ride.user);

        if (userId) {
            notifyUser(userId, 'ride-ended', ratingPayload(ride));
        }

        untrackCaptainRide(captainId);

        console.log('RIDE ENDED:', ride._id);

        return res.status(200).json(withoutOtp(ride));

    } catch (error) {
        console.error('END RIDE ERROR:', error);
        return res.status(400).json({ message: error.message });
    }
};


// ---------------- GET PENDING RATING ----------------
module.exports.getPendingRating = async (req, res) => {
    try {
        const userId = getId(req.user);

        if (!userId) {
            return res.status(401).json({ message: 'User authentication required' });
        }

        const ride = await rideService.getPendingRating({
            userId,
            windowMs: PENDING_RATING_WINDOW_MS
        });

        return res.status(200).json({
            ride: ride ? ratingPayload(ride) : null
        });

    } catch (error) {
        console.error('PENDING RATING ERROR:', error);
        return res.status(500).json({ message: error.message });
    }
};


// ---------------- RATE RIDE ----------------
module.exports.rateRide = async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({
            message: errors.array()[0].msg,
            errors: errors.array()
        });
    }

    const { rideId, comment } = req.body;
    const value = Number(req.body.value);

    try {
        const userId = getId(req.user);

        if (!userId) {
            return res.status(401).json({ message: 'User authentication required' });
        }

        const ride = await rideService.rateRide({ rideId, userId, value, comment });

        if (!ride) {
            return res.status(400).json({
                message: 'Cannot rate this ride (not completed, not yours, or already rated)'
            });
        }

        // Ride rating is saved. A captain-rating failure must not fail the request.
        // Better later: event queue (RabbitMQ / Kafka) with retries.
        const captainId = getId(ride.captain);

        if (captainId) {
            try {
                await axios.patch(
                    `${CAPTAIN_SERVICE_URL}/captains/${captainId}/rating`,
                    { value },
                    {
                        timeout: 5000,
                        headers: process.env.INTERNAL_API_KEY
                            ? { 'x-internal-key': process.env.INTERNAL_API_KEY }
                            : {}
                    }
                );
            } catch (error) {
                console.error(
                    'CAPTAIN RATING UPDATE ERROR:',
                    error.response?.data || error.message
                );
            }
        }

        return res.status(200).json({ success: true, message: 'Thanks for rating' });

    } catch (error) {
        console.error('RATE RIDE ERROR:', error);
        return res.status(500).json({ message: error.message });
    }
};


// ---------------- ACTIVE RIDE OF A CAPTAIN (internal: notification-service) ----------------
module.exports.getActiveRideByCaptain = async (req, res) => {
    try {
        const captainId = req.params.captainId;

        if (!/^[a-f\d]{24}$/i.test(captainId)) {
            return res.status(400).json({ message: 'Invalid captain id' });
        }

        const ride = await rideService.getActiveRideForCaptain(captainId);

        return res.status(200).json({
            ride: ride
                ? {
                    rideId: ride._id,
                    userId: getId(ride.user),
                    status: ride.status
                }
                : null
        });

    } catch (error) {
        console.error('ACTIVE RIDE LOOKUP ERROR:', error);
        return res.status(500).json({ message: error.message });
    }
};


// ---------------- CAPTAIN STATS (internal: captain-service) ----------------
module.exports.getCaptainStats = async (req, res) => {
    try {
        const captainId = req.params.captainId;

        if (!/^[a-f\d]{24}$/i.test(captainId)) {
            return res.status(400).json({ message: 'Invalid captain id' });
        }

        const stats = await rideService.getCaptainStats(captainId);

        return res.status(200).json(stats);

    } catch (error) {
        console.error('CAPTAIN STATS ERROR:', error);
        return res.status(500).json({ message: error.message });
    }
};
