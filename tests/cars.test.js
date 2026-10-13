
/*
 * Permanent Roster Tests
 * ----------------------
 * These tests protect the roster from missing cars, duplicate IDs,
 * duplicate car numbers, and invalid movement stats.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { cars } = require("../src/game/data/cars.js");

test("the roster contains exactly 32 cars", () => {
    assert.equal(cars.length, 32);
});

test("every car has a unique permanent ID", () => {
    const ids = cars.map((car) => car.id);
    assert.equal(new Set(ids).size, cars.length);
});

test("every car has a unique car number", () => {
    const numbers = cars.map((car) => car.number);
    assert.equal(new Set(numbers).size, cars.length);
});

test("every car has a valid name, number, and movement stats", () => {
    for (const car of cars) {
        assert.ok(car.driverName.trim().length > 0);
        assert.ok(car.number.trim().length > 0);
        assert.ok(Number.isInteger(car.autoMovement));
        assert.ok(car.autoMovement >= 0);
        assert.ok(Number.isInteger(car.bonusMovement));
        assert.ok(car.bonusMovement >= 0);
    }
});

test("Rico Abreu has the expected permanent stats", () => {
    const rico = cars.find((car) => car.id === "rico-abreu");

    assert.ok(rico);
    assert.equal(rico.driverName, "Rico Abreu");
    assert.equal(rico.number, "24");
    assert.equal(rico.autoMovement, 8);
    assert.equal(rico.bonusMovement, 4);
});

test("alphanumeric car numbers are preserved", () => {
    const tyler = cars.find((car) => car.id === "tyler-courtney");
    const kerry = cars.find((car) => car.id === "kerry-madsen");

    assert.equal(tyler.number, "7BC");
    assert.equal(kerry.number, "17GP");
});
