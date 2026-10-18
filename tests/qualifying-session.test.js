
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    QualifyingSession,
} = require("../src/game/season/qualifying-session");

test("requires a nonempty list of unique car IDs", () => {
    assert.throws(() => new QualifyingSession([]));
    assert.throws(() => new QualifyingSession(["car-1", "car-1"]));
    assert.throws(() => new QualifyingSession(["car-1", ""]));
});

test("starts with no active run and no completed results", () => {
    const session = new QualifyingSession(["car-1", "car-2"]);

    assert.equal(session.activeResult, null);
    assert.equal(session.isComplete, false);
});


test("starts qualifying cars in the supplied order", () => {
    const session = new QualifyingSession(["car-1", "car-2", "car-3"]);

    const first = session.startNextRun();
    assert.equal(first.carId, "car-1");

    session.finishCurrentRun("wreck");

    const second = session.startNextRun();
    assert.equal(second.carId, "car-2");

    session.finishCurrentRun("wreck");

    const third = session.startNextRun();
    assert.equal(third.carId, "car-3");
});


test("does not allow another car to start while a run is unfinished", () => {
    const session = new QualifyingSession(["car-1", "car-2"]);

    session.startNextRun();

    assert.throws(() => session.startNextRun());
});

test("records each roll's distance for the active car", () => {
    const session = new QualifyingSession(["car-1"]);

    const result = session.startNextRun();
    session.recordRoll(5);
    session.recordRoll(7);

    assert.equal(result.rollsCompleted, 2);
    assert.equal(result.distance, 12);
    assert.equal(result.isFinished, false);
});

test("automatically finishes a normal run after three rolls", () => {
    const session = new QualifyingSession(["car-1"]);

    const result = session.startNextRun();

    session.recordRoll(5);
    session.recordRoll(7);
    session.recordRoll(4);

    assert.equal(result.rollsCompleted, 3);
    assert.equal(result.distance, 16);
    assert.equal(result.isFinished, true);
    assert.equal(result.finishReason, "three-rolls");
    assert.equal(session.activeResult, null);
});

test("rejects invalid roll distances", () => {
    const session = new QualifyingSession(["car-1"]);

    session.startNextRun();

    assert.throws(() => session.recordRoll(-1));
    assert.throws(() => session.recordRoll(1.5));
});

test("allows a qualifying run to end early after a wreck", () => {
    const session = new QualifyingSession(["car-1", "car-2"]);

    const result = session.startNextRun();
    session.recordRoll(8);
    session.finishCurrentRun("wreck");

    assert.equal(result.distance, 8);
    assert.equal(result.isFinished, true);
    assert.equal(result.finishReason, "wreck");
    assert.equal(session.activeResult, null);

    assert.equal(session.startNextRun().carId, "car-2");
});

test("allows a qualifying run to end early after mechanical failure", () => {
    const session = new QualifyingSession(["car-1"]);

    const result = session.startNextRun();
    session.recordRoll(6);
    session.finishCurrentRun("mechanical-failure");

    assert.equal(result.distance, 6);
    assert.equal(result.finishReason, "mechanical-failure");
    assert.equal(session.isComplete, true);
});

test("cannot record a roll or finish an early run when no run is active", () => {
    const session = new QualifyingSession(["car-1"]);

    assert.throws(() => session.recordRoll(5));
    assert.throws(() => session.finishCurrentRun("wreck"));
});

test("cannot complete the session until every car has qualified", () => {
    const session = new QualifyingSession(["car-1", "car-2"]);

    const first = session.startNextRun();
    session.recordRoll(5);
    session.recordRoll(5);
    session.recordRoll(5);

    assert.equal(first.isFinished, true);
    assert.equal(session.isComplete, false);

    const second = session.startNextRun();
    session.recordRoll(4);
    session.recordRoll(4);
    session.recordRoll(4);

    assert.equal(second.isFinished, true);
    assert.equal(session.isComplete, true);
});

test("ranks cars by total distance, breaking ties by qualifying order", () => {
    const session = new QualifyingSession(["car-1", "car-2", "car-3"]);

    // Car 1 qualifies first and scores 20.
    session.startNextRun();
    session.recordRoll(7);
    session.recordRoll(7);
    session.recordRoll(6);

    // Car 2 qualifies second and ties Car 1 at 20.
    session.startNextRun();
    session.recordRoll(8);
    session.recordRoll(6);
    session.recordRoll(6);

    // Car 3 qualifies third and scores 21, so it wins on distance.
    session.startNextRun();
    session.recordRoll(7);
    session.recordRoll(7);
    session.recordRoll(7);

    const results = session.getResults();

    assert.deepEqual(
        results.map((result) => result.carId),
        ["car-3", "car-1", "car-2"]
    );

    assert.deepEqual(
        results.map((result) => result.distance),
        [21, 20, 20]
    );
});

test("does not return final results before every car has qualified", () => {
    const session = new QualifyingSession(["car-1", "car-2"]);

    session.startNextRun();
    session.recordRoll(5);
    session.recordRoll(5);
    session.recordRoll(5);

    assert.throws(() => session.getResults());
});
