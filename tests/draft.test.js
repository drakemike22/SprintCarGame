
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


test("the highest initial roll gets first pick when there is no tie", () => {
    const players = makePlayers(3);
    const draft = new Draft(players);

    const result = draft.setInitialRolls([2, 6, 4]);

    assert.equal(result.tied, false);
    assert.deepEqual(result.order, [
        "player-2",
        "player-3",
        "player-1"
    ]);
    assert.equal(draft.status, "in-progress");
});

test("only players tied for the highest initial roll must reroll", () => {
    const players = makePlayers(4);
    const draft = new Draft(players);

    const result = draft.setInitialRolls([5, 5, 3, 1]);

    assert.equal(result.tied, true);
    assert.deepEqual(result.tiedPlayerIds, ["player-1", "player-2"]);
    assert.equal(draft.status, "waiting-for-order");
});

test("a reroll resolves a tie and preserves other players' positions", () => {
    const players = makePlayers(4);
    const draft = new Draft(players);

    draft.setInitialRolls([5, 5, 3, 1]);

    const result = draft.rerollTie({
        "player-1": 2,
        "player-2": 6
    });

    assert.equal(result.tied, false);
    assert.deepEqual(result.order, [
        "player-2",
        "player-1",
        "player-3",
        "player-4"
    ]);
});

test("a tie that remains after reroll can be resolved with another reroll", () => {
    const players = makePlayers(3);
    const draft = new Draft(players);

    draft.setInitialRolls([6, 6, 2]);

    const firstReroll = draft.rerollTie({
        "player-1": 4,
        "player-2": 4
    });

    assert.equal(firstReroll.tied, true);
    assert.deepEqual(firstReroll.tiedPlayerIds, [
        "player-1",
        "player-2"
    ]);

    const secondReroll = draft.rerollTie({
        "player-1": 5,
        "player-2": 2
    });

    assert.equal(secondReroll.tied, false);
    assert.deepEqual(secondReroll.order, [
        "player-1",
        "player-2",
        "player-3"
    ]);
});

test("initial dice rolls must be integers from 1 through 6", () => {
    const draft = new Draft(makePlayers(2));

    assert.throws(
        () => draft.setInitialRolls([0, 6]),
        /integer from 1 to 6/
    );

    assert.throws(
        () => draft.setInitialRolls([3, 7]),
        /integer from 1 to 6/
    );

    assert.throws(
        () => draft.setInitialRolls([2.5, 6]),
        /integer from 1 to 6/
    );
});

test("only tied players may supply rerolls", () => {
    const draft = new Draft(makePlayers(3));

    draft.setInitialRolls([6, 6, 2]);

    assert.throws(
        () => draft.rerollTie({
            "player-1": 3,
            "player-2": 4,
            "player-3": 5
        }),
        /Only currently tied players may reroll/
    );
});

test("repeated rerolls preserve the correct order of every player", () => {
    const players = makePlayers(3);
    const draft = new Draft(players);

    // All three players tie on the initial roll.
    const initial = draft.setInitialRolls([6, 6, 6]);

    assert.equal(initial.tied, true);

    // Player 3 rolls lower, so only players 1 and 2 reroll.
    const firstReroll = draft.rerollTie({
        "player-1": 5,
        "player-2": 5,
        "player-3": 2
    });

    assert.equal(firstReroll.tied, true);
    assert.deepEqual(firstReroll.tiedPlayerIds, [
        "player-1",
        "player-2"
    ]);

    // Player 1 wins the remaining tie.
    const secondReroll = draft.rerollTie({
        "player-1": 6,
        "player-2": 3
    });

    assert.equal(secondReroll.tied, false);
    assert.deepEqual(secondReroll.order, [
        "player-1",
        "player-2",
        "player-3"
    ]);

    // Every player must appear exactly once.
    assert.equal(new Set(draft.order).size, 3);
    assert.equal(draft.order.length, 3);
});