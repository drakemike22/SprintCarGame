
/*
 * Qualifying Result
 * -----------------
 * Stores the result of one car's qualifying run.
 *
 * This is separate from the permanent Car model because
 * qualifying results change from event to event.
 */

class QualifyingResult {
    constructor({ carId }) {
        // A result must identify the car it belongs to.
        if (typeof carId !== "string" || carId.trim() === "") {
            throw new Error("Car ID must be a non-empty string.");
        }

        this.carId = carId.trim();
    }
}

module.exports = { QualifyingResult };
