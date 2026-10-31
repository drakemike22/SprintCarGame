
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

const { resolveWreckWheel } = require("./wreck-wheel");
const { resolveWreck } = require("./resolve-wreck");

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
const { measureRaceProgress } = require("./race-progress");

const {
    startMovementTurn,
    chooseMovementTurnPosition,
    undoMovementTurn
} = require("../track/movement-turn");

function validateDie(value, name) {
    if (!Number.isInteger(value) || value < 1 || value > 6) {
        throw new Error(
            `${name} must be a whole number from 1 through 6.`
        );
    }
}


function finishTurnIfReady(turn) {
    // The player still needs to choose a lane before the event can resolve.
    if (turn.status === "waiting-for-choice") {
        return {
            ...turn,
            eventResolution: {
                status: "pending"
            },
            mechanicalWheel: {
                status: "pending"
            },
            wreckWheel: {
                status: "pending"
            }
        };
    }

    // Movement is finished or the car is stuck, so determine the event.
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
        },
        wreckWheel: {
            status:
                result.type === "wreck"
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
/*
 * Undoes the most recent movement choice through the public turn API.
 *
 * Undo is intentionally restricted to active movement planning.
 * The event and wheel records must still be pending; once movement
 * finishes and an event resolves, the turn must not be rewound.
 *
 * The adapter restores the previous position and recalculates the
 * remaining movement and lane-change allowances. Dice, race-car data,
 * and pending event records are preserved.
 */
function undoTurnPosition(turn) {
    if (!turn || turn.status !== "waiting-for-choice") {
        throw new Error(
            "A turn must be waiting for a movement choice to undo."
        );
    }

    if (
        !turn.eventResolution ||
        turn.eventResolution.status !== "pending"
    ) {
        throw new Error(
            "A turn can only be undone before event resolution begins."
        );
    }

    if (
        (turn.mechanicalWheel &&
            turn.mechanicalWheel.status !== "pending") ||
        (turn.wreckWheel &&
            turn.wreckWheel.status !== "pending")
    ) {
        throw new Error(
            "A turn can only be undone before wheel processing begins."
        );
    }

    return undoMovementTurn(turn);
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


function resolveWreckSpinner(turn, slot, occupiedPositions = []) {
    if (
        !turn ||
        !turn.eventResolution ||
        turn.eventResolution.status !== "resolved" ||
        !turn.eventResolution.result ||
        turn.eventResolution.result.type !== "wreck"
    ) {
        throw new Error(
            "The turn must have a resolved wreck event."
        );
    }

    if (
        !turn.wreckWheel ||
        turn.wreckWheel.status !== "awaiting-spin"
    ) {
        throw new Error(
            "The wreck wheel has already been resolved."
        );
    }

    // Resolve the selected slot using the existing wreck rules.
    // If a race-car record exists, also apply its direct consequence.
    let outcome;
    let wreckResolution = {
        yellowFlag: false,
        goToBack: false,
        followOnSpins: []
    };
    let updatedRaceCar = turn.raceCar;

    if (turn.raceCar) {
        // Wreck-wheel movement happens after the car completes its normal
        // route, so resolve backward movement from the route's final space,
        // not from the position where the turn originally started.
        const movementProgress = measureRaceProgress(turn.history);
        const raceCarAtMovementEnd = {
            ...turn.raceCar,
            position: { ...turn.position },
            completedLaps: turn.raceCar.completedLaps + movementProgress.completedLaps
        };
        const resolution = resolveWreck({
            raceCar: raceCarAtMovementEnd,
            slot,
            occupiedPositions
        });

        outcome = resolution.outcome;
        updatedRaceCar = resolution.raceCar;

        wreckResolution = {
            yellowFlag: resolution.yellowFlag,
            goToBack: resolution.goToBack,
            followOnSpins: resolution.followOnSpins
        };
    } else {
        outcome = resolveWreckWheel(slot);
    }

    const resolvedTurn = {
        ...turn,
        wreckWheel: {
            status: "resolved",
            result: outcome
        },
        wreckResolution
    };

    if (turn.raceCar) {
        resolvedTurn.raceCar = updatedRaceCar;
    }

    return resolvedTurn;
}

module.exports = {
    startTurn,
    chooseTurnPosition,
    undoTurnPosition,
    resolveMechanicalSpinner,
    resolveWreckSpinner
};

