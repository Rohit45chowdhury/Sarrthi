const mongoose = require('mongoose');


const rideSchema = new mongoose.Schema({

    // =========================
    // USER
    // =========================

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },


    // =========================
    // CAPTAIN
    // =========================

    captain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'captain',
    },


    // =========================
    // PICKUP
    // =========================

    pickup: {
        type: String,
        required: true,
    },


    // =========================
    // DESTINATION
    // =========================

    destination: {
        type: String,
        required: true,
    },


    // =========================
    // VEHICLE TYPE
    // =========================

    vehicleType: {
        type: String,
        enum: [
            'car',
            'motorcycle',
            'auto'
        ],
        required: true
    },


    // =========================
    // FARE
    // =========================

    fare: {
        type: Number,
        required: true,
    },


    // =========================
    // STATUS
    // =========================

    status: {
        type: String,

        enum: [
            'pending',
            'accepted',
            'ongoing',
            'completed',
            'cancelled'
        ],

        default: 'pending',
    },


    // =========================
    // DURATION
    // =========================

    duration: {
        type: Number,
    },


    // =========================
    // DISTANCE
    // =========================

    distance: {
        type: Number,
    },


    // =========================
    // PAYMENT
    // =========================

    paymentID: {
        type: String,
    },


    orderId: {
        type: String,
    },


    signature: {
        type: String,
    },


    // =========================
    // OTP
    // =========================

    otp: {
        type: String,
        select: false,
        required: true,
    }

});


module.exports =
    mongoose.model(
        'ride',
        rideSchema
    );