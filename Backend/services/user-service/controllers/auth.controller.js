const otp = require('../services/otp.service');
const mail = require('../services/mail.service');
const oauth = require('../services/oauth.service');
const userService = require('../services/user.service');
const publicUser = require('../utils/publicUser');

const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const normEmail = (v) => String(v || '').toLowerCase().trim();

const respond = (res, user) =>
    res.json({ token: user.generateAuthToken(), user: publicUser(user) });


// POST /auth/send-code
exports.sendCode = async (req, res) => {
    try {
        const email = normEmail(req.body.email);
        if (!isEmail(email)) return res.status(400).json({ message: 'Sahi email daalo' });

        const code = await otp.createCode(email);
        await mail.sendCode(email, code);
        res.json({ message: 'Code bhej diya' });
    } catch (err) {
        console.error('send-code:', err.message);
        res.status(err.status || 500).json({ message: err.status ? err.message : 'Code nahi bhej paaye' });
    }
};


// POST /auth/verify-code
exports.verifyCode = async (req, res) => {
    try {
        const email = normEmail(req.body.email);
        const code = String(req.body.code || '').trim();
        if (!isEmail(email) || !/^\d{6}$/.test(code)) {
            return res.status(400).json({ message: 'Email ya code galat hai' });
        }

        const ok = await otp.verifyCode(email, code);
        if (!ok) return res.status(401).json({ message: 'Code galat hai ya expire ho gaya' });

        const user = await userService.findOrCreateByEmail(email);
        return respond(res, user);
    } catch (err) {
        console.error('verify-code:', err.message);
        res.status(500).json({ message: 'Verification fail ho gaya' });
    }
};


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