const mongoose = require('mongoose');

const bcrypt = require('bcrypt');

const jwt = require('jsonwebtoken');


const userSchema = new mongoose.Schema({

    // =========================
    // FULL NAME
    // =========================

    fullname: {

        firstname: {

            type: String,

            required: true,

            minlength: [
                3,
                'First name must be at least 3 characters long'
            ],

        },

        lastname: {

            type: String,

            minlength: [
                3,
                'Last name must be at least 3 characters long'
            ],

        }

    },


    // =========================
    // EMAIL
    // =========================

    email: {

        type: String,

        required: true,

        unique: true,

        minlength: [
            5,
            'Email must be at least 5 characters long'
        ],

    },


    // =========================
    // PASSWORD
    // =========================

    password: {

        type: String,

        required: true,

        select: false,

    },


    // =========================
    // SOCKET ID
    // =========================

    socketId: {

        type: String,

        default: null

    }

});


// =========================
// AUTH TOKEN
// =========================

userSchema.methods.generateAuthToken =
    function () {

        const token = jwt.sign(
            {
                _id: this._id
            },

            process.env.JWT_SECRET,

            {
                expiresIn: '24h'
            }
        );

        return token;
    };


// =========================
// COMPARE PASSWORD
// =========================

userSchema.methods.comparePassword =
    async function (password) {

        return await bcrypt.compare(
            password,
            this.password
        );

    };


// =========================
// HASH PASSWORD
// =========================

userSchema.statics.hashPassword =
    async function (password) {

        return await bcrypt.hash(
            password,
            10
        );

    };


const userModel =
    mongoose.model(
        'user',
        userSchema
    );


module.exports = userModel;