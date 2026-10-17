
/*
 * Wreck Resolution
 * ----------------
 * Applies one selected wreck-wheel result to the triggering car.
 *
 * Responsibilities:
 * - Apply backward movement when required.
 * - Apply out-for-race and out-for-event statuses.
 * - Report go-to-back requirements.
 * - Report yellow-flag and follow-on-spin requirements.
 *
 * This function does not mutate the original RaceCar.
 * A race-level coordinator will later handle the other cars,
 * running order, follow-on spins, and restart lineup.
 */

const { CAR_STATUSES } = require("./car-status");
const { resolveWreckWheel } = require("./wreck-wheel");
const { moveBackward } = require("../track/backward-movement");

function resolveWreck({ raceCar, slot, occupiedPositions = [] }) {
    if (!raceCar || typeof raceCar.carId !== "string" || !raceCar.carId.trim()) {
        throw new Error("A valid race car is required to resolve a wreck.");
    }

    if (!raceCar.position) {
        throw new Error("The race car must have a track position.");
    }

    const outcome = resolveWreckWheel(slot);

    // Start with a copy so a failed or new result never changes
    // the caller's original race-car record.
    let updatedRaceCar = { ...raceCar };

    if (outcome.consequence === "backward-3") {
        const movement = moveBackward({
            currentPosition: raceCar.position,
            spaces: 3,
            completedLaps: raceCar.completedLaps,
            occupiedPositions
        });

        updatedRaceCar = {
            ...updatedRaceCar,
            position: movement.position,
            completedLaps: movement.completedLaps
        };

        outcome.movement = movement;
    }

    if (outcome.consequence === "out-for-race") {
        updatedRaceCar.status = CAR_STATUSES.OUT_FOR_RACE;
    } else if (outcome.consequence === "out-for-event") {
        updatedRaceCar.status = CAR_STATUSES.OUT_FOR_EVENT;
    }

    // Wrecks do not alter the car's mechanical-damage field.
    // Mechanical damage belongs to the mechanical wheel rules.
    return {
        raceCar: updatedRaceCar,
        outcome,
        yellowFlag: outcome.yellowFlag,
        goToBack: outcome.consequence === "go-to-back",
        followOnSpins: outcome.followOnSpins.map(
            carsBehind => ({ carsBehind })
        )
    };
}

module.exports = { resolveWreck };
