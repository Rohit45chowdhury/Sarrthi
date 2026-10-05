const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');


const userSchema = new mongoose.Schema({

    fullname: {
        firstname: {
            type: String,
            required: true,
            minlength: [3, 'First name must be at least 3 characters long']
        },
        lastname: {
            type: String,
            minlength: [3, 'Last name must be at least 3 characters long']
        }
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,   // "A@x.com" and "a@x.com" are the same account
        trim: true,
        minlength: [5, 'Email must be at least 5 characters long']
    },

    password: {
        type: String,
        required: true,
        select: false
    }

    // NOTE: socketId was removed. Sockets now live in notification-service.

});


userSchema.methods.generateAuthToken = function () {
    return jwt.sign(
        { _id: this._id },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
};

userSchema.methods.comparePassword = async function (password) {
    return await bcrypt.compare(password, this.password);
};

userSchema.statics.hashPassword = async function (password) {
    return await bcrypt.hash(password, 10);
};


module.exports = mongoose.model('user', userSchema);
