
/*
 * Event Scoring
 * -------------
 * Championship points are awarded from final event standings.
 *
 * Qualifying, heats, and the B-main award no championship points.
 *
 * A normal event has 32 drafted cars. A three-player season has
 * 30 drafted cars, so scoring supports both field sizes.
 */

const TOTAL_CARS = 32;
const THREE_PLAYER_FIELD_SIZE = 30;

/**
 * Return championship points for a finishing position.
 *
 * 1st = 75
 * 2nd = 70
 * 3rd onward = 2 fewer points per position
 *
 * @param {number} finishingPosition
 * @returns {number}
 */
function getEventPoints(finishingPosition) {
    if (
        !Number.isInteger(finishingPosition) ||
        finishingPosition < 1 ||
        finishingPosition > TOTAL_CARS
    ) {
        throw new Error(
            `Finishing position must be an integer from 1 to ${TOTAL_CARS}.`
        );
    }

    if (finishingPosition === 1) {
        return 75;
    }

    if (finishingPosition === 2) {
        return 70;
    }

    return 70 - (finishingPosition - 2) * 2;
}

/**
 * Validate and score final event standings.
 *
 * Complete standings must contain either 30 or 32 cars.
 * Every car ID and finishing position must be unique.
 *
 * @param {Array<object>} finalStandings
 * @returns {Array<object>}
 */
function scoreEventStandings(finalStandings) {
    if (!Array.isArray(finalStandings)) {
        throw new Error("Final standings must be an array.");
    }

    const seenCarIds = new Set();
    const seenPositions = new Set();

    // Check each supplied entry first so invalid IDs and duplicates
    // produce useful errors even if the list is incomplete.
    for (const standing of finalStandings) {
        if (
            !standing ||
            typeof standing.carId !== "string" ||
            standing.carId.trim().length === 0
        ) {
            throw new Error(
                "Every final standing must have a valid carId."
            );
        }

        if (seenCarIds.has(standing.carId)) {
            throw new Error(
                `Duplicate carId in final standings: ${standing.carId}`
            );
        }

        seenCarIds.add(standing.carId);

        const position = standing.finishingPosition;

        if (
            !Number.isInteger(position) ||
            position < 1 ||
            position > TOTAL_CARS
        ) {
            throw new Error(
                `Invalid finishing position for car ${standing.carId}.`
            );
        }

        if (seenPositions.has(position)) {
            throw new Error(
                `Duplicate finishing position: ${position}`
            );
        }

        seenPositions.add(position);
    }

    // Only complete 30-car or 32-car fields are valid event results.
    if (
        finalStandings.length !== THREE_PLAYER_FIELD_SIZE &&
        finalStandings.length !== TOTAL_CARS
    ) {
        throw new Error(
            "Final standings must contain exactly 32 cars or exactly 30 cars."
        );
    }

    // Require a continuous sequence: 1 through 30 or 1 through 32.
    for (let position = 1; position <= finalStandings.length; position++) {
        if (!seenPositions.has(position)) {
            throw new Error(
                `Final standings must include every position from 1 through ${finalStandings.length}.`
            );
        }
    }

    // Return new objects; do not mutate the original standings.
    return finalStandings.map((standing) => ({
        ...standing,
        points: getEventPoints(standing.finishingPosition)
    }));
}

module.exports = {
    TOTAL_CARS,
    getEventPoints,
    scoreEventStandings
};
