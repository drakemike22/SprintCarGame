
/*
 * Backward Track Movement
 * -----------------------
 * Handles physical backward movement caused by wrecks.
 *
 * Normal race movement remains forward-only in movement.js.
 * This module handles the special backward movement rule:
 *
 * 1. Move backward the requested number of track sections.
 * 2. If the destination lane is occupied, search toward
 *    lane 3 (down the track) first.
 * 3. If no lane at or below the original lane is available,
 *    search back toward lane 0.
 * 4. Record each crossing of section 0 -> section 29.
 *
 * Occupied positions should contain OTHER cars only.
 */

const {
    TRACK_SECTIONS,
    TRACK_LANES,
    isValidPosition
} = require("./movement");

/**
 * Finds an unoccupied lane at a particular section.
 *
 * The original target lane is preferred if available. If blocked,
 * search increasing lane numbers first, then decreasing lane
 * numbers. Throw if all four spaces are occupied.
 */
function findOpenBackwardDestination(targetPosition, occupiedPositions) {
    if (!isValidPosition(targetPosition)) {
        throw new Error("A valid target position is required.");
    }

    if (!Array.isArray(occupiedPositions) ||
        !occupiedPositions.every(isValidPosition)) {
        throw new Error("Occupied positions must be an array of valid track positions.");
    }

    const isOccupied = lane => occupiedPositions.some(
        position =>
            position.section === targetPosition.section &&
            position.lane === lane
    );

    // Keep the intended lane when it is open.
    if (!isOccupied(targetPosition.lane)) {
        return { ...targetPosition };
    }

    // First search toward lane 3.
    for (let lane = targetPosition.lane + 1; lane < TRACK_LANES; lane++) {
        if (!isOccupied(lane)) {
            return {
                section: targetPosition.section,
                lane
            };
        }
    }

    // If that side is blocked, search back toward lane 0.
    for (let lane = targetPosition.lane - 1; lane >= 0; lane--) {
        if (!isOccupied(lane)) {
            return {
                section: targetPosition.section,
                lane
            };
        }
    }

    throw new Error("No open lane is available at the backward destination.");
}

/**
 * Moves backward by a number of track sections.
 *
 * Crossing from section 0 to section 29 decreases completed laps.
 * This function returns the lap adjustment rather than mutating
 * the RaceCar, so the caller can apply the movement immutably.
 */
function moveBackward({
    currentPosition,
    spaces = 3,
    completedLaps = 0,
    occupiedPositions = []
}) {
    if (!isValidPosition(currentPosition)) {
        throw new Error("A valid current track position is required.");
    }

    if (!Number.isInteger(spaces) || spaces < 0) {
        throw new Error("Backward spaces must be a non-negative whole number.");
    }

    if (!Number.isInteger(completedLaps) || completedLaps < 0) {
        throw new Error("Completed laps must be a non-negative whole number.");
    }

    if (!Array.isArray(occupiedPositions) ||
        !occupiedPositions.every(isValidPosition)) {
        throw new Error("Occupied positions must be an array of valid track positions.");
    }

    let section = currentPosition.section;
    let backwardLapCrossings = 0;

    // Calculate physical backward movement one section at a time.
    for (let step = 0; step < spaces; step++) {
        if (section === 0) {
            section = TRACK_SECTIONS - 1;

            // Moving backward over the start/finish line loses a lap.
            backwardLapCrossings++;
        } else {
            section--;
        }
    }

    const intendedPosition = {
        section,
        lane: currentPosition.lane
    };

    const position = findOpenBackwardDestination(
        intendedPosition,
        occupiedPositions
    );

    const lapsLost = Math.min(completedLaps, backwardLapCrossings);

    return {
        position,
        spacesMoved: spaces,
        intendedPosition,
        completedLaps: completedLaps - lapsLost,
        lapsLost,
        backwardLapCrossings
    };
}

module.exports = {
    findOpenBackwardDestination,
    moveBackward
};
