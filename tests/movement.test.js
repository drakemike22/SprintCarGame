
const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateLaneChange } = require("../src/game/rules/movement");

const { calculateMovement } = require("../src/game/rules/movement");

const car = {
    autoMovement: 8,
    bonusMovement: 2
};

test("movement equals automatic movement plus the movement die", () => {
    assert.equal(calculateMovement(car, 4, 5), 12);
});

test("matching dice add bonus movement", () => {
    assert.equal(calculateMovement(car, 4, 4), 14);
});

test("a bonus of zero adds no extra movement", () => {
    const carWithoutBonus = {
        autoMovement: 8,
        bonusMovement: 0
    };

    assert.equal(calculateMovement(carWithoutBonus, 4, 4), 12);
});

test("the minimum valid die results are accepted", () => {
    assert.equal(calculateMovement(car, 1, 2), 9);
});

test("the maximum valid die results are accepted", () => {
    assert.equal(calculateMovement(car, 6, 6), 16);
});

test("movement rejects a missing car", () => {
    assert.throws(
        () => calculateMovement(null, 4, 5),
        /valid car is required/i
    );
});

test("movement rejects negative automatic movement", () => {
    assert.throws(
        () => calculateMovement(
            { autoMovement: -1, bonusMovement: 2 },
            4,
            5
        ),
        /movement statistics/i
    );
});

test("movement rejects a fractional bonus", () => {
    assert.throws(
        () => calculateMovement(
            { autoMovement: 8, bonusMovement: 1.5 },
            4,
            5
        ),
        /movement statistics/i
    );
});

test("movement rejects a missing movement statistic", () => {
    assert.throws(
        () => calculateMovement(
            { autoMovement: 8 },
            4,
            5
        ),
        /movement statistics/i
    );
});

test("movement rejects a die result below one", () => {
    assert.throws(
        () => calculateMovement(car, 0, 4),
        /dice must be whole numbers from 1 through 6/i
    );
});

test("movement rejects a die result above six", () => {
    assert.throws(
        () => calculateMovement(car, 7, 4),
        /dice must be whole numbers from 1 through 6/i
    );
});

test("movement rejects fractional die results", () => {
    assert.throws(
        () => calculateMovement(car, 2.5, 4),
        /dice must be whole numbers from 1 through 6/i
    );
});

test("movement rejects a missing die result", () => {
    assert.throws(
        () => calculateMovement(car, undefined, 4),
        /dice must be whole numbers from 1 through 6/i
    );
});
test("lane-change die 1 changes zero lanes", () => {
    assert.equal(calculateLaneChange(1), 0);
});

test("lane-change die 2 changes one lane", () => {
    assert.equal(calculateLaneChange(2), 1);
});

test("lane-change die 3 changes two lanes", () => {
    assert.equal(calculateLaneChange(3), 2);
});

test("lane-change die 4 changes two lanes", () => {
    assert.equal(calculateLaneChange(4), 2);
});

test("lane-change die 5 changes three lanes", () => {
    assert.equal(calculateLaneChange(5), 3);
});

test("lane-change die 6 changes four lanes", () => {
    assert.equal(calculateLaneChange(6), 4);
});

test("lane-change rejects a die result below one", () => {
    assert.throws(
        () => calculateLaneChange(0),
        /lane-change die must be a whole number from 1 through 6/i
    );
});

test("lane-change rejects a die result above six", () => {
    assert.throws(
        () => calculateLaneChange(7),
        /lane-change die must be a whole number from 1 through 6/i
    );
});

test("lane-change rejects fractional die results", () => {
    assert.throws(
        () => calculateLaneChange(2.5),
        /lane-change die must be a whole number from 1 through 6/i
    );
});

test("lane-change rejects a missing die result", () => {
    assert.throws(
        () => calculateLaneChange(undefined),
        /lane-change die must be a whole number from 1 through 6/i
    );
});