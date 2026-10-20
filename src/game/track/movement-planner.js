
/*
 * Full-Route Movement Planner
 * ---------------------------
 * Lets a player plan a complete route before the car actually moves.
 *
 * Important rules:
 * - The real car position is never changed by planning.
 * - Each move advances exactly one track section.
 * - The track wraps from section 29 to section 0.
 * - A player may choose any open lane within the remaining lane-change
 *   allowance, even when their current lane is open.
 * - Entering an occupied space is never legal.
 * - Every section advanced costs one movement point.
 * - Changing lanes costs the absolute difference between lane numbers.
 * - If every next-section space is blocked, remaining movement is lost.
 * - A completed route can be validated before it is executed.
 */

const {
    TRACK_SECTIONS,
    TRACK_LANES,
    isValidPosition,
    getNextSection
} = require("./movement");

function clonePosition(position) {
    return {
        section: position.section,
        lane: position.lane
    };
}

function clonePositions(positions) {
    return positions.map(clonePosition);
}

function positionsEqual(first, second) {
    return (
        first.section === second.section &&
        first.lane === second.lane
    );
}

function positionKey(position) {
    return `${position.section}:${position.lane}`;
}

function samePositionSet(first, second) {
    if (first.length !== second.length) {
        return false;
    }

    const firstKeys = first.map(positionKey).sort();
    const secondKeys = second.map(positionKey).sort();

    return firstKeys.every((key, index) => key === secondKeys[index]);
}

function isOccupied(position, occupiedPositions) {
    return occupiedPositions.some(occupied =>
        positionsEqual(position, occupied)
    );
}

function getLegalPlannerPositions(
    currentPosition,
    occupiedPositions,
    laneChangesRemaining
) {
    const nextSection = getNextSection(currentPosition.section);
    const legalPositions = [];

    for (let lane = 0; lane < TRACK_LANES; lane += 1) {
        const candidate = {
            section: nextSection,
            lane
        };

        const laneChangeCost = Math.abs(lane - currentPosition.lane);

        if (laneChangeCost > laneChangesRemaining) {
            continue;
        }

        if (isOccupied(candidate, occupiedPositions)) {
            continue;
        }

        legalPositions.push(candidate);
    }

    return legalPositions;
}

function createPlanState({
    position,
    history,
    steps,
    movementRemaining,
    laneChangesRemaining,
    movementAllowance,
    laneChangeAllowance,
    occupiedPositions,
    status
}) {
    const legalNextPositions =
        status === "planning"
            ? getLegalPlannerPositions(
                position,
                occupiedPositions,
                laneChangesRemaining
            )
            : [];

    let finalStatus = status;
    let finalMovementRemaining = movementRemaining;

    // A car cannot wait in place when all forward spaces are blocked.
    // The official rule says it loses the rest of its movement.
    if (
        finalStatus === "planning" &&
        finalMovementRemaining > 0 &&
        legalNextPositions.length === 0
    ) {
        finalStatus = "blocked";
        finalMovementRemaining = 0;
    }

    return {
        position: clonePosition(position),
        history: clonePositions(history),
        steps: steps.map(step => ({
            from: clonePosition(step.from),
            to: clonePosition(step.to),
            movementCost: step.movementCost,
            laneChangeCost: step.laneChangeCost
        })),
        movementRemaining: finalMovementRemaining,
        laneChangesRemaining,
        movementAllowance,
        laneChangeAllowance,
        occupiedPositions: clonePositions(occupiedPositions),
        status: finalStatus,
        legalNextPositions:
            finalStatus === "planning"
                ? legalNextPositions.map(clonePosition)
                : []
    };
}

/**
 * Starts planning a complete route without moving the real car.
 */
function startMovementPlan({
    currentPosition,
    occupiedPositions = [],
    movementAllowance,
    laneChangeAllowance
}) {
    if (!isValidPosition(currentPosition)) {
        throw new Error("Current position is invalid.");
    }

    if (!Array.isArray(occupiedPositions)) {
        throw new Error("Occupied positions must be an array.");
    }

    if (!Number.isInteger(movementAllowance) || movementAllowance < 0) {
        throw new Error("Movement allowance must be a non-negative integer.");
    }

    if (!Number.isInteger(laneChangeAllowance) || laneChangeAllowance < 0) {
        throw new Error("Lane-change allowance must be a non-negative integer.");
    }

    const copiedOccupiedPositions = clonePositions(occupiedPositions);

    for (const position of copiedOccupiedPositions) {
        if (!isValidPosition(position)) {
            throw new Error("An occupied position is invalid.");
        }
    }

    const initialStatus =
        movementAllowance === 0 ? "complete" : "planning";

    return createPlanState({
        position: currentPosition,
        history: [currentPosition],
        steps: [],
        movementRemaining: movementAllowance,
        laneChangesRemaining: laneChangeAllowance,
        movementAllowance,
        laneChangeAllowance,
        occupiedPositions: copiedOccupiedPositions,
        status: initialStatus
    });
}

/**
 * Adds one legal space to the planned route.
 * Returns a new plan; it does not mutate the existing plan.
 */
function chooseMovementPlanPosition(plan, targetPosition) {
    if (!plan || plan.status !== "planning") {
        throw new Error("A route choice is only allowed while planning.");
    }

    if (!isValidPosition(targetPosition)) {
        throw new Error("The selected position is invalid.");
    }

    const isLegal = plan.legalNextPositions.some(position =>
        positionsEqual(position, targetPosition)
    );

    if (!isLegal) {
        throw new Error(
            "The selected position is not legal, allowed, or available."
        );
    }

    const currentPosition = plan.position;
    const laneChangeCost = Math.abs(
        targetPosition.lane - currentPosition.lane
    );

    const nextMovementRemaining = plan.movementRemaining - 1;
    const nextLaneChangesRemaining =
        plan.laneChangesRemaining - laneChangeCost;

    const nextHistory = [
        ...plan.history,
        clonePosition(targetPosition)
    ];

    const nextSteps = [
        ...plan.steps,
        {
            from: clonePosition(currentPosition),
            to: clonePosition(targetPosition),
            movementCost: 1,
            laneChangeCost
        }
    ];

    const nextStatus =
        nextMovementRemaining === 0 ? "complete" : "planning";

    return createPlanState({
        position: targetPosition,
        history: nextHistory,
        steps: nextSteps,
        movementRemaining: nextMovementRemaining,
        laneChangesRemaining: nextLaneChangesRemaining,
        movementAllowance: plan.movementAllowance,
        laneChangeAllowance: plan.laneChangeAllowance,
        occupiedPositions: plan.occupiedPositions,
        status: nextStatus
    });
}

/**
 * Removes the last planned step and restores its movement costs.
 * The original plan remains unchanged.
 */
function undoMovementPlanPosition(plan) {
    if (!plan || plan.history.length <= 1) {
        throw new Error("There is no route choice available to undo.");
    }

    const removedStep = plan.steps[plan.steps.length - 1];
    const nextHistory = plan.history.slice(0, -1);
    const nextSteps = plan.steps.slice(0, -1);
    const previousPosition = nextHistory[nextHistory.length - 1];

    return createPlanState({
        position: previousPosition,
        history: nextHistory,
        steps: nextSteps,
        movementRemaining:
            plan.movementRemaining + removedStep.movementCost,
        laneChangesRemaining:
            plan.laneChangesRemaining + removedStep.laneChangeCost,
        movementAllowance: plan.movementAllowance,
        laneChangeAllowance: plan.laneChangeAllowance,
        occupiedPositions: plan.occupiedPositions,
        status: "planning"
    });
}

/**
 * Checks that a route is complete, internally consistent, and based on
 * the same occupied spaces as the current race state.
 */

function validateMovementPlan(plan, currentOccupiedPositions = []) {
    const invalid = reason => ({
        valid: false,
        reason
    });

    if (!plan || typeof plan !== "object") {
        return invalid("A movement plan is required.");
    }

    if (!Array.isArray(currentOccupiedPositions)) {
        return invalid("Current occupied spaces must be an array.");
    }

    // Reject malformed positions before comparing or inspecting them.
    if (
        !Array.isArray(plan.occupiedPositions) ||
        !plan.occupiedPositions.every(isValidPosition) ||
        !currentOccupiedPositions.every(isValidPosition)
    ) {
        return invalid("Occupied spaces contain an invalid position.");
    }

    if (
        !samePositionSet(
            plan.occupiedPositions,
            currentOccupiedPositions
        )
    ) {
        return invalid("Occupied spaces changed; the route is stale.");
    }

    if (plan.status !== "complete" && plan.status !== "blocked") {
        return invalid(
            "The route must be complete before it can be confirmed."
        );
    }

    if (
        !isValidPosition(plan.position) ||
        !Array.isArray(plan.history) ||
        plan.history.length === 0 ||
        !plan.history.every(isValidPosition) ||
        !Array.isArray(plan.steps) ||
        plan.history.length !== plan.steps.length + 1
    ) {
        return invalid("The route history or final position is invalid.");
    }

    if (
        !Number.isInteger(plan.movementAllowance) ||
        plan.movementAllowance < 0 ||
        !Number.isInteger(plan.laneChangeAllowance) ||
        plan.laneChangeAllowance < 0 ||
        !Number.isInteger(plan.movementRemaining) ||
        plan.movementRemaining < 0 ||
        !Number.isInteger(plan.laneChangesRemaining) ||
        plan.laneChangesRemaining < 0
    ) {
        return invalid("The route has invalid movement allowances.");
    }

    let movementSpent = 0;
    let laneChangesSpent = 0;
    let laneChangesLeft = plan.laneChangeAllowance;

    for (let index = 0; index < plan.steps.length; index += 1) {
        const step = plan.steps[index];
        const expectedFrom = plan.history[index];
        const expectedTo = plan.history[index + 1];

        // Check step shape before reading its properties.
        if (
            !step ||
            typeof step !== "object" ||
            !isValidPosition(step.from) ||
            !isValidPosition(step.to)
        ) {
            return invalid("The route contains a malformed step.");
        }

        if (
            !positionsEqual(step.from, expectedFrom) ||
            !positionsEqual(step.to, expectedTo) ||
            step.to.section !== getNextSection(step.from.section)
        ) {
            return invalid(
                "The route contains an invalid or disconnected step."
            );
        }

        const actualLaneCost = Math.abs(
            step.to.lane - step.from.lane
        );

        if (
            step.movementCost !== 1 ||
            step.laneChangeCost !== actualLaneCost
        ) {
            return invalid("The route contains incorrect movement costs.");
        }

        if (actualLaneCost > laneChangesLeft) {
            return invalid(
                "A route step exceeds the remaining lane-change allowance."
            );
        }

        if (isOccupied(step.to, plan.occupiedPositions)) {
            return invalid("The route enters an occupied space.");
        }

        movementSpent += step.movementCost;
        laneChangesSpent += step.laneChangeCost;
        laneChangesLeft -= actualLaneCost;
    }

    if (
        movementSpent > plan.movementAllowance ||
        laneChangesSpent > plan.laneChangeAllowance ||
        (
            plan.status === "complete" &&
            plan.movementRemaining !==
                plan.movementAllowance - movementSpent
        ) ||
        plan.laneChangesRemaining !==
            plan.laneChangeAllowance - laneChangesSpent
    ) {
        return invalid(
            "The route exceeds or misreports its movement allowances."
        );
    }

    if (
        !positionsEqual(
            plan.position,
            plan.history[plan.history.length - 1]
        )
    ) {
        return invalid(
            "The planned final position does not match its history."
        );
    }

    if (plan.status === "complete") {
        if (
            plan.movementRemaining !== 0 ||
            movementSpent !== plan.movementAllowance
        ) {
            return invalid(
                "A completed route must use all available movement."
            );
        }
    }

    if (plan.status === "blocked") {
        if (plan.movementRemaining !== 0) {
            return invalid(
                "A blocked route must forfeit its remaining movement."
            );
        }

        const availableNextPositions = getLegalPlannerPositions(
            plan.position,
            plan.occupiedPositions,
            plan.laneChangesRemaining
        );

        if (availableNextPositions.length > 0) {
            return invalid(
                "The route is marked blocked despite legal next spaces."
            );
        }
    }

    return {
        valid: true,
        reason: null
    };
}

module.exports = {
    startMovementPlan,
    chooseMovementPlanPosition,
    undoMovementPlanPosition,
    validateMovementPlan
};
