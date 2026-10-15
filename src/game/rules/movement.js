
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

module.exports = { calculateMovement };
