
/*
 * Race Coordinator
 * ----------------
 * Connects the race cars to the turn-round manager.
 *
 * This module manages race-level state. It does not resolve dice,
 * movement, wrecks, mechanical outcomes, or yellow-flag restarts.
 * Those rules remain in their own modules.
 */

const {
    ROUND_STATUS,
    createTurnRound,
    getCurrentTurnCarId,
    completeCurrentTurn,
    skipCurrentTurn,
    endTurnRoundForYellow
} = require("./turn-round");

/*
 * Creates the state for one individual race.
 *
 * We copy the cars and their positions so the coordinator does not
 * accidentally modify the original array supplied by the caller.
 */
function createRaceState(raceCars) {
    if (!Array.isArray(raceCars)) {
        throw new Error("Race cars must be provided as an array.");
    }

    // Let the round manager validate the cars and determine turn order.
    const round = createTurnRound(raceCars);

    const copiedRaceCars = raceCars.map(raceCar => ({
        ...raceCar,
        position: raceCar.position
            ? { ...raceCar.position }
            : raceCar.position
    }));

    return {
        raceCars: copiedRaceCars,
        round,
        status: round.status === ROUND_STATUS.COMPLETED
            ? "completed"
            : "running",
        yellowFlag: false
    };
}

/*
 * Returns the car whose turn is currently due.
 * Returns null when the round has no remaining turns.
 */
function getCurrentRaceCar(raceState) {
    if (!raceState || !Array.isArray(raceState.raceCars)) {
        throw new Error("A valid race state is required.");
    }

    const carId = getCurrentTurnCarId(raceState.round);

    if (carId === null || carId === undefined) {
        return null;
    }

    return raceState.raceCars.find(
        raceCar => raceCar.carId === carId
    ) || null;
}

/*
 * Records that the current car completed its turn.
 * The turn order stays fixed until the round is finished.
 */
function completeRaceCarTurn(raceState, carId) {
    if (!raceState || !raceState.round) {
        throw new Error("A valid race state is required.");
    }

    completeCurrentTurn(raceState.round, carId);

    if (raceState.round.status === ROUND_STATUS.COMPLETED) {
        raceState.status = "round-complete";
    }

    return raceState;
}

/*
 * Skips the current car's turn when race rules require it.
 */
function skipRaceCarTurn(raceState, carId) {
    if (!raceState || !raceState.round) {
        throw new Error("A valid race state is required.");
    }

    skipCurrentTurn(raceState.round, carId);

    if (raceState.round.status === ROUND_STATUS.COMPLETED) {
        raceState.status = "round-complete";
    }

    return raceState;
}

/*
 * Stops the current round immediately when a yellow flag occurs.
 * Incident resolution and restart positioning will be added later.
 */
function stopRaceRoundForYellow(raceState) {
    if (!raceState || !raceState.round) {
        throw new Error("A valid race state is required.");
    }

    endTurnRoundForYellow(raceState.round);
    raceState.yellowFlag = true;
    raceState.status = "yellow-flag";

    return raceState;
}

module.exports = {
    createRaceState,
    getCurrentRaceCar,
    completeRaceCarTurn,
    skipRaceCarTurn,
    stopRaceRoundForYellow
};
