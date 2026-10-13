
/*
 * Permanent Car Model
 * --------------------
 * This file defines the permanent information every car in the
 * Sprint Car Game must have.
 *
 * Permanent data does NOT include:
 * - Race position or lap count
 * - Current track location
 * - Wrecks or mechanical failures
 * - Season points or player ownership
 *
 * Those values change during gameplay and belong in separate
 * race and season data structures.
 */

// Define the permanent structure and validation rules for a car.
class Car {
    constructor({ id, driverName, number, autoMovement, bonusMovement }) {
        // Validate the supplied data before saving it.
        // This prevents incomplete or invalid car definitions.
        if (typeof id !== "string" || id.trim() === "") {
            throw new Error("Car ID must be a non-empty string.");
        }

        if (typeof driverName !== "string" || driverName.trim() === "") {
            throw new Error("Driver name must be a non-empty string.");
        }

        // Store the car number as text.
        // This allows numbers such as "24", "7BC", and "17GP".
        if (typeof number !== "string" || number.trim() === "") {
            throw new Error("Car number must be a non-empty string.");
        }

        // Movement stats must be whole numbers greater than or equal to zero.
        if (!Number.isInteger(autoMovement) || autoMovement < 0) {
            throw new Error("Automatic movement must be a non-negative integer.");
        }

        if (!Number.isInteger(bonusMovement) || bonusMovement < 0) {
            throw new Error("Bonus movement must be a non-negative integer.");
        }

        // Trim accidental spaces around text fields before storing them.
        this.id = id.trim();
        this.driverName = driverName.trim();
        this.number = number.trim();
        this.autoMovement = autoMovement;
        this.bonusMovement = bonusMovement;
    }
}

// Export the class so other files and tests can use it.
module.exports = { Car };
