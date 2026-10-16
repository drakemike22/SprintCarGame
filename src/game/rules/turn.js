
/*
 * Race Turn Rules
 * ---------------
 * Connects dice rolls, car statistics, track movement,
 * race-event detection, and mechanical wheel resolution.
 *
 * Mechanical outcomes are recorded here.
 * Actual car consequences are handled separately.
 */
const { CAR_STATUSES } = require("./car-status");

const {
    applyMechanicalResult
} = require("./apply-mechanical-outcome");

const {
    calculateMovement,
    calculateLaneChange
} = require("./movement");

const {
    detectRaceEvent
} = require("./events");

const {
    resolveMechanicalWheel
} = require("./mechanical-wheel");

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
    if (turn.status === "waiting-for-choice") {
        return {
            ...turn,
            eventResolution: {
                status: "pending"
            }
        };
    }

    // Movement is finished or the car is stuck.
    const result = detectRaceEvent({
        movementDie: turn.dice.movement,
        laneChangeDie: turn.dice.laneChange,
        eventDie: turn.dice.event
    });

    return {
        ...turn,
        eventResolution: {
            status: "resolved",
            result
        },
        mechanicalWheel: {
            status:
                result.type === "mechanical-spinner"
                    ? "awaiting-spin"
                    : "not-required"
        }
    };
}

function startTurn({
    car,
    raceCar,
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
    
    if (
        raceCar &&
        raceCar.status !== CAR_STATUSES.RUNNING
    ) {
        throw new Error("This car cannot take a turn.");
    }

    const turn = startMovementTurn({
        currentPosition,
        occupiedPositions,
        movementRemaining: movementAllowance,
        laneChangesRemaining: laneChangeAllowance
    });

    const turnWithDice = {
        ...turn,
        ...(raceCar ? { raceCar } : {}),
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

function resolveMechanicalSpinner(turn, slot) {
    if (
        !turn ||
        !turn.eventResolution ||
        turn.eventResolution.status !== "resolved" ||
        turn.eventResolution.result.type !== "mechanical-spinner"
    ) {
        throw new Error(
            "The turn must have a resolved mechanical-spinner event."
        );
    }

    if (
        !turn.mechanicalWheel ||
        turn.mechanicalWheel.status !== "awaiting-spin"
    ) {
        throw new Error(
            "The mechanical wheel has already been resolved."
        );
    }

    const result = resolveMechanicalWheel(slot);

    const resolvedTurn = {
        ...turn,
        mechanicalWheel: {
            status: "resolved",
            result
        }
    };

    // Update the race-car record when one was supplied.
    if (turn.raceCar) {
        resolvedTurn.raceCar = applyMechanicalResult(
            turn.raceCar,
            result
        );
    }

    return resolvedTurn;
}

module.exports = {
    startTurn,
    chooseTurnPosition,
    resolveMechanicalSpinner
};

