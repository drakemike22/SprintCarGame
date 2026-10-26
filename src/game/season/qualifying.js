
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
        if (typeof carId !== "string" || carId.trim() === "") {
            throw new Error("Car ID must be a non-empty string.");
        }

        this.carId = carId.trim();
        this.rollsCompleted = 0;
        this.distance = 0;
        this.isFinished = false;
        this.finishReason = null;

        // The active turn is retained until its movement and any
        // required event-wheel resolution are finished.
        this.movementTurn = null;

        // The first qualifying roll starts at the start line.
        // Subsequent rolls resume from the previous ending position.
        this.qualifyingPosition = { section: 29, lane: 2 };
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

    /*
     * Records a completed server-generated movement turn.
     *
     * Distance is based on the number of actual section-to-section
     * moves in the movement history, not the movement die allowance.
     * Lane changes do not add qualifying distance.
     */
    recordMovementRoll({ spaces, finalPosition }) {
        if (this.isFinished) {
            throw new Error("The qualifying run is already finished.");
        }

        if (this.rollsCompleted >= 3) {
            throw new Error("A qualifying run cannot exceed three rolls.");
        }

        if (!Number.isInteger(spaces) || spaces < 0) {
            throw new Error(
                "Movement distance must be a non-negative whole number."
            );
        }

        if (
            !finalPosition ||
            !Number.isInteger(finalPosition.section) ||
            finalPosition.section < 0 ||
            finalPosition.section > 29 ||
            !Number.isInteger(finalPosition.lane) ||
            finalPosition.lane < 0 ||
            finalPosition.lane > 3
        ) {
            throw new Error("A valid final qualifying position is required.");
        }

        // Validate everything before changing the result.
        this.recordDistance(spaces);
        this.qualifyingPosition = {
            section: finalPosition.section,
            lane: finalPosition.lane
        };
        this.completeRoll();

        if (this.rollsCompleted === 3) {
            this.finish("three-rolls");
        }

        return this;
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

