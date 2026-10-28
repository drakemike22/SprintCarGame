
/*
 * Track Movement
 * --------------
 * Handles one-section-at-a-time movement around the oval.
 *
 * This module does not roll dice or move cars automatically
 * through an entire turn. The player chooses each destination.
 */

const TRACK_SECTIONS = 30;
const TRACK_LANES = 4;

/**
 * Confirms that a position is a valid space on the track.
 */
function isValidPosition(position) {
    return Boolean(
        position &&
        Number.isInteger(position.section) &&
        position.section >= 0 &&
        position.section < TRACK_SECTIONS &&
        Number.isInteger(position.lane) &&
        position.lane >= 0 &&
        position.lane < TRACK_LANES
    );
}

/**
 * Returns the next section, wrapping around the oval.
 */
function getNextSection(section) {
    if (
        !Number.isInteger(section) ||
        section < 0 ||
        section >= TRACK_SECTIONS
    ) {
        throw new Error("Section must be a whole number from 0 through 29.");
    }

    return (section + 1) % TRACK_SECTIONS;
}

/**
 * Finds legal destinations in the next section.
 *
 * occupiedPositions must contain the positions of OTHER cars.
 * A lane change is measured by the difference between the
 * current lane and the destination lane.
 */
function getLegalNextPositions(
    currentPosition,
    occupiedPositions,
    laneChangesRemaining
) {
    if (!isValidPosition(currentPosition)) {
        throw new Error("A valid current track position is required.");
    }

    if (!Array.isArray(occupiedPositions)) {
        throw new Error("Occupied positions must be an array.");
    }

    if (
        !Number.isInteger(laneChangesRemaining) ||
        laneChangesRemaining < 0 ||
        laneChangesRemaining > TRACK_LANES
    ) {
        throw new Error(
            "Remaining lane changes must be a whole number from 0 through 4."
        );
    }

    if (!occupiedPositions.every(isValidPosition)) {
        throw new Error("Every occupied position must be valid.");
    }
    const nextSection = getNextSection(currentPosition.section);
    const legalPositions = [];

    const currentLaneIsBlocked = occupiedPositions.some(
        position =>
            position.section === nextSection &&
            position.lane === currentPosition.lane
    );

    for (let lane = 0; lane < TRACK_LANES; lane++) {
        const lanesRequired = Math.abs(lane - currentPosition.lane);

        // A single movement step can change at most one lane.
        if (lanesRequired > 1) {
            continue;
        }

        // The player cannot use more lane changes than remain.
        if (lanesRequired > laneChangesRemaining) {
            continue;
        }
        // Continue straight when that space is open.
        // Changing lanes is required only to get around a blocker.
        if (lanesRequired > 0 && !currentLaneIsBlocked) {
            continue;
        }

        const isOccupied = occupiedPositions.some(
            position =>
                position.section === nextSection &&
                position.lane === lane
        );

        if (!isOccupied) {
            legalPositions.push({
                section: nextSection,
                lane
            });
        }
    }

    return legalPositions;
}

/**
 * Moves a car forward exactly one section.
 *
 * If no legal destination exists, the car stays in place
 * and becomes stuck. Unused movement is not consumed.
 *
 * The caller supplies the player's chosen destination.
 */
function advanceOneSection({
    currentPosition,
    targetPosition,
    occupiedPositions,
    movementRemaining,
    laneChangesRemaining
}) {
    if (!isValidPosition(currentPosition)) {
        throw new Error("A valid current track position is required.");
    }

    if (
        !Number.isInteger(movementRemaining) ||
        movementRemaining < 0
    ) {
        throw new Error(
            "Remaining movement must be a non-negative whole number."
        );
    }

    if (
        !Number.isInteger(laneChangesRemaining) ||
        laneChangesRemaining < 0 ||
        laneChangesRemaining > TRACK_LANES
    ) {
        throw new Error(
            "Remaining lane changes must be a whole number from 0 through 4."
        );
    }

    if (movementRemaining === 0) {
        return {
            position: { ...currentPosition },
            movementRemaining: 0,
            laneChangesRemaining,
            stuck: false,
            moved: false
        };
    }

    const legalPositions = getLegalNextPositions(
        currentPosition,
        occupiedPositions,
        laneChangesRemaining
    );

    if (legalPositions.length === 0) {
        return {
            position: { ...currentPosition },
            movementRemaining,
            laneChangesRemaining,
            stuck: true,
            moved: false
        };
    }

    const chosenPosition = legalPositions.find(
        position =>
            targetPosition &&
            position.section === targetPosition.section &&
            position.lane === targetPosition.lane
    );

    if (!chosenPosition) {
        throw new Error(
            "The chosen destination is not a legal next position."
        );
    }

    const lanesUsed = Math.abs(
        chosenPosition.lane - currentPosition.lane
    );

    return {
        position: { ...chosenPosition },
        movementRemaining: movementRemaining - 1,
        laneChangesRemaining: laneChangesRemaining - lanesUsed,
        stuck: false,
        moved: true
    };
}

module.exports = {
    TRACK_SECTIONS,
    TRACK_LANES,
    isValidPosition,
    getNextSection,
    getLegalNextPositions,
    advanceOneSection
};
