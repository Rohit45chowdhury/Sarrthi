const mongoose = require('mongoose');
const rideModel = require('../models/ride.model');
const mapService = require('./maps.service');
const http = require('./http');
const { CAPTAIN_SERVICE_URL } = require('./config');
const crypto = require('crypto');

// ---------------- CONFIG ----------------
// Override from .env: NEARBY_RADIUS_KM=5 (production), MAX_CAPTAINS_PER_RIDE=10
const NEARBY_RADIUS_KM = Number(process.env.NEARBY_RADIUS_KM) || 100;
const MAX_CAPTAINS_PER_RIDE = Number(process.env.MAX_CAPTAINS_PER_RIDE) || 10;

// Canonical internal names: auto | car | motorcycle
function normalizeVehicleType(type) {
    const map = {
        auto: 'auto',
        car: 'car',
        moto: 'motorcycle',
        motorcycle: 'motorcycle',
        motorcyle: 'motorcycle'
    };
    return map[String(type || '').toLowerCase().trim()];
}

// Fare object keeps key "moto" for the frontend; this maps vehicleType -> fare key
const FARE_KEY = { auto: 'auto', car: 'car', motorcycle: 'moto' };

// ---------------- GET FARE ----------------
async function getFare(pickup, destination) {
    if (!pickup || !destination) {
        throw new Error('Pickup and destination are required');
    }

    const distanceTime = await mapService.getDistanceTime(
        pickup.trim(),
        destination.trim()
    );

    const distanceKm = distanceTime.distance.value / 1000;
    const durationMin = distanceTime.duration.value / 60;

    const base = { auto: 30, car: 50, moto: 20 };
    const perKm = { auto: 10, car: 15, moto: 8 };
    const perMin = { auto: 2, car: 3, moto: 1.5 };

    const fare = {};
    for (const type of ['auto', 'car', 'moto']) {
        fare[type] = Math.round(
            base[type] + distanceKm * perKm[type] + durationMin * perMin[type]
        );
    }

    return {
        ...fare,
        distance: distanceTime.distance,
        duration: distanceTime.duration,
        distanceInKm: Number(distanceKm.toFixed(2)),
        durationInMinutes: Math.ceil(durationMin)
    };
}
module.exports.getFare = getFare;

// ---------------- OTP ----------------
function getOtp(length) {
    return crypto.randomInt(Math.pow(10, length - 1), Math.pow(10, length)).toString();
}

// ---------------- DISTANCE ----------------
function getDistanceInKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------- NEARBY CAPTAINS ----------------
// Returns [{ captain, distance }] sorted nearest-first.
// Captains come from captain-service (GET /captains/active?vehicleType=...),
// which must return active captains of that type that have a saved location.
module.exports.getNearbyCaptains = async ({ pickup, vehicleType }) => {
    const normalizedType = normalizeVehicleType(vehicleType);

    if (!pickup || !normalizedType) {
        throw new Error('Invalid pickup or vehicle type');
    }

    const { ltd: pickupLat, lng: pickupLng } =
        await mapService.getAddressCoordinates(pickup.trim());

    const { data } = await http.get(`${CAPTAIN_SERVICE_URL}/captains/active`, {
        params: { vehicleType: normalizedType },
        timeout: 5000
    });

    const captains = Array.isArray(data) ? data : (data?.captains || []);

    const nearbyCaptains = [];

    for (const captain of captains) {
        const lat = Number(captain?.location?.ltd);
        const lng = Number(captain?.location?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const distance = getDistanceInKm(pickupLat, pickupLng, lat, lng);

        if (distance <= NEARBY_RADIUS_KM) {
            nearbyCaptains.push({ captain, distance });
        }
    }

    nearbyCaptains.sort((a, b) => a.distance - b.distance);

    console.log(
        `Pickup (${pickupLat}, ${pickupLng}) | active captains: ${captains.length} | within ${NEARBY_RADIUS_KM} km: ${nearbyCaptains.length}`
    );

    return nearbyCaptains.slice(0, MAX_CAPTAINS_PER_RIDE);
};

// ---------------- CREATE RIDE ----------------
module.exports.createRide = async ({ user, pickup, destination, vehicleType }) => {
    if (!user || !pickup || !destination || !vehicleType) {
        throw new Error('All fields are required');
    }

    const normalizedType = normalizeVehicleType(vehicleType);
    if (!normalizedType) {
        throw new Error('Invalid vehicle type');
    }

    const fare = await getFare(pickup, destination);

    // otp is select:false, but create() returns the doc with the value we just set
    return rideModel.create({
        user,
        pickup: pickup.trim(),
        destination: destination.trim(),
        vehicleType: normalizedType,
        otp: getOtp(6),
        fare: fare[FARE_KEY[normalizedType]],
        distance: fare.distance.value,   // metres
        duration: fare.duration.value    // seconds
    });
};

// NOTE: no .populate() anywhere below. User and Captain models belong to other
// services and are not registered in this one (populate would throw MissingSchemaError).
// Controllers fetch profiles via profile.service when they need them.

// ---------------- CONFIRM RIDE ----------------
// `captain` is the captain's id (not an object)
module.exports.confirmRide = async ({ rideId, captain }) => {
    if (!rideId) throw new Error('Ride id is required');
    if (!captain) throw new Error('Captain is required');

    // atomic: only one captain can win a pending ride
    const ride = await rideModel
        .findOneAndUpdate(
            { _id: rideId, status: 'pending' },
            { status: 'accepted', captain },
            { returnDocument: 'after' }
        )
        .select('+otp');

    if (!ride) throw new Error('Ride not found or already accepted');
    return ride;
};

// ---------------- START RIDE ----------------
module.exports.startRide = async ({ rideId, otp, captain }) => {
    if (!rideId || !otp) throw new Error('Ride id and OTP are required');
    if (!captain) throw new Error('Captain is required');

    const ride = await rideModel
        .findOne({ _id: rideId, captain })
        .select('+otp');

    if (!ride) throw new Error('Ride not found');
    if (ride.status !== 'accepted') throw new Error('Ride not accepted');
    if (ride.otp !== String(otp)) throw new Error('Invalid OTP');

    ride.status = 'ongoing';
    await ride.save();
    return ride;
};

// ---------------- END RIDE ----------------
module.exports.endRide = async ({ rideId, captain }) => {
    if (!rideId) throw new Error('Ride id is required');
    if (!captain) throw new Error('Captain is required');

    const ride = await rideModel
        .findOne({ _id: rideId, captain })
        .select('+otp');

    if (!ride) throw new Error('Ride not found');
    if (ride.status !== 'ongoing') throw new Error('Ride not ongoing');

    ride.status = 'completed';
    await ride.save();
    return ride;
};

// ---------------- PENDING RATING ----------------
// Latest completed, un-rated ride of this user inside the rating window
module.exports.getPendingRating = async ({ userId, windowMs }) => {
    return rideModel
        .findOne({
            user: userId,
            status: 'completed',
            'rating.value': { $exists: false },
            updatedAt: { $gte: new Date(Date.now() - windowMs) }
        })
        .sort({ updatedAt: -1 });
};

// ---------------- RATE RIDE ----------------
// Returns null if the ride is not completed, not this user's, or already rated
module.exports.rateRide = async ({ rideId, userId, value, comment }) => {
    return rideModel.findOneAndUpdate(
        {
            _id: rideId,
            user: userId,
            status: 'completed',
            'rating.value': { $exists: false }
        },
        {
            $set: {
                rating: {
                    value,
                    comment: comment ? String(comment).trim() : undefined,
                    ratedAt: new Date()
                }
            }
        },
        { returnDocument: 'after' }
    );
};

// ---------------- ACTIVE RIDE FOR CAPTAIN ----------------
// Latest accepted/ongoing ride (used by notification-service for live tracking)
module.exports.getActiveRideForCaptain = async (captainId) => {
    return rideModel
        .findOne({ captain: captainId, status: { $in: ['accepted', 'ongoing'] } })
        .sort({ _id: -1 })
        .select('user status');
};

// ---------------- CAPTAIN STATS ----------------
// Completed trips + earnings (used by captain-service GET /captains/stats)
module.exports.getCaptainStats = async (captainId) => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [row] = await rideModel.aggregate([
        {
            $match: {
                captain: new mongoose.Types.ObjectId(String(captainId)),
                status: 'completed'
            }
        },
        {
            $group: {
                _id: null,
                trips: { $sum: 1 },
                totalEarnings: { $sum: { $ifNull: ['$fare', 0] } },
                todayEarnings: {
                    $sum: {
                        $cond: [{ $gte: ['$updatedAt', startOfToday] }, { $ifNull: ['$fare', 0] }, 0]
                    }
                }
            }
        }
    ]);

    return {
        trips: row?.trips || 0,
        totalEarnings: row?.totalEarnings || 0,
        todayEarnings: row?.todayEarnings || 0
    };
};
