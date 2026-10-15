/*
 * Race Turn Rules
 * ---------------
 * Connects dice rolls and car statistics to track movement.
 *
 * This module coordinates existing rules. It does not
 * resolve wrecks or mechanical failures yet.
 */

const {
    calculateMovement,
    calculateLaneChange
} = require("./movement");

const {
    startMovementTurn,
    chooseMovementTurnPosition
} = require("../track/movement-turn");

function validateDie(value, name) {
    if (!Number.isInteger(value) || value < 1 || value > 6) {
        throw new Error(
            `${name} must be a whole number from 1 through 6.`
        );
    }
}

function startTurn({
    car,
    currentPosition,
    occupiedPositions = [],
    movementDie,
    laneChangeDie,
    eventDie
}) {
    // Validate the event die here because the movement
    // calculation functions do not use it.
    validateDie(movementDie, "Movement die");
    validateDie(laneChangeDie, "Lane-change die");
    validateDie(eventDie, "Event die");

    // Reuse the existing, tested movement rules.
    const movementAllowance = calculateMovement(
        car,
        movementDie,
        laneChangeDie
    );

    const laneChangeAllowance = calculateLaneChange(
        laneChangeDie
    );

    // Start the track movement using those calculated values.
    const turn = startMovementTurn({
        currentPosition,
        occupiedPositions,
        movementRemaining: movementAllowance,
        laneChangesRemaining: laneChangeAllowance
    });

    // Preserve the original roll and calculated allowances.
    // The event die is recorded but does not trigger an event yet.
    return {
        ...turn,
        dice: {
            movement: movementDie,
            laneChange: laneChangeDie,
            event: eventDie
        },
        movementAllowance,
        laneChangeAllowance
    };
}

function chooseTurnPosition(turn, targetPosition) {
    // The movement module preserves additional turn properties
    // when it copies the turn, including our dice information.
    return chooseMovementTurnPosition(turn, targetPosition);
}

module.exports = {
    startTurn,
    chooseTurnPosition
};