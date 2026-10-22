/*
 * Race Progress Rules
 * -------------------
 * Measures the distance and laps completed during a turn.
 *
 * Each movement from one track section to the next counts
 * as one space of distance. Changing lanes does not add distance.
 */

const {
    isValidPosition,
    getNextSection
} = require("../track/movement");

/**
 * Measures distance and completed laps from a movement history.
 *
 * The history must describe consecutive, one-section moves around
 * the oval. A lane change is allowed during a move, but a car
 * cannot remain in the same section or skip sections.
 */
function measureRaceProgress(history) {
    if (!Array.isArray(history) || history.length === 0) {
        throw new Error("Movement history must contain at least one position.");
    }

    if (!history.every(isValidPosition)) {
        throw new Error("Movement history contains an invalid position.");
    }

    let completedLaps = 0;

    for (let i = 1; i < history.length; i++) {
        const previous = history[i - 1];
        const current = history[i];

        if (current.section !== getNextSection(previous.section)) {
            throw new Error(
                "Movement history must contain consecutive track sections."
            );
        }

        // The car crossed the start/finish line.
        if (previous.section === 29 && current.section === 0) {
            completedLaps++;
        }
    }

    return {
        distance: history.length - 1,
        completedLaps
    };
}

module.exports = { measureRaceProgress };
