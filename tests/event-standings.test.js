
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildEventStandings
} = require("../src/game/season/event-standings");

function result(carId, finishingPosition, options = {}) {
    return {
        carId,
        finishingPosition,
        statusAtFinish: "running",
        eligibleToTransfer: options.eligibleToTransfer ?? true,
        transferPosition: options.transferPosition ?? null,
        lapsCompleted: options.lapsCompleted ?? 0,
        trackDistance: options.trackDistance ?? 0
    };
}

function createExampleEvent() {
    const draftedCarIds = Array.from(
        { length: 32 },
        (_, index) => `car-${index + 1}`
    );

    const qualifyingResults = draftedCarIds.map((carId, index) => ({
        carId,
        distance: 100 - index
    }));

    const heatResults = [
        {
            heatNumber: 1,
            results: [
                result("car-1", 1, { transferPosition: 1 }),
                result("car-5", 2),
                result("car-9", 3)
            ]
        },
        {
            heatNumber: 2,
            results: [
                result("car-2", 1, { transferPosition: 1 }),
                result("car-6", 2),
                result("car-10", 3)
            ]
        },
        {
            heatNumber: 3,
            results: [
                result("car-3", 1, { transferPosition: 1 }),
                result("car-7", 2),
                result("car-11", 3)
            ]
        },
        {
            heatNumber: 4,
            results: [
                result("car-4", 1, { transferPosition: 1 }),
                result("car-8", 2),
                result("car-12", 3)
            ]
        }
    ];

    const bMainResults = [
        result("car-13", 1, { transferPosition: 1 }),
        result("car-14", 2, { transferPosition: 2 }),
        result("car-15", 3),
        result("car-16", 4)
    ];

    const aMainResults = Array.from(
        { length: 8 },
        (_, index) =>
            result(`car-${index + 1}`, index + 1)
    );

    // Keep the test fixture simple while ensuring every car is ranked.
    const transferredIds = new Set([
        ...aMainResults.map(item => item.carId),
        "car-13",
        "car-14"
    ]);

    for (const heat of heatResults) {
        heat.results = heat.results.filter(
            item => !transferredIds.has(item.carId)
        );
    }

    return {
        draftedCarIds,
        qualifyingResults,
        heatResults,
        bMainResults,
        aMainResults
    };
}

test("A-main finishers receive the first finishing positions", () => {
    const input = createExampleEvent();

    const standings = buildEventStandings(input);

    assert.deepEqual(
        standings.slice(0, 8).map(item => item.carId),
        input.aMainResults.map(item => item.carId)
    );
});

test("all drafted cars receive one unique finishing position", () => {
    const input = createExampleEvent();

    const standings = buildEventStandings(input);

    assert.equal(standings.length, input.draftedCarIds.length);
    assert.equal(
        new Set(standings.map(item => item.carId)).size,
        input.draftedCarIds.length
    );
    assert.deepEqual(
        standings.map(item => item.finishingPosition),
        input.draftedCarIds.map((_, index) => index + 1)
    );
});

test("cars eliminated in later heats rank ahead of earlier heats", () => {
    const input = createExampleEvent();

    input.heatResults = [
        { heatNumber: 1, results: [result("car-20", 1)] },
        { heatNumber: 2, results: [] },
        { heatNumber: 3, results: [] },
        { heatNumber: 4, results: [result("car-19", 4)] }
    ];

    const standings = buildEventStandings(input);
    const car19 = standings.find(item => item.carId === "car-19");
    const car20 = standings.find(item => item.carId === "car-20");

    assert.ok(car19.finishingPosition < car20.finishingPosition);
});

test("duplicate drafted car IDs are rejected", () => {
    const input = createExampleEvent();
    input.draftedCarIds[1] = input.draftedCarIds[0];

    assert.throws(
        () => buildEventStandings(input),
        /must be unique/
    );
});


test("out-for-event B-main cars rank in the B-main group", () => {
    const input = createExampleEvent();

    input.bMainResults = [
        result("car-13", 1, { transferPosition: 1 }),
        result("car-14", 2, { transferPosition: 2 }),
        result("car-15", 3, { eligibleToTransfer: false }),
        result("car-16", 4)
    ];

    const standings = buildEventStandings(input);
    const car15 = standings.find(item => item.carId === "car-15");
    const car11 = standings.find(item => item.carId === "car-11");

    assert.ok(car15.finishingPosition < car11.finishingPosition);
});

test("out-for-event heat cars rank in their heat group", () => {
    const input = createExampleEvent();

    input.heatResults = [
        {
            heatNumber: 1,
            results: [
                result("car-20", 1, { eligibleToTransfer: false })
            ]
        },
        { heatNumber: 2, results: [] },
        { heatNumber: 3, results: [] },
        { heatNumber: 4, results: [] }
    ];

    const standings = buildEventStandings(input);
    const car20 = standings.find(item => item.carId === "car-20");
    const car21 = standings.find(item => item.carId === "car-21");

    assert.ok(car20.finishingPosition < car21.finishingPosition);
});

test("missing qualifying results are rejected", () => {
    const input = createExampleEvent();

    input.qualifyingResults = input.qualifyingResults.filter(
        item => item.carId !== "car-32"
    );

    assert.throws(
        () => buildEventStandings(input),
        /missing drafted car "car-32"/
    );
});

test("duplicate qualifying results are rejected", () => {
    const input = createExampleEvent();
    input.qualifyingResults.push({
        ...input.qualifyingResults[0]
    });

    assert.throws(
        () => buildEventStandings(input),
        /duplicate qualifying results/
    );
});
