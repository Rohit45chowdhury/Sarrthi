const crypto = require('crypto');
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL);

const TTL = 600;         // code 10 min tak valid
const MAX_ATTEMPTS = 5;  // 5 galat try ke baad code khatam
const RESEND_WAIT = 30;  // do codes ke beech 30 sec

const hash = (email, code) =>
    crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${email}:${code}`).digest('hex');

exports.createCode = async (email) => {
    const waitKey = `otp:wait:${email}`;
    if (await redis.exists(waitKey)) {
        const err = new Error('Thodi der baad dobara try karo');
        err.status = 429;
        throw err;
    }
    const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    await redis
        .multi()
        .set(`otp:code:${email}`, hash(email, code), 'EX', TTL)
        .set(`otp:tries:${email}`, 0, 'EX', TTL)
        .set(waitKey, 1, 'EX', RESEND_WAIT)
        .exec();
    return code;
};

exports.verifyCode = async (email, code) => {
    const stored = await redis.get(`otp:code:${email}`);
    if (!stored) return false;

    const tries = await redis.incr(`otp:tries:${email}`);
    if (tries > MAX_ATTEMPTS) {
        await redis.del(`otp:code:${email}`);
        return false;
    }

    const a = Buffer.from(stored);
    const b = Buffer.from(hash(email, code));
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (ok) await redis.del(`otp:code:${email}`, `otp:tries:${email}`);
    return ok;
};