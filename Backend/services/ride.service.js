const rideModel = require('../models/ride.model');
const captainModel = require('../models/captain.model');
const mapService = require('./maps.service');
const crypto = require('crypto');

// ---------------- CONFIG ----------------
// Override from .env: NEARBY_RADIUS_KM=5 (production), MAX_CAPTAINS_PER_RIDE=10
const NEARBY_RADIUS_KM = Number(process.env.NEARBY_RADIUS_KM) || 100;
const MAX_CAPTAINS_PER_RIDE = Number(process.env.MAX_CAPTAINS_PER_RIDE) || 10;

// Canonical internal names: auto | car | motorcycle  (matches routes + models)
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
// Only captains that are: active, same vehicle type, have a saved location
// and a saved socketId, and are within NEARBY_RADIUS_KM of the pickup.
module.exports.getNearbyCaptains = async ({ pickup, vehicleType }) => {
    const normalizedType = normalizeVehicleType(vehicleType);

    if (!pickup || !normalizedType) {
        throw new Error('Invalid pickup or vehicle type');
    }

    const pickupCoordinates = await mapService.getAddressCoordinates(pickup.trim());
    if (!pickupCoordinates) {
        throw new Error('Unable to find pickup coordinates');
    }

    const pickupLat = Number(pickupCoordinates.lat);
    const pickupLng = Number(pickupCoordinates.lng);
    if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
        throw new Error('Invalid pickup coordinates');
    }

    const captains = await captainModel.find({
        status: 'active',
        'vehicle.vehicleType': normalizedType,
        'location.ltd': { $exists: true, $ne: null },
        'location.lng': { $exists: true, $ne: null },
        socketId: { $exists: true, $ne: null }
    });

    const nearbyCaptains = [];

    for (const captain of captains) {
        const lat = Number(captain.location.ltd);
        const lng = Number(captain.location.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const distance = getDistanceInKm(pickupLat, pickupLng, lat, lng);

        if (distance <= NEARBY_RADIUS_KM) {
            nearbyCaptains.push({ captain, distance });
        }
    }

    // nearest captain first, and only the closest few get the popup
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

// Ride with populated user, WITHOUT otp (safe to send to captains)
module.exports.getRideWithUser = async (rideId) => {
    return rideModel.findById(rideId).populate('user');
};

// ---------------- CONFIRM RIDE ----------------
module.exports.confirmRide = async ({ rideId, captain }) => {
    if (!rideId) throw new Error('Ride id is required');
    if (!captain?._id) throw new Error('Captain is required');

    const ride = await rideModel
        .findOneAndUpdate(
            { _id: rideId, status: 'pending' },
            { status: 'accepted', captain: captain._id },
            { returnDocument: 'after' }
        )
        .populate('user')
        .populate('captain')
        .select('+otp');

    if (!ride) throw new Error('Ride not found or already accepted');
    return ride;
};

// ---------------- START RIDE ----------------
module.exports.startRide = async ({ rideId, otp, captain }) => {
    if (!rideId || !otp) throw new Error('Ride id and OTP are required');
    if (!captain?._id) throw new Error('Captain is required');

    const ride = await rideModel
        .findOne({ _id: rideId, captain: captain._id })
        .populate('user')
        .populate('captain')
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
    if (!captain?._id) throw new Error('Captain is required');

    const ride = await rideModel
        .findOne({ _id: rideId, captain: captain._id })
        .populate('user')
        .populate('captain')
        .select('+otp');

    if (!ride) throw new Error('Ride not found');
    if (ride.status !== 'ongoing') throw new Error('Ride not ongoing');

    ride.status = 'completed';
    await ride.save();
    return ride;
};