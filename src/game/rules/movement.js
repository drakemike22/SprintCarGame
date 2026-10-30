
/*
 * Movement Rules
 * --------------
 * Calculates how many spaces a car moves during one roll.
 *
 * This module calculates distance only. It does not move
 * the car around the track or resolve wrecks and other events.
 */

function calculateMovement(car, movementDie, laneChangeDie) {
    // Validate that a usable car object was supplied.
    if (!car || typeof car !== "object") {
        throw new Error("A valid car is required.");
    }

    // Validate the car's permanent movement statistics.
    if (
        !Number.isInteger(car.autoMovement) ||
        car.autoMovement < 0 ||
        !Number.isInteger(car.bonusMovement) ||
        car.bonusMovement < 0
    ) {
        throw new Error(
            "Car movement statistics must be non-negative whole numbers."
        );
    }

    // Both dice must produce whole numbers from 1 through 6.
    const dice = [movementDie, laneChangeDie];

    if (
        !dice.every(
            die => Number.isInteger(die) && die >= 1 && die <= 6
        )
    ) {
        throw new Error(
            "Dice must be whole numbers from 1 through 6."
        );
    }

    // Start with automatic movement plus the movement die.
    let movement = car.autoMovement + movementDie;

    // Matching dice add the car's permanent bonus movement.
    if (movementDie === laneChangeDie) {
        movement += car.bonusMovement;
    }

    return movement;
}

/*
 * Calculates how many lanes a car changes based on the
 * lane-change die.
 *
 * This returns the number of lanes, not the final lane.
 * Track boundaries and the car's current lane will be
 * handled when we implement actual track movement.
 */
function calculateLaneChange(laneChangeDie) {
    if (
        !Number.isInteger(laneChangeDie) ||
        laneChangeDie < 1 ||
        laneChangeDie > 6
    ) {
        throw new Error(
            "Lane-change die must be a whole number from 1 through 6."
        );
    }

    if (laneChangeDie === 1) {
        return 0;
    }

    if (laneChangeDie === 2) {
        return 1;
    }

    if (laneChangeDie === 3 || laneChangeDie === 4) {
        return 2;
    }

    if (laneChangeDie === 5) {
        return 3;
    }

    return 4;
}

module.exports = {
    calculateMovement,
    calculateLaneChange
};
