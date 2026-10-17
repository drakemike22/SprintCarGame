
const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveWreckWheel } = require("../src/game/rules/wreck-wheel");
const {
    findOpenBackwardDestination,
    moveBackward
} = require("../src/game/track/backward-movement");
const { resolveWreck } = require("../src/game/rules/resolve-wreck");

const baseRaceCar = {
    carId: "car-1",
    position: { section: 10, lane: 2 },
    completedLaps: 1,
    distance: 40,
    status: "running",
    mechanicalDamage: "none"
};

test("all ten wreck-wheel slots return their defined outcomes", () => {
    const expected = [
        ["close-call", "none", false, []],
        ["bicycle", "backward-3", false, []],
        ["bicycle-big", "backward-3", false, [1]],
        ["hit-wall-hard", "out-for-race", true, []],
        ["spin-out", "go-to-back", true, []],
        ["spin-out-big", "none", true, [2, 3]],
        ["flip", "out-for-race", true, []],
        ["flip-hard", "out-for-event", true, []],
        ["flip-big", "out-for-event", true, [1, 2, 3]],
        ["climb-wall", "go-to-back", true, [1]]
    ];

    expected.forEach(([type, consequence, yellowFlag, followOnSpins], index) => {
        const result = resolveWreckWheel(index + 1);

        assert.equal(result.slot, index + 1);
        assert.equal(result.type, type);
        assert.equal(result.consequence, consequence);
        assert.equal(result.yellowFlag, yellowFlag);
        assert.deepEqual(result.followOnSpins, followOnSpins);
    });
});

test("wreck wheel rejects slots outside 1 through 10", () => {
    for (const slot of [0, 11, -1, 2.5, "3"]) {
        assert.throws(() => resolveWreckWheel(slot), /Wreck wheel slot/);
    }
});

test("backward movement moves three sections", () => {
    const result = moveBackward({
        currentPosition: { section: 10, lane: 2 },
        spaces: 3,
        completedLaps: 1
    });

    assert.deepEqual(result.position, { section: 7, lane: 2 });
    assert.equal(result.spacesMoved, 3);
    assert.equal(result.completedLaps, 1);
    assert.equal(result.lapsLost, 0);
});

test("backward movement wraps section zero to section 29", () => {
    const result = moveBackward({
        currentPosition: { section: 1, lane: 2 },
        spaces: 3,
        completedLaps: 1
    });

    assert.deepEqual(result.position, { section: 28, lane: 2 });
    assert.equal(result.backwardLapCrossings, 1);
    assert.equal(result.lapsLost, 1);
    assert.equal(result.completedLaps, 0);
});

test("backward movement does not reduce completed laps below zero", () => {
    const result = moveBackward({
        currentPosition: { section: 1, lane: 2 },
        spaces: 3,
        completedLaps: 0
    });

    assert.equal(result.completedLaps, 0);
    assert.equal(result.backwardLapCrossings, 1);
    assert.equal(result.lapsLost, 0);
});

test("backward movement searches toward lane 3 before lane 0", () => {
    const result = findOpenBackwardDestination(
        { section: 7, lane: 2 },
        [
            { section: 7, lane: 2 },
            { section: 7, lane: 3 }
        ]
    );

    assert.deepEqual(result, { section: 7, lane: 1 });
});

test("backward movement chooses lane 3 when the original lane is blocked", () => {
    const result = findOpenBackwardDestination(
        { section: 7, lane: 1 },
        [
            { section: 7, lane: 1 }
        ]
    );

    assert.deepEqual(result, { section: 7, lane: 2 });
});

test("backward movement rejects a destination with all lanes occupied", () => {
    assert.throws(
        () => findOpenBackwardDestination(
            { section: 7, lane: 1 },
            [0, 1, 2, 3].map(lane => ({ section: 7, lane }))
        ),
        /No open lane/
    );
});

test("bicycle moves the triggering car backward without mutating the original", () => {
    const result = resolveWreck({
        raceCar: baseRaceCar,
        slot: 2
    });

    assert.deepEqual(result.raceCar.position, { section: 7, lane: 2 });
    assert.equal(result.raceCar.status, "running");
    assert.equal(result.yellowFlag, false);
    assert.equal(result.goToBack, false);

    // The caller's original race-car object remains unchanged.
    assert.deepEqual(baseRaceCar.position, { section: 10, lane: 2 });
});

test("hit-wall-hard puts the car out for the race and raises yellow", () => {
    const result = resolveWreck({
        raceCar: baseRaceCar,
        slot: 4
    });

    assert.equal(result.raceCar.status, "out-for-race");
    assert.equal(result.yellowFlag, true);
});

test("flip-hard puts the car out for the event", () => {
    const result = resolveWreck({
        raceCar: baseRaceCar,
        slot: 8
    });

    assert.equal(result.raceCar.status, "out-for-event");
    assert.equal(result.yellowFlag, true);
});

test("spin-out reports that the car must go to the back", () => {
    const result = resolveWreck({
        raceCar: baseRaceCar,
        slot: 5
    });

    assert.equal(result.goToBack, true);
    assert.equal(result.yellowFlag, true);
    assert.equal(result.raceCar.status, "running");
});

test("bicycle-big reports one follow-on spin without raising yellow", () => {
    const result = resolveWreck({
        raceCar: baseRaceCar,
        slot: 3
    });

    assert.deepEqual(result.followOnSpins, [{ carsBehind: 1 }]);
    assert.equal(result.yellowFlag, false);
});

test("spin-out-big reports the second and third cars behind", () => {
    const result = resolveWreck({
        raceCar: baseRaceCar,
        slot: 6
    });

    assert.deepEqual(result.followOnSpins, [
        { carsBehind: 2 },
        { carsBehind: 3 }
    ]);
    assert.equal(result.yellowFlag, true);
});

test("backward wreck movement resolves an occupied destination lane", () => {
    const result = resolveWreck({
        raceCar: baseRaceCar,
        slot: 2,
        occupiedPositions: [
            { section: 7, lane: 2 },
            { section: 7, lane: 3 }
        ]
    });

    assert.deepEqual(result.raceCar.position, { section: 7, lane: 1 });
});

test("wreck resolution rejects a missing race car", () => {
    assert.throws(
        () => resolveWreck({ raceCar: null, slot: 1 }),
        /valid race car/
    );
});
