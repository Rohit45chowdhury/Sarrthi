const rideService =
    require('../services/ride.service');

const {
    validationResult
} = require('express-validator');


const {
    sendMessageToSocketId
} = require('../socket');


// =====================================================
// CREATE RIDE
// =====================================================

module.exports.createRide =
    async (req, res) => {

        const errors =
            validationResult(req);


        if (!errors.isEmpty()) {

            return res.status(400).json({
                errors:
                    errors.array()
            });

        }


        const {
            pickup,
            destination,
            vehicleType
        } = req.body;


        try {

            // -----------------------------------------
            // CREATE RIDE
            // -----------------------------------------

            const ride =
                await rideService.createRide({

                    user:
                        req.user._id,

                    pickup,

                    destination,

                    vehicleType

                });


            console.log(
                '=============================='
            );

            console.log(
                'RIDE CREATED'
            );

            console.log(
                'Ride ID:',
                ride._id
            );

            console.log(
                'Vehicle:',
                vehicleType
            );

            console.log(
                'Pickup:',
                pickup
            );

            console.log(
                'Destination:',
                destination
            );

            console.log(
                'Fare:',
                ride.fare
            );

            console.log(
                '=============================='
            );


            // -----------------------------------------
            // FIND NEARBY CAPTAINS
            // -----------------------------------------

            const nearbyCaptains =
                await rideService.getNearbyCaptains({

                    pickup,

                    vehicleType

                });


            console.log(
                'NEARBY CAPTAINS:',
                nearbyCaptains.length
            );


            // -----------------------------------------
            // SEND NEW RIDE NOTIFICATION
            // -----------------------------------------

            nearbyCaptains.forEach(
                ({
                    captain,
                    distance
                }) => {

                    console.log(
                        'Sending ride to captain:',
                        captain._id
                    );


                    sendMessageToSocketId(

                        captain.socketId,

                        {

                            event:
                                'new-ride',


                            data: {

                                rideId:
                                    ride._id,


                                pickup:
                                    ride.pickup,


                                destination:
                                    ride.destination,


                                fare:
                                    ride.fare,


                                vehicleType:
                                    ride.vehicleType,


                                distance:
                                    Number(
                                        distance.toFixed(2)
                                    )

                            }

                        }

                    );

                }
            );


            // -----------------------------------------
            // RESPONSE
            // -----------------------------------------

            return res.status(201).json({

                ride,

                nearbyCaptains:
                    nearbyCaptains.length

            });


        } catch (err) {

            console.error(
                'CREATE RIDE ERROR:',
                err
            );


            return res.status(500).json({

                message:
                    err.message

            });

        }

    };


// =====================================================
// GET FARE
// =====================================================

module.exports.getFare =
    async (req, res) => {

        const errors =
            validationResult(req);


        if (!errors.isEmpty()) {

            return res.status(400).json({

                errors:
                    errors.array()

            });

        }


        const {
            pickup,
            destination
        } = req.query;


        console.log(
            'GET FARE:',
            {
                pickup,
                destination
            }
        );


        if (
            !pickup ||
            !destination
        ) {

            return res.status(400).json({

                message:
                    'Pickup and destination are required'

            });

        }


        try {

            const fare =
                await rideService.getFare(

                    pickup,

                    destination

                );


            return res.status(200).json(
                fare
            );


        } catch (err) {

            console.error(
                'GET FARE ERROR:',
                err
            );


            return res.status(500).json({

                message:
                    err.message

            });

        }

    };


// =====================================================
// CONFIRM / ACCEPT RIDE
// =====================================================

module.exports.confirmRide =
    async (req, res) => {

        const errors =
            validationResult(req);


        if (!errors.isEmpty()) {

            return res.status(400).json({

                errors:
                    errors.array()

            });

        }


        try {

            // -----------------------------------------
            // ACCEPT RIDE
            // -----------------------------------------

            const ride =
                await rideService.confirmRide({

                    rideId:
                        req.body.rideId,

                    captain:
                        req.captain

                });


            console.log(
                '=============================='
            );

            console.log(
                'RIDE ACCEPTED'
            );

            console.log(
                'Ride:',
                ride._id
            );

            console.log(
                'Captain:',
                ride.captain?._id
            );

            console.log(
                'User:',
                ride.user?._id
            );

            console.log(
                '=============================='
            );


            // -----------------------------------------
            // NOTIFY USER
            // -----------------------------------------

            if (
                ride.user &&
                ride.user.socketId
            ) {

                sendMessageToSocketId(

                    ride.user.socketId,

                    {

                        event:
                            'ride-accepted',


                        data: {

                            rideId:
                                ride._id,


                            pickup:
                                ride.pickup,


                            destination:
                                ride.destination,


                            fare:
                                ride.fare,


                            vehicleType:
                                ride.vehicleType,


                            status:
                                ride.status,


                            captain:
                                ride.captain

                        }

                    }

                );

            } else {

                console.log(
                    'User socketId not available'
                );

            }


            return res.status(200).json(
                ride
            );


        } catch (err) {

            console.error(
                'CONFIRM RIDE ERROR:',
                err
            );


            return res.status(500).json({

                message:
                    err.message

            });

        }

    };


// =====================================================
// START RIDE
// =====================================================
// NOT CHANGED
// =====================================================

module.exports.startRide =
    async (req, res) => {

        const errors =
            validationResult(req);


        if (!errors.isEmpty()) {

            return res.status(400).json({

                errors:
                    errors.array()

            });

        }


        try {

            const ride =
                await rideService.startRide({

                    rideId:
                        req.query.rideId,

                    otp:
                        req.query.otp,

                    captain:
                        req.captain

                });


            return res.status(200).json(
                ride
            );


        } catch (err) {

            console.error(
                'START RIDE ERROR:',
                err
            );


            return res.status(500).json({

                message:
                    err.message

            });

        }

    };


// =====================================================
// END RIDE
// =====================================================
// NOT CHANGED
// =====================================================

module.exports.endRide =
    async (req, res) => {

        const errors =
            validationResult(req);


        if (!errors.isEmpty()) {

            return res.status(400).json({

                errors:
                    errors.array()

            });

        }


        try {

            const ride =
                await rideService.endRide({

                    rideId:
                        req.body.rideId,

                    captain:
                        req.captain

                });


            return res.status(200).json(
                ride
            );


        } catch (err) {

            console.error(
                'END RIDE ERROR:',
                err
            );


            return res.status(500).json({

                message:
                    err.message

            });

        }

    };