const oauth = require('../services/oauth.service');
const publicUser = require('../utils/publicUser');

const respond = (res, user) =>
    res.json({ token: user.generateAuthToken(), user: publicUser(user) });


// POST /auth/google
exports.google = async (req, res) => {
    try {
        const { credential } = req.body;
        if (!credential) return res.status(400).json({ message: 'Credential missing' });

        const g = await oauth.verifyGoogle(credential);
        const user = await oauth.findOrCreateGoogle(g);
        return respond(res, user);
    } catch (err) {
        console.error('google auth:', err.message);
        res.status(401).json({ message: 'Google sign-in fail ho gaya' });
    }
};


// GET /auth/me   (middleware ne user already load kar diya hai)
exports.me = (req, res) => res.json({ user: publicUser(req.user) });