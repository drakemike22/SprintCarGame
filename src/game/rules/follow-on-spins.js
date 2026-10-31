/*
 * Follow-on Spin Eligibility
 * --------------------------
 * Determines which cars are close enough to be collected by a wreck.
 * Distances are measured in track spaces using completed laps + section.
 */

const { CAR_STATUSES } = require("./car-status");

function getEligibleFollowOnCars({
    order,
    currentIndex,
    followOnSpins,
    raceCars,
    wreckProgress
}) {
    if (!Array.isArray(order) || !Number.isInteger(currentIndex) ||
        !Array.isArray(followOnSpins) || !Array.isArray(raceCars) ||
        !Number.isInteger(wreckProgress)) {
        throw new Error("Valid race order, follow-on rules, cars, and wreck progress are required.");
    }

    const requestedDistances = followOnSpins
        .map(entry => entry?.carsBehind)
        .filter(value => Number.isInteger(value) && value > 0)
        .sort((a, b) => a - b);
    const isSecondAndThirdResult =
        requestedDistances.length === 2 &&
        requestedDistances[0] === 2 &&
        requestedDistances[1] === 3;

    const eligible = [];
    let previousCaughtProgress = wreckProgress;
    let previousCaught = true;

    for (const carsBehind of requestedDistances) {
        const carId = order[currentIndex + carsBehind];
        if (!carId || !previousCaught) {
            previousCaught = false;
            continue;
        }

        const raceCar = raceCars.find(car => car.carId === carId);
        if (!raceCar || raceCar.status !== CAR_STATUSES.RUNNING) {
            previousCaught = false;
            continue;
        }

        const progress = raceCar.completedLaps * 30 + raceCar.position.section;
        const gap = previousCaughtProgress - progress;
        const maxGap = isSecondAndThirdResult && carsBehind === 2 ? 10 : 6;

        if (gap < 0 || gap > maxGap) {
            previousCaught = false;
            continue;
        }

        eligible.push({ carId, carsBehind });
        previousCaughtProgress = progress;
        previousCaught = true;
    }

    return eligible;
}

module.exports = { getEligibleFollowOnCars };
