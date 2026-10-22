
/*
 * Race Order Rules
 * ----------------
 * Determines which running car is ahead at the start of a
 * round of turns.
 *
 * Order is determined by:
 * 1. Most completed laps.
 * 2. Furthest section along the track.
 * 3. Innermost lane when cars share a section.
 *
 * Lane 0 is the inside lane.
 * Lane 3 is the outside lane.
 *
 * Every race car must have a unique ID.
 * Running cars must occupy unique track positions.
 * Cars that are out of the race or event do not take turns
 * and do not occupy spaces for movement purposes.
 *
 * This function does not mutate the supplied race cars.
 */

const { CAR_STATUSES } = require("./car-status");

function getTurnOrder(raceCars) {
    if (!Array.isArray(raceCars)) {
        throw new Error("Race cars must be provided as an array.");
    }

    // Validate every record and ensure permanent IDs are unique,
    // including cars that are no longer running.
    const seenCarIds = new Set();

    for (const raceCar of raceCars) {
        if (!raceCar || typeof raceCar !== "object") {
            throw new Error("Every race car must be a valid object.");
        }

        if (
            typeof raceCar.carId !== "string" ||
            raceCar.carId.trim() === ""
        ) {
            throw new Error("Every race car must have a valid car ID.");
        }

        if (seenCarIds.has(raceCar.carId)) {
            throw new Error(
                `Duplicate race car ID: ${raceCar.carId}.`
            );
        }

        seenCarIds.add(raceCar.carId);
    }

    // Only running cars are eligible to take turns.
    const runningCars = raceCars.filter(
        (raceCar) => raceCar.status === CAR_STATUSES.RUNNING
    );

    // Validate the position and lap information needed for ordering.
    const occupiedPositions = new Set();

    for (const raceCar of runningCars) {
        if (
            !raceCar.position ||
            !Number.isInteger(raceCar.position.section) ||
            raceCar.position.section < 0 ||
            raceCar.position.section > 29 ||
            !Number.isInteger(raceCar.position.lane) ||
            raceCar.position.lane < 0 ||
            raceCar.position.lane > 3
        ) {
            throw new Error(
                `Race car ${raceCar.carId} must have a valid track position.`
            );
        }

        if (
            !Number.isInteger(raceCar.completedLaps) ||
            raceCar.completedLaps < 0
        ) {
            throw new Error(
                `Race car ${raceCar.carId} must have a valid lap count.`
            );
        }

        const positionKey =
            `${raceCar.position.section}-${raceCar.position.lane}`;

        if (occupiedPositions.has(positionKey)) {
            throw new Error(
                `Running cars cannot occupy the same track position: ` +
                `${positionKey}.`
            );
        }

        occupiedPositions.add(positionKey);
    }

    // Sort a copy so the caller's original array stays unchanged.
    return [...runningCars].sort((a, b) => {
        // More completed laps means further ahead.
        if (a.completedLaps !== b.completedLaps) {
            return b.completedLaps - a.completedLaps;
        }

        // Within the same lap, the higher section is further ahead.
        if (a.position.section !== b.position.section) {
            return b.position.section - a.position.section;
        }

        // Within the same section, the inside lane is ahead.
        if (a.position.lane !== b.position.lane) {
            return a.position.lane - b.position.lane;
        }

        // Valid running cars cannot tie on both section and lane.
        // Keep this deterministic fallback for defensive clarity.
        return a.carId.localeCompare(b.carId);
    });
}

module.exports = { getTurnOrder };
