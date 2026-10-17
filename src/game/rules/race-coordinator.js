
/*
 * Race Coordinator
 * ----------------
 * Connects the race cars to the turn-round manager.
 *
 * This module manages race-level state. It does not resolve dice,
 * movement, wrecks, mechanical outcomes, or yellow-flag restarts.
 * Those rules remain in their own modules.
 */
const { applyRaceProgress } = require("./apply-race-progress");

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


/*
 * Applies a finished movement turn to the correct race car.
 *
 * The existing race-progress module calculates distance and laps.
 * After updating the car, the coordinator advances the round.
 */
function applyCompletedRaceTurn(raceState, carId, turn) {
    if (!raceState || !Array.isArray(raceState.raceCars)) {
        throw new Error("A valid race state is required.");
    }

    if (raceState.status !== "running") {
        throw new Error("The race is not accepting completed turns.");
    }

    
    // A movement turn cannot advance the round while its event is pending.
    if (
        turn &&
        turn.eventResolution &&
        turn.eventResolution.status !== "resolved"
    ) {
        throw new Error(
            "The race event must be resolved before completing the turn."
        );
    }

    // A mechanical wheel must be spun before the turn can finish.
    if (
        turn &&
        turn.mechanicalWheel &&
        turn.mechanicalWheel.status === "awaiting-spin"
    ) {
        throw new Error(
            "The mechanical wheel must be resolved before completing the turn."
        );
    }

    // A wreck wheel must be spun before the turn can finish.
    if (
        turn &&
        turn.wreckWheel &&
        turn.wreckWheel.status === "awaiting-spin"
    ) {
        throw new Error(
            "The wreck wheel must be resolved before completing the turn."
        );
    }


    const currentCarId = getCurrentTurnCarId(raceState.round);

    if (currentCarId !== carId) {
        throw new Error("The car does not have the current turn.");
    }

    const carIndex = raceState.raceCars.findIndex(
        raceCar => raceCar.carId === carId
    );

    if (carIndex === -1) {
        throw new Error("The current race car could not be found.");
    }

    
    // Start with the race car's current state.
    const currentCar = raceState.raceCars[carIndex];

    // Preserve status and mechanical damage recorded by turn resolution.
    const resolvedCar = turn.raceCar
        ? {
            ...currentCar,
            status: turn.raceCar.status,
            mechanicalDamage: turn.raceCar.mechanicalDamage
        }
        : currentCar;

    // Apply movement progress without losing the resolved mechanical state.
    const updatedCar = applyRaceProgress(resolvedCar, turn);

    raceState.raceCars[carIndex] = updatedCar;

    completeRaceCarTurn(raceState, carId);

    return raceState;
}


module.exports = {
    createRaceState,
    getCurrentRaceCar,
    completeRaceCarTurn,
    skipRaceCarTurn,
    stopRaceRoundForYellow,
    applyCompletedRaceTurn
};
