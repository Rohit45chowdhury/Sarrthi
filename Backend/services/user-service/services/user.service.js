const userModel = require('../models/user.model');

// "Rohit Kumar" -> { firstname: 'Rohit', lastname: 'Kumar' }; naam na ho to email ka prefix
const splitName = (name, email) => {
    const full = String(name || '').trim() || String(email).split('@')[0];
    const [firstname, ...rest] = full.split(/\s+/);
    return { firstname, lastname: rest.join(' ') };
};

module.exports.splitName = splitName;

module.exports.createUser = async ({ firstname, lastname, email, password }) => {
    if (!firstname || !email || !password) {
        throw new Error('All fields are required');
    }

    return userModel.create({
        fullname: { firstname, lastname },
        email,
        password,
        providers: ['password'],
        lastLoginAt: new Date()
    });
};

// Email OTP verify hone ke baad: user mile to login, na mile to banao (atomic upsert)
module.exports.findOrCreateByEmail = async (email) => {
    const run = () =>
        userModel.findOneAndUpdate(
            { email },
            {
                $set: { lastLoginAt: new Date() },
                $addToSet: { providers: 'email' },
                $setOnInsert: { fullname: splitName('', email) }
            },
            { upsert: true, new: true }
        );

    try {
        return await run();
    } catch (err) {
        if (err.code === 11000) return run(); // do requests ek saath aayi
        throw err;
    }
};