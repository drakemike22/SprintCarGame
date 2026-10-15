
/*
 * Apply Mechanical Outcome
 * -----------------------
 * Applies a mechanical-wheel result to a race car.
 *
 * This module updates the car's temporary race status.
 * It does not change movement, distance, or completed laps.
 */

const { applyMechanicalOutcome } = require("./car-status");

function applyMechanicalResult(raceCar, outcome) {
    if (!raceCar || typeof raceCar.carId !== "string") {
        throw new Error("A valid race car is required.");
    }

    const result = applyMechanicalOutcome(outcome);

    return {
        ...raceCar,
        status: result.status,
        mechanicalDamage: result.mechanicalDamage
    };
}

module.exports = { applyMechanicalResult };
