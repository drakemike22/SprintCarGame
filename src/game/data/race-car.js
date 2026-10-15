
/*
 * Race Car Model
 * --------------
 * Stores a car's temporary information for one race.
 *
 * The permanent Car model remains unchanged.
 */

const { CAR_STATUSES } = require("../rules/car-status");

class RaceCar {
    constructor({ carId, startingPosition }) {
        if (typeof carId !== "string" || carId.trim() === "") {
            throw new Error("Race car ID must be a non-empty string.");
        }

        if (
            !startingPosition ||
            !Number.isInteger(startingPosition.section) ||
            startingPosition.section < 0 ||
            startingPosition.section > 29 ||
            !Number.isInteger(startingPosition.lane) ||
            startingPosition.lane < 0 ||
            startingPosition.lane > 3
        ) {
            throw new Error("A valid starting position is required.");
        }

        this.carId = carId.trim();

        this.position = {
            section: startingPosition.section,
            lane: startingPosition.lane
        };

        this.completedLaps = 0;
        this.distance = 0;

        this.status = CAR_STATUSES.RUNNING;
        this.mechanicalDamage = "none";
    }
}

module.exports = { RaceCar };
