
const test = require("node:test");
const assert = require("node:assert/strict");

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
