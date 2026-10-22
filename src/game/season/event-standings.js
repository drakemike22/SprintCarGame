
/*
 * Event Standings
 * ---------------
 * Builds the final ranking for every drafted car in one event.
 *
 * Ranking rules:
 * 1. A-main finishers rank in official finishing order.
 * 2. B-main non-transfers rank next, in B-main finishing order.
 * 3. Heat eliminations rank next:
 *    - Later heats rank ahead of earlier heats.
 *    - Better heat finishing position ranks ahead.
 *    - More completed laps breaks ties.
 *    - Greater track distance breaks remaining ties.
 * 4. Qualifying eliminations rank last, by qualifying distance,
 *    with original qualifying order breaking ties.
 *
 * A car that is out for the event cannot transfer to another race,
 * but it must still be ranked according to the stage where it was
 * eliminated. Its status must not push it into the wrong group.
 *
 * This module calculates standings only. It does not award points
 * or modify the Season object.
 */


/*
 * Validate the result records for one race.
 *
 * A car may legitimately appear in different stages of the same
 * event, such as a heat and the A Main. Within one individual race,
 * however, each car and each finishing position must be unique.
 *
 * We validate the finishing positions but do not sort the results:
 * the supplied array remains the official finishing order.
 */
function validateRaceResults(results, description, draftedIds) {
    if (!Array.isArray(results)) {
        throw new Error(`${description} must be an array.`);
    }

    const seenCarIds = new Set();
    const seenFinishingPositions = new Set();

    for (const result of results) {
        if (
            !result ||
            typeof result !== "object" ||
            Array.isArray(result)
        ) {
            throw new Error(
                `${description} contain an invalid result record.`
            );
        }

        if (
            typeof result.carId !== "string" ||
            result.carId.trim() === ""
        ) {
            throw new Error(
                `${description} contain an invalid car ID.`
            );
        }

        if (!draftedIds.has(result.carId)) {
            throw new Error(
                `${description} contain car "${result.carId}" that was not drafted.`
            );
        }

        if (seenCarIds.has(result.carId)) {
            throw new Error(
                `${description} contain duplicate results for car "${result.carId}".`
            );
        }

        if (
            !Number.isInteger(result.finishingPosition) ||
            result.finishingPosition < 1
        ) {
            throw new Error(
                `${description} finishing position for car "${result.carId}" must be a positive integer.`
            );
        }

        if (seenFinishingPositions.has(result.finishingPosition)) {
            throw new Error(
                `${description} contain duplicate finishing position ${result.finishingPosition}.`
            );
        }

        seenCarIds.add(result.carId);
        seenFinishingPositions.add(result.finishingPosition);
    }

    return results;
}


/*
 * Race progress may be absent in older result records. Use zero only
 * for these tie-breakers; qualifying distance is validated separately.
 */
function getProgress(result) {
    return {
        lapsCompleted: Number.isInteger(result.lapsCompleted)
            ? result.lapsCompleted
            : 0,
        trackDistance: Number.isInteger(result.trackDistance)
            ? result.trackDistance
            : 0
    };
}

/*
 * Every B-main car that did not appear in the A-main ranks here.
 *
 * Do not filter by eligibleToTransfer. A car that went out for the
 * event during the B-main still belongs in the B-main ranking group.
 */
function getBMainNonTransfers(bMainResults, aMainIds) {
    return bMainResults
        .filter(result => !aMainIds.has(result.carId))
        .map(result => ({
            carId: result.carId,
            stage: "b-main",
            finishingPosition: result.finishingPosition,
            ...getProgress(result)
        }));
}

/*
 * Find heat cars that did not transfer and have not already been
 * ranked in the A-main or B-main.
 *
 * This includes cars that went out for the event during a heat.
 * Their elimination stage still determines their ranking group.
 */
function getHeatEliminations(heatResults, alreadyRankedIds) {
    const eliminated = [];

    for (const heat of heatResults) {
        for (const result of heat.results) {
            if (
                result.transferPosition == null &&
                !alreadyRankedIds.has(result.carId)
            ) {
                eliminated.push({
                    carId: result.carId,
                    stage: "heat",
                    heatNumber: heat.heatNumber,
                    finishingPosition: result.finishingPosition,
                    ...getProgress(result)
                });
            }
        }
    }

    return eliminated;
}

/*
 * Validate qualifying data before using it as the final fallback.
 * Every drafted car must have exactly one qualifying result with a
 * valid nonnegative distance. Missing results must never be invented.
 */
function buildQualifyingOrder(qualifyingResults, draftedIds) {
    const qualifyingOrder = new Map();

    qualifyingResults.forEach((result, index) => {
        if (!result || typeof result.carId !== "string" ||
            result.carId.trim() === "") {
            throw new Error("Qualifying results contain an invalid car ID.");
        }

        if (!draftedIds.has(result.carId)) {
            throw new Error(
                `Qualifying car "${result.carId}" was not drafted.`
            );
        }

        if (qualifyingOrder.has(result.carId)) {
            throw new Error(
                `Car "${result.carId}" has duplicate qualifying results.`
            );
        }

        if (!Number.isInteger(result.distance) || result.distance < 0) {
            throw new Error(
                `Qualifying distance for car "${result.carId}" must be a nonnegative integer.`
            );
        }

        qualifyingOrder.set(result.carId, {
            index,
            distance: result.distance
        });
    });

    for (const carId of draftedIds) {
        if (!qualifyingOrder.has(carId)) {
            throw new Error(
                `Qualifying results are missing drafted car "${carId}".`
            );
        }
    }

    return qualifyingOrder;
}

/*
 * Build a complete event ranking.
 *
 * Expected input:
 * {
 *   draftedCarIds: ["car-1", ...],
 *   qualifyingResults: [{ carId, distance }, ...],
 *   heatResults: [{ heatNumber, results: [...] }, ...],
 *   bMainResults: [...],
 *   aMainResults: [...]
 * }
 */
function buildEventStandings({
    draftedCarIds,
    qualifyingResults,
    heatResults,
    bMainResults,
    aMainResults
}) {
    if (!Array.isArray(draftedCarIds) || draftedCarIds.length === 0) {
        throw new Error("Drafted car IDs must be a nonempty array.");
    }

    if (draftedCarIds.some(
        carId => typeof carId !== "string" || carId.trim() === ""
    )) {
        throw new Error("Drafted car IDs must be nonempty strings.");
    }

    if (new Set(draftedCarIds).size !== draftedCarIds.length) {
        throw new Error("Drafted car IDs must be unique.");
    }

    // Qualifying has its own validation for distance and qualifying order.
    if (!Array.isArray(qualifyingResults)) {
        throw new Error("Qualifying results must be an array.");
    }

    if (!Array.isArray(heatResults)) {
        throw new Error("Heat results must be an array.");
    }

    const draftedIds = new Set(draftedCarIds);

    // Validate every main race before using its results for standings.
    validateRaceResults(bMainResults, "B-main results", draftedIds);
    validateRaceResults(aMainResults, "A-main results", draftedIds);

    
    // The event has exactly four heats, numbered 1 through 4.
    // Checking only the array length would allow duplicate heat numbers
    // to silently omit a heat and distort the elimination rankings.
    if (heatResults.length !== 4) {
        throw new Error("Exactly four heat results are required.");
    }

    const heatNumbers = new Set();

    for (const heat of heatResults) {
        if (
            !heat ||
            !Number.isInteger(heat.heatNumber) ||
            !Array.isArray(heat.results)
        ) {
            throw new Error(
                "Each heat must have a heat number and a results array."
            );
        }
        validateRaceResults(
            heat.results,
            `Heat ${heat.heatNumber} results`,
            draftedIds
        );

        heatNumbers.add(heat.heatNumber);
    }

    // Four entries are valid only when all four official heat numbers
    // are present. This rejects duplicates, missing numbers, and
    // unexpected numbers such as 0 or 5.
    const expectedHeatNumbers = [1, 2, 3, 4];

    if (
        !expectedHeatNumbers.every(heatNumber =>
            heatNumbers.has(heatNumber)
        )
    ) {
        throw new Error(
            "Heat results must contain four distinct heats numbered 1 through 4."
        );
    }
    const qualifyingOrder = buildQualifyingOrder(
        qualifyingResults,
        draftedIds
    );

    const rankedIds = new Set();
    const orderedCarIds = [];

    function addCar(carId) {
        if (!draftedIds.has(carId)) {
            throw new Error(`Car "${carId}" was not drafted.`);
        }

        if (rankedIds.has(carId)) {
            throw new Error(
                `Car "${carId}" appears more than once in event results.`
            );
        }

        rankedIds.add(carId);
        orderedCarIds.push(carId);
    }

    // A-main finishers occupy the first available positions.
    for (const result of aMainResults) {
        addCar(result.carId);
    }

    const aMainIds = new Set(
        aMainResults.map(result => result.carId)
    );

    // Rank every B-main non-transfer in its official B-main order.
    const bMainNonTransfers = getBMainNonTransfers(
        bMainResults,
        aMainIds
    );

    for (const result of bMainNonTransfers) {
        addCar(result.carId);
    }

    // Rank remaining heat eliminations using the official tie-breakers.
    const heatEliminations = getHeatEliminations(
        heatResults,
        rankedIds
    );

    heatEliminations.sort((a, b) =>
        b.heatNumber - a.heatNumber ||
        a.finishingPosition - b.finishingPosition ||
        b.lapsCompleted - a.lapsCompleted ||
        b.trackDistance - a.trackDistance
    );

    for (const result of heatEliminations) {
        addCar(result.carId);
    }

    // Any cars still unranked were eliminated during qualifying.
    // Their distance determines the order; qualifying order breaks ties.
    const qualifyingEliminations = draftedCarIds
        .filter(carId => !rankedIds.has(carId))
        .map(carId => ({
            carId,
            distance: qualifyingOrder.get(carId).distance,
            qualifyingOrder: qualifyingOrder.get(carId).index
        }))
        .sort((a, b) =>
            b.distance - a.distance ||
            a.qualifyingOrder - b.qualifyingOrder
        );

    for (const result of qualifyingEliminations) {
        addCar(result.carId);
    }

    if (orderedCarIds.length !== draftedCarIds.length) {
        throw new Error("Could not rank every drafted car.");
    }

    return orderedCarIds.map((carId, index) => ({
        carId,
        finishingPosition: index + 1
    }));
}

module.exports = {
    buildEventStandings
};
