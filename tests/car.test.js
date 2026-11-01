
/*
 * Car Model Tests
 * ---------------
 * These tests verify that the Car class stores valid data and
 * rejects invalid data before it enters the game.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { Car } = require("../src/game/data/car.js");

// Sample permanent car definition: Cody McAllister.
const ricoAbreuData = {
    id: "rico-abreu",
    driverName: "Cody McAllister",
    number: "24",
    autoMovement: 8,
    bonusMovement: 4
};

test("a valid car stores all permanent information", () => {
    const car = new Car(ricoAbreuData);

    assert.equal(car.id, "rico-abreu");
    assert.equal(car.driverName, "Cody McAllister");
    assert.equal(car.number, "24");
    assert.equal(car.autoMovement, 8);
    assert.equal(car.bonusMovement, 4);
});

test("car numbers remain strings", () => {
    const car = new Car({
        ...ricoAbreuData,
        number: "7BC"
    });

    assert.equal(car.number, "7BC");
    assert.equal(typeof car.number, "string");
});

test("a car cannot have a blank ID", () => {
    assert.throws(
        () => new Car({ ...ricoAbreuData, id: "" }),
        /Car ID must be a non-empty string/
    );
});

test("a car cannot have a blank driver name", () => {
    assert.throws(
        () => new Car({ ...ricoAbreuData, driverName: " " }),
        /Driver name must be a non-empty string/
    );
});

test("a car cannot have a blank car number", () => {
    assert.throws(
        () => new Car({ ...ricoAbreuData, number: "" }),
        /Car number must be a non-empty string/
    );
});

test("automatic movement cannot be negative", () => {
    assert.throws(
        () => new Car({ ...ricoAbreuData, autoMovement: -1 }),
        /Automatic movement must be a non-negative integer/
    );
});

test("bonus movement must be a whole number", () => {
    assert.throws(
        () => new Car({ ...ricoAbreuData, bonusMovement: 2.5 }),
        /Bonus movement must be a non-negative integer/
    );
});
