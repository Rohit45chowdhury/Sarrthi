const rideService = require('../services/ride.service');
const { validationResult } = require('express-validator');
const { sendMessageToSocketId, trackCaptainRide } = require('../socket');
const mapService = require('../services/maps.service');

// Remove otp before sending a ride to a captain
function withoutOtp(ride) {
    const obj = ride.toObject ? ride.toObject() : { ...ride };
    delete obj.otp;
    return obj;
}

// ================= CREATE RIDE =================
module.exports.createRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { pickup, destination, vehicleType } = req.body;

    try {
        const ride = await rideService.createRide({
            user: req.user._id,
            pickup,
            destination,
            vehicleType
        });

        console.log('RIDE CREATED:', ride._id, vehicleType, ride.fare);

        // A failure finding captains must not turn a created ride into a 500
        let nearbyCaptains = [];
        try {
            nearbyCaptains = await rideService.getNearbyCaptains({ pickup, vehicleType });
        } catch (err) {
            console.error('NEARBY CAPTAINS ERROR:', err.message);
        }

        console.log('NEARBY CAPTAINS:', nearbyCaptains.length);

        // Ride with populated user (no otp) so the captain popup has user details
        const rideForCaptains = await rideService.getRideWithUser(ride._id);

        nearbyCaptains.forEach(({ captain, distance }) => {
            console.log('Sending ride to captain:', captain._id);

            sendMessageToSocketId(captain.socketId, {
                event: 'new-ride',
                data: {
                    ...withoutOtp(rideForCaptains),
                    rideId: ride._id,
                    distance: Number(distance.toFixed(2))
                }
            });
        });

        return res.status(201).json({
            ride,
            nearbyCaptains: nearbyCaptains.length
        });
    } catch (err) {
        console.error('CREATE RIDE ERROR:', err);
        return res.status(500).json({ message: err.message });
    }
};

// ================= GET FARE =================
module.exports.getFare = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { pickup, destination } = req.query;

    try {
        const fare = await rideService.getFare(pickup, destination);
        return res.status(200).json(fare);
    } catch (err) {
        console.error('GET FARE ERROR:', err);
        return res.status(500).json({ message: err.message });
    }
};

// ================= CONFIRM RIDE =================
module.exports.confirmRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const ride = await rideService.confirmRide({
            rideId: req.body.rideId,
            captain: req.captain
        });

        console.log('RIDE ACCEPTED:', ride._id, 'captain:', ride.captain?._id);

        // LIVE TRACKING: from now on the captain's location updates are also
        // sent to this ride's passenger ("captain-location-update").
        trackCaptainRide({
            captainId: ride.captain?._id,
            rideId: ride._id,
            userId: ride.user?._id
        });

        // Pickup coordinates for the live map. The address was already
        // geocoded when the ride was created, so this normally comes from the
        // cache. If it fails the ride still works (the map then tries itself).
        let pickupCoordinates = null;
        try {
            const point = await mapService.getAddressCoordinates(ride.pickup);
            pickupCoordinates = { ltd: point.ltd, lng: point.lng };
        } catch (err) {
            console.error('PICKUP COORDINATES ERROR:', err.message);
        }

        if (ride.user && ride.user.socketId) {
            // User gets the full ride INCLUDING otp (they must tell it to the captain)
            sendMessageToSocketId(ride.user.socketId, {
                event: 'ride-accepted',
                data: { ...ride.toObject(), pickupCoordinates }
            });
        } else {
            console.log('User socketId not available');
        }

        // Captain must NOT receive the otp
        return res.status(200).json({ ...withoutOtp(ride), pickupCoordinates });
    } catch (err) {
        console.error('CONFIRM RIDE ERROR:', err);
        return res.status(500).json({ message: err.message });
    }
};

// ================= START RIDE =================
module.exports.startRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const ride = await rideService.startRide({
            rideId: req.query.rideId,
            otp: req.query.otp,
            captain: req.captain
        });

        if (ride.user && ride.user.socketId) {
            sendMessageToSocketId(ride.user.socketId, {
                event: 'ride-started',
                data: withoutOtp(ride)
            });
        }

        return res.status(200).json(withoutOtp(ride));
    } catch (err) {
        console.error('START RIDE ERROR:', err);
        return res.status(500).json({ message: err.message });
    }
};

// ================= END RIDE =================
module.exports.endRide = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const ride = await rideService.endRide({
            rideId: req.body.rideId,
            captain: req.captain
        });

        if (ride.user && ride.user.socketId) {
            sendMessageToSocketId(ride.user.socketId, {
                event: 'ride-ended',
                data: withoutOtp(ride)
            });
        }

        return res.status(200).json(withoutOtp(ride));
    } catch (err) {
        console.error('END RIDE ERROR:', err);
        return res.status(500).json({ message: err.message });
    }
};