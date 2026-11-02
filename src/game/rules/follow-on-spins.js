/*
 * Follow-on Spin Eligibility
 * --------------------------
 * Selects requested cars by scanning physical track spaces backward from
 * the wreck car's post-movement position. Within each space, lanes are
 * checked inside-to-outside (0, 1, 2, 3).
 */

const { CAR_STATUSES } = require("./car-status");
const { TRACK_SECTIONS, TRACK_LANES } = require("../track/movement");

function getEligibleFollowOnCars({ wreckPosition, followOnSpins, raceCars, wreckCarId }) {
    if (!wreckPosition || !Number.isInteger(wreckPosition.section) ||
        wreckPosition.section < 0 || wreckPosition.section >= TRACK_SECTIONS ||
        !Array.isArray(followOnSpins) || !Array.isArray(raceCars)) {
        throw new Error("A valid wreck position, follow-on rules, and race cars are required.");
    }

    const requested = [...new Set(followOnSpins
        .map(entry => entry?.carsBehind)
        .filter(value => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
    if (requested.length === 0) return [];

    const byPosition = new Map();
    for (const car of raceCars) {
        if (!car?.position || !Number.isInteger(car.position.section) ||
            !Number.isInteger(car.position.lane)) continue;
        if (car.status !== CAR_STATUSES.RUNNING || car.carId === wreckCarId) continue;
        byPosition.set(`${car.position.section}:${car.position.lane}`, car);
    }

    const selected = [];
    const maxRequested = requested[requested.length - 1];
    // The wreck car's space is the reference point; begin one space behind.
    for (let distance = 1; distance <= TRACK_SECTIONS && selected.length < maxRequested; distance += 1) {
        const section = (wreckPosition.section - distance + TRACK_SECTIONS) % TRACK_SECTIONS;
        for (let lane = 0; lane < TRACK_LANES && selected.length < maxRequested; lane += 1) {
            const car = byPosition.get(`${section}:${lane}`);
            if (car) selected.push(car);
        }
    }

    return requested
        .filter(ordinal => selected[ordinal - 1])
        .map(carsBehind => ({ carId: selected[carsBehind - 1].carId, carsBehind }));
}

module.exports = { getEligibleFollowOnCars };
