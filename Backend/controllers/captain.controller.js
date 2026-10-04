const captainModel = require('../models/captain.model');
const captainService = require('../services/captain.service');
const blackListTokenModel = require('../models/blackListToken.model');
const rideModel = require('../models/ride.model');

const { validationResult } = require('express-validator');


// ============================================================
// REGISTER CAPTAIN
// ============================================================
module.exports.registerCaptain = async (req, res, next) => {

    try {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                errors: errors.array()
            });
        }

        const {
            fullname,
            email,
            password,
            vehicle
        } = req.body;


        const isCaptainAlreadyExist =
            await captainModel.findOne({ email });


        if (isCaptainAlreadyExist) {
            return res.status(400).json({
                message: 'Captain already exist'
            });
        }


        const hashedPassword =
            await captainModel.hashPassword(password);


        const captain =
            await captainService.createCaptain({

                firstname: fullname.firstname,

                lastname: fullname.lastname,

                email,

                password: hashedPassword,

                color: vehicle.color,

                plate: vehicle.plate,

                capacity: vehicle.capacity,

                vehicleType: vehicle.vehicleType

            });


        const token =
            captain.generateAuthToken();


        return res.status(201).json({
            token,
            captain
        });

    } catch (error) {

        console.error(
            'Register captain error:',
            error
        );

        return res.status(500).json({
            message: 'Server error'
        });

    }
};


// ============================================================
// LOGIN CAPTAIN
// ============================================================
module.exports.loginCaptain = async (req, res, next) => {

    try {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                errors: errors.array()
            });
        }


        const {
            email,
            password
        } = req.body;


        const captain =
            await captainModel
                .findOne({ email })
                .select('+password');


        if (!captain) {
            return res.status(401).json({
                message: 'Invalid email or password'
            });
        }


        const isMatch =
            await captain.comparePassword(password);


        if (!isMatch) {
            return res.status(401).json({
                message: 'Invalid email or password'
            });
        }


        // Login ke baad captain inactive rahega.
        // Captain dashboard se manually online hoga.
        captain.status = 'inactive';

        await captain.save();


        const token =
            captain.generateAuthToken();


        res.cookie('token', token);


        return res.status(200).json({

            token,

            captain

        });

    } catch (error) {

        console.error(
            'Captain login error:',
            error
        );

        return res.status(500).json({
            message: 'Server error'
        });

    }
};


// ============================================================
// GET CAPTAIN PROFILE
// GET /captains/profile
// ============================================================
module.exports.getCaptainProfile = async (req, res, next) => {

    try {

        const captain =
            await captainModel.findById(
                req.captain._id
            );


        if (!captain) {

            return res.status(404).json({
                message: 'Captain not found'
            });

        }


        return res.status(200).json({
            captain
        });

    } catch (error) {

        console.error(
            'Get captain profile error:',
            error
        );

        return res.status(500).json({
            message: 'Server error'
        });

    }
};


// ============================================================
// GET CAPTAIN STATS
// GET /captains/stats
// ============================================================
module.exports.getCaptainStats = async (req, res) => {

    try {

        console.log('================================')
        console.log('GET /captains/stats')
        console.log('Captain:', req.captain)


        // =====================================================
        // CAPTAIN ID
        // =====================================================

        const captainId = req.captain?._id


        if (!captainId) {

            console.log('❌ Captain ID missing')

            return res.status(401).json({
                message: 'Captain authentication required'
            })

        }


        console.log('Captain ID:', captainId)


        // =====================================================
        // FIND COMPLETED RIDES
        // =====================================================

        const completedRides = await rideModel.find({
            captain: captainId,
            status: 'completed'
        })


        console.log(
            'Completed rides:',
            completedRides.length
        )


        // =====================================================
        // TOTAL TRIPS
        // =====================================================

        const trips = completedRides.length


        // =====================================================
        // TOTAL EARNINGS
        // =====================================================

        const totalEarnings = completedRides.reduce(
            (sum, ride) => {

                const fare = Number(ride.fare) || 0

                return sum + fare

            },
            0
        )


        // =====================================================
        // TODAY START
        // =====================================================

        const startOfToday = new Date()

        startOfToday.setHours(
            0,
            0,
            0,
            0
        )


        // =====================================================
        // TODAY'S EARNINGS
        // =====================================================

        const todayEarnings = completedRides.reduce(
            (sum, ride) => {

                // Safely get ride date
                const rideDate =
                    ride.updatedAt ||
                    ride.createdAt


                if (!rideDate) {
                    return sum
                }


                const date =
                    new Date(rideDate)


                if (
                    !isNaN(date.getTime()) &&
                    date >= startOfToday
                ) {

                    return sum +
                        (Number(ride.fare) || 0)

                }


                return sum

            },
            0
        )


        // =====================================================
        // CAPTAIN RATING
        // =====================================================

        const captain =
            await captainModel
                .findById(captainId)
                .select('rating')


        if (!captain) {

            return res.status(404).json({
                message: 'Captain not found'
            })

        }


        const rating =
            Number(captain.rating) || 0


        // =====================================================
        // FINAL RESPONSE
        // =====================================================

        const stats = {

            todayEarnings,

            totalEarnings,

            trips,

            rating

        }


        console.log(
            '✅ Captain stats:',
            stats
        )


        return res.status(200).json(stats)


    } catch (error) {

        console.error(
            '❌ CAPTAIN STATS ERROR'
        )

        console.error(
            error
        )

        return res.status(500).json({

            message:
                'Failed to fetch captain stats',

            error:
                error.message

        })

    }

}


// ============================================================
// UPDATE CAPTAIN STATUS
// PATCH /captains/status
// ============================================================
module.exports.updateCaptainStatus = async (
    req,
    res,
    next
) => {

    try {

        const { status } =
            req.body;


        if (
            !status ||
            !['active', 'inactive'].includes(status)
        ) {

            return res.status(400).json({

                message:
                    'Invalid status. Must be active or inactive.'

            });

        }


        const captain =
            await captainModel.findByIdAndUpdate(

                req.captain._id,

                {
                    status
                },

                {
                    new: true
                }

            );


        if (!captain) {

            return res.status(404).json({

                message:
                    'Captain not found'

            });

        }


        return res.status(200).json({

            message:
                'Status updated successfully',

            captain

        });

    } catch (error) {

        console.error(
            'Update status error:',
            error
        );

        return res.status(500).json({

            message:
                'Server error'

        });

    }
};


// ============================================================
// LOGOUT CAPTAIN
// GET /captains/logout
// ============================================================
module.exports.logoutCaptain = async (
    req,
    res,
    next
) => {

    try {

        const token =
            req.cookies?.token ||
            req.headers.authorization?.split(' ')[1];


        // =====================================================
        // CAPTAIN INACTIVE
        // =====================================================
        const captain =
            await captainModel.findByIdAndUpdate(

                req.captain._id,

                {
                    status: 'inactive',

                    socketId: null

                },

                {
                    new: true
                }

            );


        if (!captain) {

            return res.status(404).json({

                message:
                    'Captain not found'

            });

        }


        // =====================================================
        // BLACKLIST TOKEN
        // =====================================================
        if (token) {

            await blackListTokenModel.create({
                token
            });

        }


        // =====================================================
        // CLEAR COOKIE
        // =====================================================
        res.clearCookie('token');


        return res.status(200).json({

            message:
                'Logout successfully',

            captain

        });

    } catch (error) {

        console.error(
            'Logout error:',
            error
        );

        return res.status(500).json({

            message:
                'Logout failed',

            error:
                error.message

        });

    }

};