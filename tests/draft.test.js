
const test = require("node:test");
const assert = require("node:assert/strict");

const { Draft } = require("../src/game/season/draft");

function makePlayers(count = 2) {
    return Array.from({ length: count }, (_, index) => ({
        id: `player-${index + 1}`,
        name: `Player ${index + 1}`
    }));
}

function makeOrderedDraft(count = 2) {
    const players = makePlayers(count);
    const draft = new Draft(players);

    // For these tests, assume the initial dice rolls have already
    // established the players' order.
    draft.setOrder(players.map((player) => player.id));

    return draft;
}

test("a draft begins waiting for the initial order", () => {
    const draft = new Draft(makePlayers(2));

    assert.equal(draft.status, "waiting-for-order");
    assert.deepEqual(draft.order, []);
});

test("a draft requires between 2 and 4 players", () => {
    assert.throws(
        () => new Draft(makePlayers(1)),
        /between 2 and 4 players/
    );

    assert.throws(
        () => new Draft(makePlayers(5)),
        /between 2 and 4 players/
    );
});

test("draft player IDs must be unique", () => {
    assert.throws(
        () => new Draft([
            { id: "player-1" },
            { id: "player-1" }
        ]),
        /unique/
    );
});

test("the initial order must include every player exactly once", () => {
    const draft = new Draft(makePlayers(3));

    assert.throws(
        () => draft.setOrder(["player-1", "player-2"]),
        /every player exactly once/
    );

    assert.throws(
        () => draft.setOrder(["player-1", "player-1", "player-3"]),
        /duplicate/
    );

    assert.throws(
        () => draft.setOrder(["player-1", "player-2", "unknown-player"]),
        /unknown player/
    );
});

test("the draft cannot calculate picks before the order is set", () => {
    const draft = new Draft(makePlayers(2));

    assert.throws(
        () => draft.getPlayerForPick(1),
        /order has not been established/
    );
});

test("two players alternate forward and backward in the snake draft", () => {
    const draft = makeOrderedDraft(2);

    const picks = Array.from({ length: 8 }, (_, index) =>
        draft.getPlayerForPick(index + 1)
    );

    assert.deepEqual(picks, [
        "player-1", "player-2",
        "player-2", "player-1",
        "player-1", "player-2",
        "player-2", "player-1"
    ]);
});

test("three players follow the snake pattern", () => {
    const draft = makeOrderedDraft(3);

    const picks = Array.from({ length: 9 }, (_, index) =>
        draft.getPlayerForPick(index + 1)
    );

    assert.deepEqual(picks, [
        "player-1", "player-2", "player-3",
        "player-3", "player-2", "player-1",
        "player-1", "player-2", "player-3"
    ]);
});

test("four players follow the snake pattern", () => {
    const draft = makeOrderedDraft(4);

    const picks = Array.from({ length: 12 }, (_, index) =>
        draft.getPlayerForPick(index + 1)
    );

    assert.deepEqual(picks, [
        "player-1", "player-2", "player-3", "player-4",
        "player-4", "player-3", "player-2", "player-1",
        "player-1", "player-2", "player-3", "player-4"
    ]);
});

test("pick numbers must be positive whole numbers", () => {
    const draft = makeOrderedDraft(2);

    assert.throws(() => draft.getPlayerForPick(0), /positive integer/);
    assert.throws(() => draft.getPlayerForPick(-1), /positive integer/);
    assert.throws(() => draft.getPlayerForPick(1.5), /positive integer/);
});
