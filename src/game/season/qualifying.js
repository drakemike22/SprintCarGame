
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
        this.rollsCompleted = 0;
        this.distance = 0;
        this.isFinished = false;
        this.finishReason = null;
    }
    completeRoll() {
        if (this.isFinished) {
            throw new Error("The qualifying run is already finished.");
        }

        if (this.rollsCompleted >= 3) {
            throw new Error("A qualifying run cannot exceed three rolls.");
        }

        this.rollsCompleted += 1;
    }

    recordDistance(spaces) {
        if (this.isFinished) {
            throw new Error("The qualifying run is already finished.");
        }

        if (!Number.isInteger(spaces) || spaces < 0) {
            throw new Error(
                "Distance must be a non-negative whole number."
            );
        }

        this.distance += spaces;
    }

    finish(reason) {
        const validReasons = [
            "three-rolls",
            "wreck",
            "mechanical-failure"
        ];

        if (!validReasons.includes(reason)) {
            throw new Error("Invalid qualifying finish reason.");
        }

        if (this.isFinished) {
            throw new Error("The qualifying run is already finished.");
        }

        if (reason === "three-rolls" && this.rollsCompleted !== 3) {
            throw new Error(
                "A qualifying run must complete three rolls to finish normally."
            );
        }

        this.isFinished = true;
        this.finishReason = reason;
    }
}

module.exports = { QualifyingResult };
