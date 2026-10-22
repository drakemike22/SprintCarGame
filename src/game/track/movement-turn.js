/*
 * Movement Turn Adapter
 * ---------------------
 * Connects the full-route movement planner to the existing race-turn
 * system.
 *
 * The planner is now responsible for every movement decision.
 * This adapter preserves the older interface expected by turn.js:
 *
 *   planning -> waiting-for-choice
 *   complete -> complete
 *   blocked  -> stuck
 *
 * Unlike the previous movement engine, this module never moves the
 * car automatically. The player chooses each space along the route.
 */

const {
    startMovementPlan,
    chooseMovementPlanPosition,
    undoMovementPlanPosition,
    validateMovementPlan
} = require("./movement-planner");

/*
 * Converts a planner status into the status understood by the existing
 * race-turn and event-resolution system.
 */
function getTurnStatus(plan) {
    switch (plan.status) {
        case "planning":
            return "waiting-for-choice";

        case "complete":
            return "complete";

        case "blocked":
            return "stuck";

        default:
            throw new Error(
                `Unexpected movement planner status: ${plan.status}`
            );
    }
}

/*
 * Creates the turn-shaped result consumed by turn.js.
 *
 * The complete movement plan is retained so later stages can validate
 * the route before applying race progress.
 */
function createMovementTurn(plan) {
    // Validate a route before accepting it as finished.
    // Incomplete routes are still waiting for player choices.
    if (plan.status === "complete" || plan.status === "blocked") {
        const validation = validateMovementPlan(
            plan,
            plan.occupiedPositions
        );

        if (!validation.valid) {
            throw new Error(
                `Invalid movement plan: ${validation.reason}`
            );
        }
    }
    return {
        movementPlan: plan,

        position: {
            section: plan.position.section,
            lane: plan.position.lane
        },

        occupiedPositions: plan.occupiedPositions.map(position => ({
            section: position.section,
            lane: position.lane
        })),

        movementRemaining: plan.movementRemaining,
        laneChangesRemaining: plan.laneChangesRemaining,

        status: getTurnStatus(plan),

        legalNextPositions: plan.legalNextPositions.map(position => ({
            section: position.section,
            lane: position.lane
        })),

        history: plan.history.map(position => ({
            section: position.section,
            lane: position.lane
        }))
    };
}

/*
 * Starts a movement turn by creating a full-route plan.
 *
 * The real race car is not moved here. The player must choose every
 * destination until the route is complete or the car becomes blocked.
 */
function startMovementTurn({
    currentPosition,
    occupiedPositions = [],
    movementRemaining,
    laneChangesRemaining
}) {
    const plan = startMovementPlan({
        currentPosition,
        occupiedPositions,
        movementAllowance: movementRemaining,
        laneChangeAllowance: laneChangesRemaining
    });

    return createMovementTurn(plan);
}

/*
 * Records exactly one player-selected move.
 *
 * If movement remains, the turn waits for another choice. The event
 * cannot resolve until movement is complete or the car is blocked.
 */

function chooseMovementTurnPosition(turn, targetPosition) {
    if (
        !turn ||
        turn.status !== "waiting-for-choice" ||
        !turn.movementPlan
    ) {
        throw new Error(
            "The movement turn is not waiting for a choice."
        );
    }

    const updatedPlan = chooseMovementPlanPosition(
        turn.movementPlan,
        targetPosition
    );

    // Preserve dice, race-car data, and event-resolution fields that
    // were attached to the turn by the existing race rules.
    // Planner-derived movement fields must come from the updated plan.
    return {
        ...turn,
        ...createMovementTurn(updatedPlan)
    };
}


/*
 * Undoes the latest player movement choice.
 *
 * The planner restores the previous position and recalculates the
 * remaining movement and lane-change allowances. This also allows a
 * completed or blocked route to return to planning.
 *
 * Undo is only allowed before event resolution or wheel processing
 * begins. This prevents movement history from being changed after
 * the turn has advanced into race-event processing.
 *
 * Other turn fields, such as dice and race-car data, are preserved.
 */
function undoMovementTurn(turn) {
    if (!turn || !turn.movementPlan) {
        throw new Error(
            "A valid movement turn is required to undo a choice."
        );
    }

    if (
        turn.status !== "waiting-for-choice" &&
        turn.status !== "complete" &&
        turn.status !== "stuck"
    ) {
        throw new Error(
            "The movement turn cannot be undone in its current state."
        );
    }

    if (
        turn.eventResolution ||
        turn.mechanicalWheel ||
        turn.wreckWheel
    ) {
        throw new Error(
            "Movement cannot be undone after event resolution begins."
        );
    }

    const updatedPlan = undoMovementPlanPosition(
        turn.movementPlan
    );

    return {
        ...turn,
        ...createMovementTurn(updatedPlan)
    };
}

module.exports = {
    startMovementTurn,
    chooseMovementTurnPosition,
    undoMovementTurn
};
