const mongoose = require('mongoose');

// Tokens of logged-out captains. Entries delete themselves after 24h
// (same as the JWT lifetime), so the collection never grows forever.
const blackListTokenSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        unique: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 86400
    }
});

module.exports = mongoose.model('BlacklistToken', blackListTokenSchema);
