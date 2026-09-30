const rideModel =
    require('../models/ride.model');

const captainModel =
    require('../models/captain.model');

const mapService =
    require('./maps.service');

const crypto =
    require('crypto');


// =====================================================
// GET FARE
// =====================================================

async function getFare(
    pickup,
    destination
) {

    if (!pickup || !destination) {

        throw new Error(
            'Pickup and destination are required'
        );
    }


    const distanceTime =
        await mapService.getDistanceTime(
            pickup.trim(),
            destination.trim()
        );


    const distanceKm =
        distanceTime.distance.value / 1000;


    const durationMin =
        distanceTime.duration.value / 60;


    const base = {

        auto: 30,

        car: 50,

        moto: 20

    };


    const perKm = {

        auto: 10,

        car: 15,

        moto: 8

    };


    const perMin = {

        auto: 2,

        car: 3,

        moto: 1.5

    };


    const fare = {

        auto: Math.round(
            base.auto +
            distanceKm * perKm.auto +
            durationMin * perMin.auto
        ),

        car: Math.round(
            base.car +
            distanceKm * perKm.car +
            durationMin * perMin.car
        ),

        moto: Math.round(
            base.moto +
            distanceKm * perKm.moto +
            durationMin * perMin.moto
        )

    };


    return {

        auto: fare.auto,

        car: fare.car,

        moto: fare.moto,

        distance:
            distanceTime.distance,

        duration:
            distanceTime.duration,

        distanceInKm:
            Number(
                distanceKm.toFixed(2)
            ),

        durationInMinutes:
            Math.ceil(durationMin)

    };

}


module.exports.getFare =
    getFare;


// =====================================================
// OTP
// =====================================================

function getOtp(length) {

    return crypto
        .randomInt(
            Math.pow(10, length - 1),
            Math.pow(10, length)
        )
        .toString();

}


// =====================================================
// DISTANCE BETWEEN TWO COORDINATES
// =====================================================

function getDistanceInKm(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R = 6371;


    const dLat =
        (lat2 - lat1) *
        Math.PI /
        180;


    const dLon =
        (lon2 - lon1) *
        Math.PI /
        180;


    const a =

        Math.sin(dLat / 2) *
        Math.sin(dLat / 2)

        +

        Math.cos(
            lat1 * Math.PI / 180
        )

        *

        Math.cos(
            lat2 * Math.PI / 180
        )

        *

        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);


    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );


    return R * c;

}


// =====================================================
// FIND NEARBY CAPTAINS
// =====================================================

module.exports.getNearbyCaptains =
    async ({
        pickup,
        vehicleType
    }) => {

        if (!pickup || !vehicleType) {

            throw new Error(
                'Pickup and vehicleType are required'
            );

        }


        // ---------------------------------------------
        // GET PICKUP COORDINATES
        // ---------------------------------------------

        const pickupCoordinates =
            await mapService.getAddressCoordinates(
                pickup.trim()
            );


        if (!pickupCoordinates) {

            throw new Error(
                'Unable to find pickup coordinates'
            );

        }


        console.log(
            'PICKUP COORDINATES:',
            pickupCoordinates
        );


        const pickupLat =
            Number(
                pickupCoordinates.lat
            );


        const pickupLng =
            Number(
                pickupCoordinates.lng
            );


        if (
            Number.isNaN(pickupLat) ||
            Number.isNaN(pickupLng)
        ) {

            throw new Error(
                'Invalid pickup coordinates'
            );

        }


        // ---------------------------------------------
        // FIND ACTIVE CAPTAINS
        // ---------------------------------------------

        const captains =
            await captainModel.find({

                status: 'active',

                'vehicle.vehicleType':
                    vehicleType,

                'location.ltd': {
                    $exists: true
                },

                'location.lng': {
                    $exists: true
                },

                socketId: {
                    $exists: true,
                    $ne: null
                }

            });


        console.log(
            'ACTIVE CAPTAINS:',
            captains.length
        );


        const nearbyCaptains = [];


        // ---------------------------------------------
        // CHECK DISTANCE
        // ---------------------------------------------

        for (
            const captain
            of captains
        ) {

            const captainLat =
                Number(
                    captain.location.ltd
                );


            const captainLng =
                Number(
                    captain.location.lng
                );


            if (
                Number.isNaN(captainLat) ||
                Number.isNaN(captainLng)
            ) {

                continue;

            }


            const distance =
                getDistanceInKm(
                    pickupLat,
                    pickupLng,
                    captainLat,
                    captainLng
                );


            console.log(
                `Captain ${captain._id} distance: ${distance.toFixed(2)} KM`
            );


            // -----------------------------------------
            // 5 KM RADIUS
            // -----------------------------------------

            if (distance <= 5) {

                nearbyCaptains.push({

                    captain,

                    distance

                });

            }

        }


        return nearbyCaptains;

    };


// =====================================================
// CREATE RIDE
// =====================================================

module.exports.createRide =
    async ({
        user,
        pickup,
        destination,
        vehicleType
    }) => {

        if (
            !user ||
            !pickup ||
            !destination ||
            !vehicleType
        ) {

            throw new Error(
                'All fields are required'
            );

        }


        // ---------------------------------------------
        // GET FARE
        // ---------------------------------------------

        const fare =
            await getFare(
                pickup,
                destination
            );


        // ---------------------------------------------
        // MOTORCYCLE -> MOTO
        // ---------------------------------------------

        const fareVehicleType =
            vehicleType === 'motorcycle'
                ? 'moto'
                : vehicleType;


        if (
            fare[fareVehicleType] === undefined
        ) {

            throw new Error(
                'Invalid vehicle type'
            );

        }


        // ---------------------------------------------
        // CREATE RIDE
        // ---------------------------------------------

        const ride =
            await rideModel.create({

                user,

                pickup,

                destination,

                vehicleType,

                otp:
                    getOtp(6),

                fare:
                    fare[fareVehicleType]

            });


        return ride;

    };


// =====================================================
// CONFIRM / ACCEPT RIDE
// =====================================================

module.exports.confirmRide =
    async ({
        rideId,
        captain
    }) => {

        if (!rideId) {

            throw new Error(
                'Ride id is required'
            );

        }


        if (!captain?._id) {

            throw new Error(
                'Captain is required'
            );

        }


        // ---------------------------------------------
        // ONLY PENDING RIDE CAN BE ACCEPTED
        // ---------------------------------------------

        const ride =
            await rideModel.findOneAndUpdate(

                {
                    _id: rideId,

                    status: 'pending'
                },

                {

                    status: 'accepted',

                    captain:
                        captain._id

                },

                {

                    new: true

                }

            )

                .populate('user')

                .populate('captain')

                .select('+otp');


        if (!ride) {

            throw new Error(
                'Ride not found or already accepted'
            );

        }


        return ride;

    };


// =====================================================
// START RIDE
// =====================================================
// EXISTING CODE - NOT CHANGED
// =====================================================

module.exports.startRide =
    async ({
        rideId,
        otp,
        captain
    }) => {

        if (!rideId || !otp) {

            throw new Error(
                'Ride id and OTP are required'
            );

        }


        if (!captain?._id) {

            throw new Error(
                'Captain is required'
            );

        }


        const ride =
            await rideModel.findOne({

                _id: rideId,

                captain:
                    captain._id

            })

                .populate('user')

                .populate('captain')

                .select('+otp');


        if (!ride)
            throw new Error(
                'Ride not found'
            );


        if (
            ride.status !== 'accepted'
        ) {

            throw new Error(
                'Ride not accepted'
            );

        }


        if (
            ride.otp !== otp
        ) {

            throw new Error(
                'Invalid OTP'
            );

        }


        ride.status =
            'ongoing';


        await ride.save();


        return ride;

    };


// =====================================================
// END RIDE
// =====================================================
// EXISTING CODE - NOT CHANGED
// =====================================================

module.exports.endRide =
    async ({
        rideId,
        captain
    }) => {

        if (!rideId) {

            throw new Error(
                'Ride id is required'
            );

        }


        if (!captain?._id) {

            throw new Error(
                'Captain is required'
            );

        }


        const ride =
            await rideModel.findOne({

                _id: rideId,

                captain:
                    captain._id

            })

                .populate('user')

                .populate('captain')

                .select('+otp');


        if (!ride)
            throw new Error(
                'Ride not found'
            );


        if (
            ride.status !== 'ongoing'
        ) {

            throw new Error(
                'Ride not ongoing'
            );

        }


        ride.status =
            'completed';


        await ride.save();


        return ride;

    };