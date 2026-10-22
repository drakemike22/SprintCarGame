
/*
 * Race Finishers
 * --------------
 * Converts a race state into the finisher records expected by
 * createRaceResults().
 *
 * Important:
 * - The caller must provide the official finishing order.
 * - This module does not guess finish order from turn order.
 * - Lap count and distance come from the live race-car records.
 * - The supplied race state is never modified.
 */

const { CAR_STATUSES } = require("./car-status");

function createRaceFinishers(raceState, officialCarOrder) {
    if (
        !raceState ||
        typeof raceState !== "object" ||
        !Array.isArray(raceState.raceCars)
    ) {
        throw new Error("A valid race state is required.");
    }

    if (!Array.isArray(officialCarOrder)) {
        throw new Error("Official finishing order must be an array.");
    }

    if (officialCarOrder.length !== raceState.raceCars.length) {
        throw new Error(
            "Official finishing order must include every race car exactly once."
        );
    }

    const raceCarsById = new Map();

    for (const raceCar of raceState.raceCars) {
        if (
            !raceCar ||
            typeof raceCar.carId !== "string" ||
            raceCar.carId.trim() === ""
        ) {
            throw new Error("Every race car must have a valid car ID.");
        }

        if (raceCarsById.has(raceCar.carId)) {
            throw new Error("Race car IDs must be unique.");
        }

        if (!Object.values(CAR_STATUSES).includes(raceCar.status)) {
            throw new Error(
                `Race car "${raceCar.carId}" has an invalid status.`
            );
        }

        if (
            !Number.isInteger(raceCar.completedLaps) ||
            raceCar.completedLaps < 0
        ) {
            throw new Error(
                `Race car "${raceCar.carId}" has an invalid lap count.`
            );
        }

        if (
            !Number.isInteger(raceCar.distance) ||
            raceCar.distance < 0
        ) {
            throw new Error(
                `Race car "${raceCar.carId}" has an invalid distance.`
            );
        }

        raceCarsById.set(raceCar.carId, raceCar);
    }

    const seenCarIds = new Set();

    return officialCarOrder.map((carId) => {
        if (typeof carId !== "string" || carId.trim() === "") {
            throw new Error(
                "Every entry in the official finishing order must be a car ID."
            );
        }

        if (seenCarIds.has(carId)) {
            throw new Error(
                `Car "${carId}" appears more than once in the finishing order.`
            );
        }

        seenCarIds.add(carId);

        const raceCar = raceCarsById.get(carId);

        if (!raceCar) {
            throw new Error(
                `Car "${carId}" is not present in the race state.`
            );
        }

        return {
            carId: raceCar.carId,
            statusAtFinish: raceCar.status,
            lapsCompleted: raceCar.completedLaps,
            trackDistance: raceCar.distance
        };
    });
}

module.exports = { createRaceFinishers };
