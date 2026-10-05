const http = require('./http');
const { MAPS_SERVICE_URL } = require('./config');

function reason(error) {
    return error.response?.data?.message || error.message;
}

// Always returns { ltd, lng } (same keys your captain.location uses)
async function getAddressCoordinates(address) {
    try {
        const { data } = await http.get(`${MAPS_SERVICE_URL}/maps/get-coordinates`, {
            params: { address }
        });

        const point = data?.coordinates || data;
        const ltd = Number(point?.ltd ?? point?.lat);
        const lng = Number(point?.lng);

        if (!Number.isFinite(ltd) || !Number.isFinite(lng)) {
            throw new Error('Invalid coordinates received from maps service');
        }

        return { ltd, lng };
    } catch (error) {
        throw new Error(`Unable to get coordinates: ${reason(error)}`);
    }
}

// Returns { distance: { text, value(metres) }, duration: { text, value(seconds) } }
async function getDistanceTime(origin, destination) {
    try {
        const { data } = await http.get(`${MAPS_SERVICE_URL}/maps/get-distance-time`, {
            params: { origin, destination }
        });

        if (data?.distance?.value == null || data?.duration?.value == null) {
            throw new Error('Invalid distance/time received from maps service');
        }

        return data;
    } catch (error) {
        throw new Error(`Unable to get distance/time: ${reason(error)}`);
    }
}

module.exports = { getAddressCoordinates, getDistanceTime };
