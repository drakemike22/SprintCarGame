
/*
 * Race Turn Rules
 * ---------------
 * Connects dice rolls, car statistics, track movement,
 * and race-event detection.
 *
 * Events are detected only after movement is finished.
 * Event consequences are handled by a later rules module.
 */

const {
    calculateMovement,
    calculateLaneChange
} = require("./movement");

const {
    detectRaceEvent
} = require("./events");

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

function finishTurnIfReady(turn) {
    // The player still needs to choose a lane.
    // Do not resolve the event until that choice is made.
    if (turn.status === "waiting-for-choice") {
        return {
            ...turn,
            eventResolution: {
                status: "pending"
            }
        };
    }

    // Movement is finished or the car is stuck.
    // Record the event detected from the original dice.
    return {
        ...turn,
        eventResolution: {
            status: "resolved",
            result: detectRaceEvent({
                movementDie: turn.dice.movement,
                laneChangeDie: turn.dice.laneChange,
                eventDie: turn.dice.event
            })
            
        }
    };
}

function startTurn({
    car,
    currentPosition,
    occupiedPositions = [],
    movementDie,
    laneChangeDie,
    eventDie
}) {
    validateDie(movementDie, "Movement die");
    validateDie(laneChangeDie, "Lane-change die");
    validateDie(eventDie, "Event die");

    const movementAllowance = calculateMovement(
        car,
        movementDie,
        laneChangeDie
    );

    const laneChangeAllowance = calculateLaneChange(
        laneChangeDie
    );

    const turn = startMovementTurn({
        currentPosition,
        occupiedPositions,
        movementRemaining: movementAllowance,
        laneChangesRemaining: laneChangeAllowance
    });

    const turnWithDice = {
        ...turn,
        dice: {
            movement: movementDie,
            laneChange: laneChangeDie,
            event: eventDie
        },
        movementAllowance,
        laneChangeAllowance
    };

    return finishTurnIfReady(turnWithDice);
}

function chooseTurnPosition(turn, targetPosition) {
    const nextTurn = chooseMovementTurnPosition(
        turn,
        targetPosition
    );

    return finishTurnIfReady(nextTurn);
}

module.exports = {
    startTurn,
    chooseTurnPosition
};
