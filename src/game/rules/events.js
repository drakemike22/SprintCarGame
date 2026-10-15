
/*
 * Race Event Rules
 * ----------------
 * Detects special events from the three dice.
 *
 * This module identifies events only. It does not
 * move cars, remove cars, or trigger yellow flags.
 */

function validateDie(value, name) {
    if (!Number.isInteger(value) || value < 1 || value > 6) {
        throw new Error(
            `${name} must be a whole number from 1 through 6.`
        );
    }
}

function detectRaceEvent({
    movementDie,
    laneChangeDie,
    eventDie
}) {
    // Validate all three dice before checking the rules.
    validateDie(movementDie, "Movement die");
    validateDie(laneChangeDie, "Lane-change die");
    validateDie(eventDie, "Event die");

    // All three dice must match to trigger an event.
    const isTriple =
        movementDie === laneChangeDie &&
        laneChangeDie === eventDie;

    if (!isTriple) {
        return { type: "none" };
    }

    // Triple ones cause a mechanical spinner.
    if (movementDie === 1) {
        return { type: "mechanical-spinner" };
    }

    // Any other triple causes a wreck.
    return { type: "wreck" };
}

module.exports = {
    detectRaceEvent
};
