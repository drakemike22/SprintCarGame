
/*
 * Apply Race Progress
 * -------------------
 * Applies the results of a movement turn to a race car.
 *
 * The movement engine records where the car went.
 * Race-progress rules calculate distance and laps.
 * This module connects those results to the race car.
 */

const { measureRaceProgress } = require("./race-progress");

function applyRaceProgress(raceCar, turn) {
    if (!raceCar || typeof raceCar.carId !== "string") {
        throw new Error("A valid race car is required.");
    }

    if (!turn || !["complete", "stuck"].includes(turn.status)) {
        throw new Error("The movement turn must be finished.");
    }

    if (
        !turn.position ||
        !Number.isInteger(turn.position.section) ||
        !Number.isInteger(turn.position.lane)
    ) {
        throw new Error("The turn must have a valid final position.");
    }
    const finalHistoryPosition = turn.history?.[turn.history.length - 1];

    if (
        !finalHistoryPosition ||
        finalHistoryPosition.section !== turn.position.section ||
        finalHistoryPosition.lane !== turn.position.lane
    ) {
        throw new Error(
            "The final position must match the movement history."
        );
    }

    const progress = measureRaceProgress(turn.history);

    const wreckMovedBackward =
        turn.wreckWheel?.result?.consequence === "backward-3";
    const finalPosition = wreckMovedBackward
        ? raceCar.position
        : turn.position;

    return {
        ...raceCar,
        position: {
            section: finalPosition.section,
            lane: finalPosition.lane
        },
        distance: raceCar.distance + progress.distance,
        completedLaps: wreckMovedBackward
            ? raceCar.completedLaps
            : raceCar.completedLaps + progress.completedLaps
    };
}

module.exports = { applyRaceProgress };
