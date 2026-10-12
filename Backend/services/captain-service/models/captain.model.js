const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Indian plates: BR01AB1234, DL1CAB1234 and BH series: 22BH1234AA
const PLATE_REGEX = /^([A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/;
// Driving license: 2 letters + 2 digit RTO + 4 digit year + 7 digits
const LICENSE_REGEX = /^[A-Z]{2}[0-9]{2}(19|20)[0-9]{2}[0-9]{7}$/;

// Max passengers (excluding driver) per vehicle type
const CAPACITY_LIMITS = { motorcycle: 1, auto: 3, car: 8 };

const normalize = (v) =>
    typeof v === 'string' ? v.toUpperCase().replace(/[\s-]/g, '') : v;


const captainSchema = new mongoose.Schema({

    fullname: {
        firstname: {
            type: String,
            required: true,
            trim: true,
            minlength: [3, 'Firstname must be at least 3 characters long']
        },
        lastname: {
            type: String,
            trim: true,
            minlength: [3, 'Lastname must be at least 3 characters long']
        }
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },

    password: {
        type: String,
        required: true,
        select: false
    },

    // Driving license (optional, stored normalized e.g. BR0620201234567)
    licenseNumber: {
        type: String,
        unique: true,
        sparse: true,
        set: (v) => normalize(v) || undefined,   // "" ko undefined bana do, warna unique conflict
        validate: {
            validator: (v) => LICENSE_REGEX.test(v),
            message: 'Invalid driving license number'
        }
    },

    // Auto verification result. Validation pass hui to hi captain save hota hai,
    // isliye default 'verified' hai.
    verification: {
        status: {
            type: String,
            enum: ['pending', 'verified', 'rejected'],
            default: 'verified'
        },
        method: { type: String, default: 'auto' },
        verifiedAt: { type: Date, default: Date.now }
    },

    // online / offline (captain toggles it; notification-service sets it
    // to inactive when the captain's last socket disconnects)
    // NOTE: socketId was removed. Sockets now live in notification-service.
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'inactive'
    },

    vehicle: {
        color: {
            type: String,
            required: true,
            trim: true,
            minlength: [3, 'Color must be at least 3 characters long']
        },

        // Vehicle model, e.g. "Swift Dzire", "Activa 6G"
        // required nahi hai taaki purane captains ka save() (login) fail na ho.
        // Naye signup par route validator isse required karta hai.
        model: {
            type: String,
            trim: true,
            minlength: [2, 'Vehicle model must be at least 2 characters long'],
            maxlength: [40, 'Vehicle model must be at most 40 characters long']
        },

        plate: {
            type: String,
            required: [true, 'Vehicle number is required'],
            unique: true,
            set: normalize,                       // "br 01-ab 1234" -> "BR01AB1234"
            validate: {
                validator: (v) => PLATE_REGEX.test(v),
                message: 'Invalid vehicle number (example: BR01AB1234)'
            }
        },
        capacity: {
            type: Number,
            required: true,
            min: [1, 'Capacity must be at least 1']
        },
        vehicleType: {
            type: String,
            required: true,
            enum: ['car', 'motorcycle', 'auto']
        }
    },

    location: {
        ltd: { type: Number },
        lng: { type: Number }
    },

    rating: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 }

});


// Capacity vehicle type ke hisaab se check karo
captainSchema.pre('validate', function (next) {
    const type = this.vehicle && this.vehicle.vehicleType;
    const cap = this.vehicle && this.vehicle.capacity;

    if (type && cap && CAPACITY_LIMITS[type] && cap > CAPACITY_LIMITS[type]) {
        this.invalidate(
            'vehicle.capacity',
            `A ${type} can carry at most ${CAPACITY_LIMITS[type]} passenger(s)`
        );
    }
    next();
});


captainSchema.methods.generateAuthToken = function () {
    return jwt.sign(
        { _id: this._id },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
};

captainSchema.methods.comparePassword = async function (password) {
    return await bcrypt.compare(password, this.password);
};

captainSchema.statics.hashPassword = async function (password) {
    return await bcrypt.hash(password, 10);
};


module.exports = mongoose.model('captain', captainSchema);