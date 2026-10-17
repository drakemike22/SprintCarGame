
/*
 * Turn Round Rules
 * ----------------
 * Manages the order in which running cars take their turns.
 *
 * At the start of a round, race order is calculated once.
 * That order stays fixed until every eligible car has either:
 * - completed its turn, or
 * - been skipped because it is no longer running.
 *
 * A yellow flag ends the round immediately. Remaining cars
 * do not get a turn until the restart creates a new round.
 *
 * This module manages round state, not race-car positions,
 * dice rolls, wrecks, or yellow-flag restart lineups.
 */

const { getTurnOrder } = require("./race-order");

const ROUND_STATUS = Object.freeze({
    IN_PROGRESS: "in-progress",
    COMPLETED: "completed",
    ENDED_BY_YELLOW: "ended-by-yellow"
});

function validateRound(round) {
    if (
        !round ||
        !Array.isArray(round.order) ||
        !Array.isArray(round.completedCarIds) ||
        !Array.isArray(round.skippedCarIds) ||
        !Number.isInteger(round.currentIndex) ||
        round.currentIndex < 0 ||
        round.currentIndex > round.order.length ||
        !Object.values(ROUND_STATUS).includes(round.status)
    ) {
        throw new Error("A valid turn round is required.");
    }
}

function createTurnRound(raceCars) {
    const order = getTurnOrder(raceCars).map((raceCar) => raceCar.carId);

    return {
        order,
        currentIndex: 0,
        completedCarIds: [],
        skippedCarIds: [],
        status: order.length === 0
            ? ROUND_STATUS.COMPLETED
            : ROUND_STATUS.IN_PROGRESS,
        endedBy: null
    };
}

function getCurrentTurnCarId(round) {
    validateRound(round);

    if (round.status !== ROUND_STATUS.IN_PROGRESS) {
        return null;
    }

    if (round.currentIndex >= round.order.length) {
        return null;
    }

    return round.order[round.currentIndex];
}

function finishCurrentTurn(round, carId, resultList) {
    validateRound(round);

    if (round.status !== ROUND_STATUS.IN_PROGRESS) {
        throw new Error("This round is not in progress.");
    }

    const expectedCarId = getCurrentTurnCarId(round);

    if (expectedCarId === null) {
        throw new Error("There is no remaining turn to finish.");
    }

    if (carId !== expectedCarId) {
        throw new Error(
            `Expected car ${expectedCarId} to take its turn, not ${carId}.`
        );
    }

    resultList.push(carId);
    round.currentIndex += 1;

    if (round.currentIndex >= round.order.length) {
        round.status = ROUND_STATUS.COMPLETED;
    }

    return round;
}

function completeCurrentTurn(round, carId) {
    return finishCurrentTurn(round, carId, round.completedCarIds);
}

function skipCurrentTurn(round, carId) {
    return finishCurrentTurn(round, carId, round.skippedCarIds);
}

function endTurnRoundForYellow(round) {
    validateRound(round);

    if (round.status !== ROUND_STATUS.IN_PROGRESS) {
        throw new Error("Only an active round can end for a yellow flag.");
    }

    round.status = ROUND_STATUS.ENDED_BY_YELLOW;
    round.endedBy = "yellow-flag";

    return round;
}

module.exports = {
    ROUND_STATUS,
    createTurnRound,
    getCurrentTurnCarId,
    completeCurrentTurn,
    skipCurrentTurn,
    endTurnRoundForYellow
};
