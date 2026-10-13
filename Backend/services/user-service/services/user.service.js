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