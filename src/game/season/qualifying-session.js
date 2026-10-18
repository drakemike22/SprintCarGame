
/*
 * Qualifying Session
 * ------------------
 * Coordinates qualifying runs for every car in a defined order.
 *
 * QualifyingResult tracks one car's run.
 * QualifyingSession tracks the overall procedure:
 * - which car qualifies next
 * - whether a run is currently active
 * - when each run finishes
 * - final results and tie-breaking
 */

const { QualifyingResult } = require("./qualifying");

class QualifyingSession {
    constructor(carIds) {
        if (!Array.isArray(carIds) || carIds.length === 0) {
            throw new Error("Qualifying requires a nonempty list of car IDs.");
        }

        if (
            carIds.some(
                (carId) =>
                    typeof carId !== "string" || carId.trim().length === 0
            )
        ) {
            throw new Error("Every qualifying car must have a valid car ID.");
        }

        if (new Set(carIds).size !== carIds.length) {
            throw new Error("Qualifying car IDs must be unique.");
        }

        // Keep the original order: it determines the qualifying tie-breaker.
        this.carIds = [...carIds];

        this.nextCarIndex = 0;
        this.activeResult = null;
        this.completedResults = [];
    }

    get isComplete() {
        return (
            this.activeResult === null &&
            this.nextCarIndex === this.carIds.length
        );
    }

    startNextRun() {
        if (this.activeResult !== null) {
            throw new Error("The current qualifying run must finish first.");
        }

        if (this.nextCarIndex >= this.carIds.length) {
            throw new Error("Every car has already completed qualifying.");
        }

        const carId = this.carIds[this.nextCarIndex];
        this.nextCarIndex += 1;

        this.activeResult = new QualifyingResult({ carId });

        return this.activeResult;
    }

    recordRoll(spaces) {
        if (this.activeResult === null) {
            throw new Error("There is no active qualifying run.");
        }

        if (this.activeResult.isFinished) {
            throw new Error("The active qualifying run has already finished.");
        }

        // Validate before incrementing the roll count so invalid input
        // cannot accidentally consume one of the car's three rolls.
        if (!Number.isInteger(spaces) || spaces < 0) {
            throw new Error("Roll distance must be a nonnegative integer.");
        }

        this.activeResult.completeRoll();
        this.activeResult.recordDistance(spaces);

        // A normal qualifying run ends automatically after its third roll.
        if (this.activeResult.rollsCompleted === 3) {
            this.activeResult.finish("three-rolls");
            this.completedResults.push(this.activeResult);
            this.activeResult = null;
        }

        return this.activeResult;
    }

    finishCurrentRun(reason) {
        if (this.activeResult === null) {
            throw new Error("There is no active qualifying run.");
        }

        if (reason !== "wreck" && reason !== "mechanical-failure") {
            throw new Error(
                "An early qualifying finish must be a wreck or mechanical failure."
            );
        }

        this.activeResult.finish(reason);
        this.completedResults.push(this.activeResult);
        this.activeResult = null;

        return this.completedResults[this.completedResults.length - 1];
    }

    getResults() {
        if (!this.isComplete) {
            throw new Error(
                "Final qualifying results are unavailable until every car has qualified."
            );
        }

        // Higher distance wins. Equal distances go to the car that
        // qualified earlier, represented by its original list position.
        const qualifyingOrder = new Map(
            this.carIds.map((carId, index) => [carId, index])
        );

        return [...this.completedResults].sort((a, b) => {
            if (a.distance !== b.distance) {
                return b.distance - a.distance;
            }

            return qualifyingOrder.get(a.carId) - qualifyingOrder.get(b.carId);
        });
    }
}

module.exports = { QualifyingSession };
