const mongoose = require('mongoose');
const bcrypt = require('bcrypt'); // agar tu bcryptjs use karta hai to yahan require('bcryptjs') kar de
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema(
    {
        fullname: {
            firstname: { type: String, required: true, trim: true },
            lastname: { type: String, default: '', trim: true }
        },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },

        // Google / OTP se aaye users ka password nahi hota, isliye required nahi hai
        password: { type: String, select: false },

        googleId: { type: String, unique: true, sparse: true },
        avatar: { type: String, default: '' },
        providers: { type: [String], default: [] }, // 'password', 'email', 'google'
        lastLoginAt: Date

        // NOTE: tere purane model me aur fields hon (jaise socketId) to unhe yahan wapas add kar de
    },
    { timestamps: true }
);

userSchema.statics.hashPassword = function (password) {
    return bcrypt.hash(password, 10);
};

userSchema.methods.comparePassword = async function (password) {
    if (!this.password) return false; // password-less account (Google / OTP)
    return bcrypt.compare(password, this.password);
};

userSchema.methods.generateAuthToken = function () {
    return jwt.sign(
        { _id: this._id, id: this._id, email: this.email, role: 'user' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);