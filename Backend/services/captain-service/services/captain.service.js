const captainModel = require('../models/captain.model');

module.exports.createCaptain = async ({
    firstname, lastname, email, password, licenseNumber,
    color, model, plate, capacity, vehicleType
}) => {
    if (!firstname || !email || !password || !color || !model || !plate || !capacity || !vehicleType) {
        throw new Error('All fields are required');
    }

    const data = {
        fullname: { firstname, lastname },
        email,
        password,
        vehicle: { color, model, plate, capacity, vehicleType },
        // Auto verification pass hui, isliye captain verified save hota hai
        verification: { status: 'verified', method: 'auto', verifiedAt: new Date() }
    };

    // optional field: khali ho to save hi mat karo (unique sparse index ke liye zaroori)
    if (licenseNumber) data.licenseNumber = licenseNumber;

    return captainModel.create(data);
};