
/*
 * Player Model Tests
 * ------------------
 * Verify that player information is stored correctly and that
 * invalid player definitions are rejected.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { Player } = require("../src/game/season/player.js");

test("a valid player stores their ID, name, and color", () => {
    const player = new Player({
        id: "player-1",
        name: "Mike",
        color: "blue"
    });

    assert.equal(player.id, "player-1");
    assert.equal(player.name, "Mike");
    assert.equal(player.color, "blue");
});

test("a player ID is separate from their display name", () => {
    const player = new Player({
        id: "player-1",
        name: "Dad",
        color: "red"
    });

    // The internal ID remains stable regardless of the chosen name.
    assert.equal(player.id, "player-1");
    assert.equal(player.name, "Dad");
});

test("a player cannot have a blank ID", () => {
    assert.throws(
        () => new Player({ id: "", name: "Mike", color: "blue" }),
        /Player ID must be a non-empty string/
    );
});

test("a player cannot have a blank name", () => {
    assert.throws(
        () => new Player({ id: "player-1", name: " ", color: "blue" }),
        /Player name must be a non-empty string/
    );
});

test("a player cannot have a blank color", () => {
    assert.throws(
        () => new Player({ id: "player-1", name: "Mike", color: "" }),
        /Player color must be a non-empty string/
    );
});

test("leading and trailing spaces are removed", () => {
    const player = new Player({
        id: " player-1 ",
        name: " Mike ",
        color: " blue "
    });

    assert.equal(player.id, "player-1");
    assert.equal(player.name, "Mike");
    assert.equal(player.color, "blue");
});
