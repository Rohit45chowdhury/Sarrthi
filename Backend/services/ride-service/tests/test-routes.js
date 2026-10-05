// Run:  node tests/test-routes.js
// Needs Node 18+ (built-in fetch). No extra packages.
//
// PowerShell:
//   $env:USER_TOKEN="..."          (user login token)
//   $env:CAPTAIN_TOKEN="..."       (captain login token)
//   $env:INTERNAL_API_KEY="..."    (same value as in ride-service .env)   [optional]
//   $env:BASE="http://localhost:3003"   (or http://localhost:3000 via gateway) [optional]
//   node tests/test-routes.js

const readline = require('readline/promises');

const BASE = process.env.BASE || 'http://localhost:3003';
const USER_TOKEN = process.env.USER_TOKEN;
const CAPTAIN_TOKEN = process.env.CAPTAIN_TOKEN;
const INTERNAL_KEY = process.env.INTERNAL_API_KEY;

const PICKUP = process.env.PICKUP || 'Howrah Station, Howrah';
const DESTINATION = process.env.DESTINATION || 'Salt Lake, Kolkata';

if (!USER_TOKEN || !CAPTAIN_TOKEN) {
    console.log('Set USER_TOKEN and CAPTAIN_TOKEN first (see top of this file).');
    process.exit(1);
}

let pass = 0, fail = 0;

function check(name, ok, detail = '') {
    if (ok) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}   ${detail}`); }
}

async function call(method, path, { token, body, headers } = {}) {
    try {
        const res = await fetch(BASE + path, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(headers || {})
            },
            body: body ? JSON.stringify(body) : undefined
        });
        let json = null;
        try { json = await res.json(); } catch { /* empty body */ }
        return { status: res.status, json };
    } catch (error) {
        return { status: 0, json: { message: error.cause?.code || error.message } };
    }
}

const msg = (r) => `(got ${r.status}: ${JSON.stringify(r.json)?.slice(0, 160)})`;

function section(title) { console.log(`\n== ${title}`); }

(async () => {

    section('Server');
    let r = await call('GET', '/');
    check('GET /  -> 200 running', r.status === 200 && r.json?.status === 'running', msg(r));
    if (r.status === 0) {
        console.log('\nCannot reach', BASE, '- is ride-service running?');
        process.exit(1);
    }
    r = await call('GET', '/nope');
    check('unknown route -> 404', r.status === 404, msg(r));

    section('GET /rides/get-fare');
    const fareQs = (p, d) => '?' + new URLSearchParams({ pickup: p, destination: d });

    r = await call('GET', '/rides/get-fare' + fareQs(PICKUP, DESTINATION));
    check('no token -> 401', r.status === 401, msg(r));

    r = await call('GET', '/rides/get-fare' + fareQs(PICKUP, DESTINATION), { token: CAPTAIN_TOKEN });
    check('captain token on user route -> 401', r.status === 401, msg(r));

    r = await call('GET', '/rides/get-fare' + fareQs('ab', DESTINATION), { token: USER_TOKEN });
    check('short pickup -> 400', r.status === 400, msg(r));

    r = await call('GET', '/rides/get-fare' + fareQs(PICKUP, DESTINATION), { token: USER_TOKEN });
    check('valid -> 200 with auto/car/moto',
        r.status === 200 && ['auto', 'car', 'moto'].every(k => typeof r.json?.[k] === 'number'), msg(r));
    if (r.status === 200) console.log(`        fares: auto ${r.json.auto}, car ${r.json.car}, moto ${r.json.moto}, ${r.json.distanceInKm} km`);
    if (r.status === 503) console.log('        -> ride-service cannot reach user-service / maps-service (check its terminal)');

    section('POST /rides/create');
    const goodBody = { pickup: PICKUP, destination: DESTINATION, vehicleType: 'car' };

    r = await call('POST', '/rides/create', { body: goodBody });
    check('no token -> 401', r.status === 401, msg(r));

    r = await call('POST', '/rides/create', { token: USER_TOKEN, body: { ...goodBody, vehicleType: 'plane' } });
    check('invalid vehicleType -> 400', r.status === 400, msg(r));

    r = await call('POST', '/rides/create', { token: USER_TOKEN, body: { ...goodBody, vehicleType: 'moto' } });
    check('"moto" accepted and saved as motorcycle',
        r.status === 201 && r.json?.ride?.vehicleType === 'motorcycle', msg(r));

    r = await call('POST', '/rides/create', { token: USER_TOKEN, body: goodBody });
    check('valid -> 201', r.status === 201 && r.json?.success === true, msg(r));
    check('response has NO otp', r.json?.ride && !('otp' in r.json.ride) && !('OTP' in r.json.ride));
    const rideId = r.json?.ride?._id;
    if (r.status === 201) {
        console.log(`        rideId: ${rideId}   nearbyCaptains: ${r.json.nearbyCaptains}`);
        if (r.json.nearbyCaptains === 0) {
            console.log('        -> 0 captains notified: captain must be "active" with a saved location,');
            console.log('           and captain-service needs GET /captains/active?vehicleType=');
        }
    }
    if (!rideId) { console.log('\nCannot continue without a ride.'); return summary(); }

    section('POST /rides/confirm (captain accepts)');
    r = await call('POST', '/rides/confirm', { body: { rideId } });
    check('no token -> 401', r.status === 401, msg(r));

    r = await call('POST', '/rides/confirm', { token: USER_TOKEN, body: { rideId } });
    check('user token on captain route -> 401', r.status === 401, msg(r));

    r = await call('POST', '/rides/confirm', { token: CAPTAIN_TOKEN, body: { rideId: 'abc' } });
    check('invalid rideId -> 400', r.status === 400, msg(r));

    r = await call('POST', '/rides/confirm', { token: CAPTAIN_TOKEN, body: { rideId } });
    check('valid -> 200, status accepted', r.status === 200 && r.json?.status === 'accepted', msg(r));
    check('captain response has NO otp', r.status === 200 && !('otp' in r.json) && !('OTP' in r.json));
    const captainId = typeof r.json?.captain === 'object' ? r.json.captain?._id : r.json?.captain;

    r = await call('POST', '/rides/confirm', { token: CAPTAIN_TOKEN, body: { rideId } });
    check('accept again -> 400 (already accepted)', r.status === 400, msg(r));

    section('GET /rides/start-ride');
    const startQs = (id, otp) => '?' + new URLSearchParams({ rideId: id, otp });

    r = await call('GET', '/rides/start-ride' + startQs(rideId, '123456'));
    check('no token -> 401', r.status === 401, msg(r));

    r = await call('GET', '/rides/start-ride' + startQs(rideId, '12'), { token: CAPTAIN_TOKEN });
    check('bad otp format -> 400', r.status === 400, msg(r));

    r = await call('GET', '/rides/start-ride' + startQs(rideId, '000000'), { token: CAPTAIN_TOKEN });
    check('wrong otp -> 400 "Invalid OTP"', r.status === 400 && /otp/i.test(r.json?.message || ''), msg(r));

    section('POST /rides/end-ride');
    r = await call('POST', '/rides/end-ride', { token: CAPTAIN_TOKEN, body: { rideId } });
    check('end before start -> 400 "not ongoing"', r.status === 400, msg(r));

    section('Rating (before ride is completed)');
    r = await call('GET', '/rides/pending-rating', { token: USER_TOKEN });
    check('pending-rating -> 200 {ride:null}', r.status === 200 && r.json?.ride === null, msg(r));

    r = await call('POST', '/rides/rate', { token: USER_TOKEN, body: { rideId, value: 9 } });
    check('rating 9 -> 400', r.status === 400, msg(r));

    r = await call('POST', '/rides/rate', { token: USER_TOKEN, body: { rideId, value: 5 } });
    check('rate non-completed ride -> 400', r.status === 400, msg(r));

    section('Internal route (service-to-service)');
    if (INTERNAL_KEY) {
        r = await call('GET', `/rides/internal/active-by-captain/${captainId || '507f1f77bcf86cd799439011'}`);
        check('no key -> 401', r.status === 401, msg(r));

        r = await call('GET', `/rides/internal/active-by-captain/${captainId}`, { headers: { 'x-internal-key': INTERNAL_KEY } });
        check('with key -> 200, returns the accepted ride',
            r.status === 200 && String(r.json?.ride?.rideId) === String(rideId), msg(r));
    } else {
        console.log('  skipped (set INTERNAL_API_KEY to test)');
    }

    section('Full flow (needs the OTP)');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const otp = (await rl.question(
        '  Open MongoDB Compass -> rides collection -> this ride -> copy "otp".\n  Enter OTP (or press Enter to skip): '
    )).trim();
    rl.close();

    if (otp) {
        r = await call('GET', '/rides/start-ride' + startQs(rideId, otp), { token: CAPTAIN_TOKEN });
        check('start-ride -> 200, status ongoing', r.status === 200 && r.json?.status === 'ongoing', msg(r));
        check('start-ride response has NO otp', r.status === 200 && !('otp' in r.json));

        r = await call('POST', '/rides/end-ride', { token: CAPTAIN_TOKEN, body: { rideId } });
        check('end-ride -> 200, status completed', r.status === 200 && r.json?.status === 'completed', msg(r));

        r = await call('GET', '/rides/pending-rating', { token: USER_TOKEN });
        check('pending-rating -> returns this ride', r.status === 200 && String(r.json?.ride?._id) === String(rideId), msg(r));

        r = await call('POST', '/rides/rate', { token: USER_TOKEN, body: { rideId, value: 5, comment: 'Great ride' } });
        check('rate -> 200', r.status === 200 && r.json?.success === true, msg(r));

        r = await call('POST', '/rides/rate', { token: USER_TOKEN, body: { rideId, value: 4 } });
        check('rate again -> 400 (already rated)', r.status === 400, msg(r));

        r = await call('GET', '/rides/pending-rating', { token: USER_TOKEN });
        check('pending-rating after rating -> {ride:null}', r.status === 200 && r.json?.ride === null, msg(r));
    } else {
        console.log('  skipped');
    }

    summary();

})();

function summary() {
    console.log(`\n==== ${pass} passed, ${fail} failed ====`);
    process.exit(fail ? 1 : 0);
}
