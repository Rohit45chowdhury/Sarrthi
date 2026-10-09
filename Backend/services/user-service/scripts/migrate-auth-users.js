// Ek baar chalao:  node scripts/migrate-auth-users.js
// Purane auth-service ke `authusers` collection ko `users` me merge karta hai.
// Safe hai: dobara chalane par duplicate nahi banata. Pehle DB ka backup le lo.
require('dotenv').config();
const mongoose = require('mongoose');

const splitName = (name, email) => {
    const full = String(name || '').trim() || String(email).split('@')[0];
    const [firstname, ...rest] = full.split(/\s+/);
    return { firstname, lastname: rest.join(' ') };
};

(async () => {
    await mongoose.connect(process.env.DB_CONNECT);
    const authUsers = mongoose.connection.collection('authusers');
    const users = mongoose.connection.collection('users');

    let merged = 0, inserted = 0;

    for await (const a of authUsers.find()) {
        const existing = await users.findOne({ email: a.email });

        if (existing) {
            const set = {
                avatar: existing.avatar || a.avatar || '',
                lastLoginAt: a.lastLoginAt || existing.lastLoginAt || new Date()
            };
            if (a.googleId && !existing.googleId) set.googleId = a.googleId;

            await users.updateOne(
                { _id: existing._id },
                { $set: set, $addToSet: { providers: { $each: a.providers || [] } } }
            );
            merged++;
        } else {
            const doc = {
                _id: a._id, // wahi id, taaki purane tokens chalte rahe
                email: a.email,
                fullname: splitName(a.fullname, a.email),
                avatar: a.avatar || '',
                providers: a.providers || [],
                lastLoginAt: a.lastLoginAt || new Date(),
                createdAt: a.createdAt || new Date(),
                updatedAt: new Date(),
                __v: 0
            };
            if (a.googleId) doc.googleId = a.googleId;

            await users.insertOne(doc);
            inserted++;
        }
    }

    console.log(`Done. merged into existing: ${merged}, newly inserted: ${inserted}`);
    await mongoose.disconnect();
})().catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
});