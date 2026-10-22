
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    ROUND_STATUS,
    createTurnRound,
    getCurrentTurnCarId,
    completeCurrentTurn,
    skipCurrentTurn,
    endTurnRoundForYellow
} = require("../src/game/rules/turn-round");

const { CAR_STATUSES } = require("../src/game/rules/car-status");

function makeCar(carId, section, lane = 2, status = CAR_STATUSES.RUNNING) {
    return {
        carId,
        position: { section, lane },
        completedLaps: 0,
        status
    };
}

test("rejects non-array race cars when an explicit order is supplied", () => {
    assert.throws(
        () => createTurnRound(null, ["car-a"]),
        /Race cars must be provided as an array/
    );
});

test("rejects a non-array explicit turn order with a clear error", () => {
    assert.throws(
        () => createTurnRound([makeCar("car-a", 5)], "car-a"),
        /Turn order must be provided as an array/
    );
});

test("does not allow an explicit order to bypass duplicate car ID validation", () => {
    const cars = [
        makeCar("car-a", 5),
        makeCar("car-a", 10)
    ];

    assert.throws(
        () => createTurnRound(cars, ["car-a"]),
        /Duplicate race car ID/
    );
});

test("does not allow an explicit order to bypass occupied position validation", () => {
    const cars = [
        makeCar("car-a", 5, 2),
        makeCar("car-b", 5, 2)
    ];

    assert.throws(
        () => createTurnRound(cars, ["car-a", "car-b"]),
        /same track position/
    );
});

test("creates a round in race-running order", () => {
    const cars = [
        makeCar("car-a", 5),
        makeCar("car-b", 20),
        makeCar("car-c", 12)
    ];

    const round = createTurnRound(cars);

    assert.deepEqual(round.order, ["car-b", "car-c", "car-a"]);
    assert.equal(round.status, ROUND_STATUS.IN_PROGRESS);
    assert.equal(round.currentIndex, 0);
});

test("starts with the first car in the round order", () => {
    const round = createTurnRound([
        makeCar("car-a", 5),
        makeCar("car-b", 20)
    ]);

    assert.equal(getCurrentTurnCarId(round), "car-b");
});

test("advances after a car completes its turn", () => {
    const round = createTurnRound([
        makeCar("car-a", 5),
        makeCar("car-b", 20),
        makeCar("car-c", 12)
    ]);

    completeCurrentTurn(round, "car-b");

    assert.equal(getCurrentTurnCarId(round), "car-c");
    assert.deepEqual(round.completedCarIds, ["car-b"]);
});

test("keeps the original order for the entire round", () => {
    const round = createTurnRound([
        makeCar("car-a", 5),
        makeCar("car-b", 20),
        makeCar("car-c", 12)
    ]);

    completeCurrentTurn(round, "car-b");

    // Positions changing during the round do not reorder its snapshot.
    assert.equal(getCurrentTurnCarId(round), "car-c");
    assert.deepEqual(round.order, ["car-b", "car-c", "car-a"]);
});

test("rejects a turn completed by the wrong car", () => {
    const round = createTurnRound([
        makeCar("car-a", 5),
        makeCar("car-b", 20)
    ]);

    assert.throws(
        () => completeCurrentTurn(round, "car-a"),
        /Expected car car-b/
    );

    assert.equal(round.currentIndex, 0);
});

test("allows a car to be skipped when it cannot take its turn", () => {
    const round = createTurnRound([
        makeCar("car-a", 5),
        makeCar("car-b", 20),
        makeCar("car-c", 12)
    ]);

    skipCurrentTurn(round, "car-b");

    assert.deepEqual(round.skippedCarIds, ["car-b"]);
    assert.equal(getCurrentTurnCarId(round), "car-c");
});

test("marks the round completed after every car is handled", () => {
    const round = createTurnRound([
        makeCar("car-a", 5),
        makeCar("car-b", 20)
    ]);

    completeCurrentTurn(round, "car-b");
    completeCurrentTurn(round, "car-a");

    assert.equal(round.status, ROUND_STATUS.COMPLETED);
    assert.equal(getCurrentTurnCarId(round), null);
});

test("ends a round immediately when a yellow flag occurs", () => {
    const round = createTurnRound([
        makeCar("car-a", 5),
        makeCar("car-b", 20),
        makeCar("car-c", 12)
    ]);

    completeCurrentTurn(round, "car-b");
    endTurnRoundForYellow(round);

    assert.equal(round.status, ROUND_STATUS.ENDED_BY_YELLOW);
    assert.equal(round.endedBy, "yellow-flag");
    assert.equal(getCurrentTurnCarId(round), null);
    assert.deepEqual(round.completedCarIds, ["car-b"]);
});

test("does not allow turns to continue after a yellow flag", () => {
    const round = createTurnRound([
        makeCar("car-a", 5),
        makeCar("car-b", 20)
    ]);

    endTurnRoundForYellow(round);

    assert.throws(
        () => completeCurrentTurn(round, "car-b"),
        /round is not in progress/
    );
});

test("creates a completed round when no cars are running", () => {
    const round = createTurnRound([
        makeCar("car-a", 5, 2, CAR_STATUSES.OUT_FOR_RACE),
        makeCar("car-b", 20, 2, CAR_STATUSES.OUT_FOR_EVENT)
    ]);

    assert.deepEqual(round.order, []);
    assert.equal(round.status, ROUND_STATUS.COMPLETED);
    assert.equal(getCurrentTurnCarId(round), null);
});

test("rejects skipping or completing a turn after the round ends", () => {
    const round = createTurnRound([makeCar("car-a", 5)]);

    completeCurrentTurn(round, "car-a");

    assert.throws(
        () => skipCurrentTurn(round, "car-a"),
        /round is not in progress/
    );
});

test("rejects ending a completed round for a yellow flag", () => {
    const round = createTurnRound([makeCar("car-a", 5)]);

    completeCurrentTurn(round, "car-a");

    assert.throws(
        () => endTurnRoundForYellow(round),
        /Only an active round/
    );
});
