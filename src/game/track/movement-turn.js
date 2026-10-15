const {
    isValidPosition,
    getLegalNextPositions,
    advanceOneSection
} = require("./movement");

function validateAllowance(value, name) {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${name} must be a non-negative whole number.`);
    }
}

function copyPosition(position) {
    return {
        section: position.section,
        lane: position.lane
    };
}

function copyTurn(turn) {
    return {
        ...turn,
        position: copyPosition(turn.position),
        occupiedPositions: turn.occupiedPositions.map(copyPosition),
        legalNextPositions: turn.legalNextPositions.map(copyPosition),
        history: turn.history.map(copyPosition)
    };
}

function continueMovementTurn(turn) {
    while (true) {
        if (turn.movementRemaining === 0) {
            turn.status = "complete";
            turn.legalNextPositions = [];
            return turn;
        }

        const legalPositions = getLegalNextPositions(
            turn.position,
            turn.occupiedPositions,
            turn.laneChangesRemaining
        );

        if (legalPositions.length === 0) {
            turn.status = "stuck";
            turn.legalNextPositions = [];
            return turn;
        }

        if (legalPositions.length > 1) {
            turn.status = "waiting-for-choice";
            turn.legalNextPositions = legalPositions.map(copyPosition);
            return turn;
        }

        const result = advanceOneSection({
            currentPosition: turn.position,
            targetPosition: legalPositions[0],
            occupiedPositions: turn.occupiedPositions,
            movementRemaining: turn.movementRemaining,
            laneChangesRemaining: turn.laneChangesRemaining
        });

        turn.position = copyPosition(result.position);
        turn.movementRemaining = result.movementRemaining;
        turn.laneChangesRemaining = result.laneChangesRemaining;
        turn.history.push(copyPosition(turn.position));
    }
}

function startMovementTurn({
    currentPosition,
    occupiedPositions = [],
    movementRemaining,
    laneChangesRemaining
}) {
    if (!isValidPosition(currentPosition)) {
        throw new Error("The starting position is invalid.");
    }

    if (!Array.isArray(occupiedPositions)) {
        throw new Error("Occupied positions must be an array.");
    }

    if (!occupiedPositions.every(isValidPosition)) {
        throw new Error("An occupied position is invalid.");
    }

    validateAllowance(movementRemaining, "Movement remaining");
    validateAllowance(laneChangesRemaining, "Lane changes remaining");

    const start = copyPosition(currentPosition);

    const turn = {
        position: start,
        occupiedPositions: occupiedPositions.map(copyPosition),
        movementRemaining,
        laneChangesRemaining,
        status: "moving",
        legalNextPositions: [],
        history: [copyPosition(start)]
    };

    return continueMovementTurn(turn);
}

function chooseMovementTurnPosition(turn, targetPosition) {
    if (!turn || turn.status !== "waiting-for-choice") {
        throw new Error("The movement turn is not waiting for a choice.");
    }

    if (!isValidPosition(targetPosition)) {
        throw new Error("The chosen position is invalid.");
    }

    const isLegalChoice = turn.legalNextPositions.some(
        position =>
            position.section === targetPosition.section &&
            position.lane === targetPosition.lane
    );

    if (!isLegalChoice) {
        throw new Error("The chosen position is not a legal option.");
    }

    const nextTurn = copyTurn(turn);

    const result = advanceOneSection({
        currentPosition: nextTurn.position,
        targetPosition,
        occupiedPositions: nextTurn.occupiedPositions,
        movementRemaining: nextTurn.movementRemaining,
        laneChangesRemaining: nextTurn.laneChangesRemaining
    });

    nextTurn.position = copyPosition(result.position);
    nextTurn.movementRemaining = result.movementRemaining;
    nextTurn.laneChangesRemaining = result.laneChangesRemaining;
    nextTurn.legalNextPositions = [];
    nextTurn.status = "moving";
    nextTurn.history.push(copyPosition(nextTurn.position));

    return continueMovementTurn(nextTurn);
}

module.exports = {
    startMovementTurn,
    chooseMovementTurnPosition
};