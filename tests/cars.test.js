
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

test("the first roster car keeps its original number and movement stats with its replacement name", () => {
    const car = cars.find((entry) => entry.id === "rico-abreu");

    assert.ok(car);
    assert.equal(car.driverName, "Cody McAllister");
    assert.equal(car.number, "24");
    assert.equal(car.autoMovement, 8);
    assert.equal(car.bonusMovement, 4);
});


test("the 32-car roster uses the requested replacement driver names in order", () => {
    const expectedNames = [
        "Cody McAllister", "Chase Whitaker", "Jaxon Miller", "Colton Hayes",
        "Brock Sullivan", "Travis McCoy", "Hunter Callahan", "Mason Barrett",
        "Tyler Granger", "Logan Pierce", "Wyatt Dawson", "Cooper Bennett",
        "Blake Harrison", "Austin McKinley", "Garrett Lawson", "Tucker Reynolds",
        "Dalton Cross", "Riley Thompson", "Kaden Fletcher", "Brady Coleman",
        "Carson Mitchell", "Levi Jackson", "Weston Parker", "Cole Maddox",
        "Drew Anderson", "Tanner Brooks", "Landon Price", "Jesse Walker",
        "Brett Holloway", "Devin Marshall", "Austin Keller", "Shane Whitmore"
    ];

    assert.deepEqual(cars.map((car) => car.driverName), expectedNames);
});

test("alphanumeric car numbers are preserved", () => {
    const tyler = cars.find((car) => car.id === "tyler-courtney");
    const kerry = cars.find((car) => car.id === "kerry-madsen");

    assert.equal(tyler.number, "7BC");
    assert.equal(kerry.number, "17GP");
});
