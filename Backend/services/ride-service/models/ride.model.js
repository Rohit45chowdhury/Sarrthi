const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema(
    {
        // refs point to models owned by user-service / captain-service
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
        captain: { type: mongoose.Schema.Types.ObjectId, ref: 'captain' },

        pickup: { type: String, required: true },
        destination: { type: String, required: true },

        vehicleType: {
            type: String,
            enum: ['car', 'motorcycle', 'auto'],
            required: true
        },

        fare: { type: Number, required: true },

        status: {
            type: String,
            enum: ['pending', 'accepted', 'ongoing', 'completed', 'cancelled'],
            default: 'pending'
        },

        duration: { type: Number }, // seconds
        distance: { type: Number }, // metres

        paymentID: { type: String },
        orderId: { type: String },
        signature: { type: String },

        otp: { type: String, select: false, required: true },

        // ===== CANCELLATION =====
        cancelledBy: { type: String, enum: ['user', 'captain'] },
        cancelledAt: { type: Date },
        cancelReason: { type: String, maxlength: 200 },

        // ===== RATING (user rates captain after the ride) =====
        rating: {
            value: { type: Number, min: 1, max: 5 },
            comment: { type: String, maxlength: 300 },
            ratedAt: { type: Date }
        }
    },
    { timestamps: true }
);

// ===== INDEXES =====
// current ride + history lookups (GET /rides/active, /rides/history)
rideSchema.index({ user: 1, status: 1, createdAt: -1 });
rideSchema.index({ captain: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('ride', rideSchema);