
/*
 * Season / Race Integration Tests
 * --------------------------------
 * Verifies that completed race states are converted into official
 * season results without guessing the finishing order.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { Season } = require("../src/game/season/season");
const { CAR_STATUSES } = require("../src/game/rules/car-status");

function makeRaceState(status = "completed") {
    return {
        status,
        raceCars: [
            {
                carId: "car-a",
                status: CAR_STATUSES.RUNNING,
                completedLaps: 3,
                distance: 93
            },
            {
                carId: "car-b",
                status: CAR_STATUSES.RUNNING,
                completedLaps: 3,
                distance: 96
            }
        ]
    };
}

/*
 * These tests isolate the integration methods by preparing only the
 * event fields that the existing result-recording methods require.
 */
function makeSeasonWithEvent(currentEvent) {
    const season = Object.create(Season.prototype);
    season.currentEvent = currentEvent;
    return season;
}

test("heat race integration records results in the supplied official order", () => {
    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            { entries: [{ carId: "car-a" }, { carId: "car-b" }] },
            { entries: [] },
            { entries: [] },
            { entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    const results = season.recordHeatRaceResults(
        1,
        makeRaceState(),
        ["car-b", "car-a"]
    );

    assert.deepEqual(
        results.map((result) => result.carId),
        ["car-b", "car-a"]
    );
    assert.equal(results[0].finishingPosition, 1);
    assert.equal(results[0].lapsCompleted, 3);
    assert.equal(results[0].trackDistance, 96);
    assert.deepEqual(season.currentEvent.heatResults[0].results, results);
});

test("B-main race integration records results and advances the event phase", () => {
    const season = makeSeasonWithEvent({
        phase: "b-main",
        bMainLineup: {
            entries: [{ carId: "car-a" }, { carId: "car-b" }]
        },
        bMainResults: null
    });

    const results = season.recordBMainRaceResults(
        makeRaceState(),
        ["car-a", "car-b"]
    );

    assert.deepEqual(
        results.map((result) => result.carId),
        ["car-a", "car-b"]
    );
    assert.equal(season.currentEvent.bMainResults.length, 2);
    assert.equal(season.currentEvent.phase, "a-main");
});

test("A-main race integration records results in the supplied official order", () => {
    const season = makeSeasonWithEvent({
        phase: "a-main",
        aMainLineup: {
            entries: [{ carId: "car-a" }, { carId: "car-b" }]
        },
        aMainResults: null
    });

    const results = season.recordAMainRaceResults(
        makeRaceState(),
        ["car-b", "car-a"]
    );

    assert.deepEqual(
        results.map((result) => result.carId),
        ["car-b", "car-a"]
    );
    assert.equal(results[0].finishingPosition, 1);
    assert.equal(season.currentEvent.aMainResults.length, 2);
});

test("season rejects race results before the race is completed", () => {
    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            { entries: [{ carId: "car-a" }, { carId: "car-b" }] },
            { entries: [] },
            { entries: [] },
            { entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    assert.throws(
        () => season.recordHeatRaceResults(
            1,
            makeRaceState("running"),
            ["car-a", "car-b"]
        ),
        /only be recorded after the race is completed/
    );

    assert.deepEqual(season.currentEvent.heatResults[0].results, []);
});

test("season integration rejects an official order that omits a race car", () => {
    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            { entries: [{ carId: "car-a" }, { carId: "car-b" }] },
            { entries: [] },
            { entries: [] },
            { entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    assert.throws(
        () => season.recordHeatRaceResults(
            1,
            makeRaceState(),
            ["car-a"]
        ),
        /include every race car exactly once/
    );

    assert.deepEqual(season.currentEvent.heatResults[0].results, []);
});


test("starting a heat creates a three-lap race with the correct grid", () => {
    const cars = [
        { id: "car-a", autoMovement: 4, bonusMovement: 1 },
        { id: "car-b", autoMovement: 5, bonusMovement: 2 }
    ];

    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            {
                heatNumber: 1,
                entries: [
                    { carId: "car-a", startingPosition: 1 },
                    { carId: "car-b", startingPosition: 2 }
                ]
            },
            { heatNumber: 2, entries: [] },
            { heatNumber: 3, entries: [] },
            { heatNumber: 4, entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    season.cars = cars;

    const race = season.startHeatRace(1);

    assert.equal(race.lapsToComplete, 3);
    assert.equal(race.status, "running");
    assert.deepEqual(
        race.raceCars.map((car) => ({
            carId: car.carId,
            position: car.position
        })),
        [
            { carId: "car-a", position: { section: 29, lane: 2 } },
            { carId: "car-b", position: { section: 28, lane: 2 } }
        ]
    );

    assert.equal(season.currentEvent.activeRace.raceType, "heat");
    assert.equal(season.currentEvent.raceStates["heat-1"].state, race);
});

test("starting a second heat preserves the first heat state", () => {
    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            { heatNumber: 1, entries: [{ carId: "car-a", startingPosition: 1 }] },
            { heatNumber: 2, entries: [{ carId: "car-b", startingPosition: 1 }] },
            { heatNumber: 3, entries: [] },
            { heatNumber: 4, entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    season.cars = [
        { id: "car-a", autoMovement: 4, bonusMovement: 1 },
        { id: "car-b", autoMovement: 5, bonusMovement: 2 }
    ];

    const firstRace = season.startHeatRace(1);
    const secondRace = season.startHeatRace(2);

    assert.notEqual(firstRace, secondRace);
    assert.equal(season.currentEvent.raceStates["heat-1"].state, firstRace);
    assert.equal(season.currentEvent.raceStates["heat-2"].state, secondRace);
    assert.equal(season.currentEvent.activeRace.heatNumber, 2);
});

test("starting the same heat twice is rejected", () => {
    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            { heatNumber: 1, entries: [{ carId: "car-a", startingPosition: 1 }] },
            { heatNumber: 2, entries: [] },
            { heatNumber: 3, entries: [] },
            { heatNumber: 4, entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    season.cars = [
        { id: "car-a", autoMovement: 4, bonusMovement: 1 }
    ];

    season.startHeatRace(1);

    assert.throws(
        () => season.startHeatRace(1),
        /already been started/
    );
});

test("B-main and A-main start with their configured lap targets", () => {
    const cars = [
        { id: "car-a", autoMovement: 4, bonusMovement: 1 },
        { id: "car-b", autoMovement: 5, bonusMovement: 2 }
    ];

    const bMainSeason = makeSeasonWithEvent({
        phase: "b-main",
        bMainLineup: {
            entries: [
                { carId: "car-a", startingPosition: 1 },
                { carId: "car-b", startingPosition: 2 }
            ]
        },
        bMainResults: null
    });
    bMainSeason.cars = cars;

    const bMain = bMainSeason.startBMainRace();

    assert.equal(bMain.lapsToComplete, 3);
    assert.equal(bMainSeason.currentEvent.activeRace.raceType, "b-main");

    const aMainSeason = makeSeasonWithEvent({
        phase: "a-main",
        aMainLineup: {
            entries: [
                { carId: "car-a", startingPosition: 1 },
                { carId: "car-b", startingPosition: 2 }
            ]
        },
        aMainResults: null
    });
    aMainSeason.cars = cars;

    const aMain = aMainSeason.startAMainRace();

    assert.equal(aMain.lapsToComplete, 5);
    assert.equal(aMainSeason.currentEvent.activeRace.raceType, "a-main");
});

test("race start rejects unknown cars and invalid grid positions", () => {
    const unknownCarSeason = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            { heatNumber: 1, entries: [{ carId: "missing-car", startingPosition: 1 }] },
            { heatNumber: 2, entries: [] },
            { heatNumber: 3, entries: [] },
            { heatNumber: 4, entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });
    unknownCarSeason.cars = [];

    assert.throws(
        () => unknownCarSeason.startHeatRace(1),
        /unknown car/
    );

    const invalidGridSeason = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            { heatNumber: 1, entries: [{ carId: "car-a", startingPosition: 0 }] },
            { heatNumber: 2, entries: [] },
            { heatNumber: 3, entries: [] },
            { heatNumber: 4, entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });
    invalidGridSeason.cars = [
        { id: "car-a", autoMovement: 4, bonusMovement: 1 }
    ];

    assert.throws(
        () => invalidGridSeason.startHeatRace(1),
        /starting positions must be between 1 and 30/
    );
});

test("active race turn plans movement without changing the live position", () => {
    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            {
                heatNumber: 1,
                entries: [
                    { carId: "car-a", startingPosition: 1 },
                    { carId: "car-b", startingPosition: 2 }
                ]
            },
            { heatNumber: 2, entries: [] },
            { heatNumber: 3, entries: [] },
            { heatNumber: 4, entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    season.cars = [
        { id: "car-a", autoMovement: 4, bonusMovement: 1 },
        { id: "car-b", autoMovement: 5, bonusMovement: 2 }
    ];

    const race = season.startHeatRace(1);
    const originalPosition = { ...race.raceCars[0].position };

    const turn = season.startActiveRaceTurn({
        movementDie: 1,
        laneChangeDie: 2,
        eventDie: 3
    });

    assert.equal(turn.raceCar.carId, "car-a");
    assert.deepEqual(race.raceCars[0].position, originalPosition);
    assert.equal(
        season.currentEvent.raceStates["heat-1"].currentTurn,
        turn
    );

    assert.throws(
        () => season.startActiveRaceTurn({
            movementDie: 2,
            laneChangeDie: 3,
            eventDie: 4
        }),
        /already has a pending turn/
    );
});
test("undoing an active race movement restores the pending turn without moving the live car", () => {
    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            {
                heatNumber: 1,
                entries: [
                    { carId: "car-a", startingPosition: 1 },
                    { carId: "car-b", startingPosition: 2 }
                ]
            },
            { heatNumber: 2, entries: [] },
            { heatNumber: 3, entries: [] },
            { heatNumber: 4, entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    season.cars = [
        { id: "car-a", autoMovement: 4, bonusMovement: 1 },
        { id: "car-b", autoMovement: 5, bonusMovement: 2 }
    ];

    const race = season.startHeatRace(1);
    const liveCar = race.raceCars.find(
        (car) => car.carId === "car-a"
    );
    const originalLivePosition = { ...liveCar.position };

    const initialTurn = season.startActiveRaceTurn({
        movementDie: 1,
        laneChangeDie: 2,
        eventDie: 3
    });

    const initialPosition = { ...initialTurn.position };
    const initialMovementRemaining = initialTurn.movementRemaining;
    const initialLaneChangesRemaining =
        initialTurn.laneChangesRemaining;

    // Select a legal space, then undo that movement choice.
    const chosenPosition = initialTurn.legalNextPositions[0];

    assert.ok(
        chosenPosition,
        "The initial movement plan should offer a legal next space."
    );

    const chosenTurn = season.chooseActiveRaceTurnPosition(
        chosenPosition
    );

    assert.deepEqual(chosenTurn.position, chosenPosition);
    assert.notDeepEqual(chosenTurn.position, initialPosition);

    // The live car remains stationary while movement is being planned.
    assert.deepEqual(liveCar.position, originalLivePosition);

    const undoneTurn = season.undoActiveRaceTurnPosition();

    // Undo restores the pending turn's movement state.
    assert.equal(undoneTurn.status, "waiting-for-choice");
    assert.deepEqual(undoneTurn.position, initialPosition);
    assert.deepEqual(undoneTurn.history, [initialPosition]);
    assert.equal(
        undoneTurn.movementRemaining,
        initialMovementRemaining
    );
    assert.equal(
        undoneTurn.laneChangesRemaining,
        initialLaneChangesRemaining
    );

    // The Season stores the updated turn returned by the undo operation.
    assert.equal(
        season.currentEvent.activeRace.currentTurn,
        undoneTurn
    );

    // Dice and event processing remain pending.
    assert.deepEqual(undoneTurn.dice, {
        movement: 1,
        laneChange: 2,
        event: 3
    });
    assert.equal(undoneTurn.eventResolution.status, "pending");
    assert.equal(undoneTurn.mechanicalWheel.status, "pending");
    assert.equal(undoneTurn.wreckWheel.status, "pending");

    // Neither choosing nor undoing a planned move changes the live car.
    assert.deepEqual(liveCar.position, originalLivePosition);
});
test("applying an active race turn advances the live race and clears the pending turn", () => {
    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            {
                heatNumber: 1,
                entries: [
                    { carId: "car-a", startingPosition: 1 },
                    { carId: "car-b", startingPosition: 2 }
                ]
            },
            { heatNumber: 2, entries: [] },
            { heatNumber: 3, entries: [] },
            { heatNumber: 4, entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    season.cars = [
        { id: "car-a", autoMovement: 4, bonusMovement: 1 },
        { id: "car-b", autoMovement: 5, bonusMovement: 2 }
    ];

    const race = season.startHeatRace(1);

    season.startActiveRaceTurn({
        movementDie: 1,
        laneChangeDie: 2,
        eventDie: 3
    });

    // Movement allowance is five. Keep choosing the next space in
    // lane 2 so the test focuses on season/coordinator integration.
    for (let step = 0; step < 5; step += 1) {
        const turn = season.currentEvent.activeRace.currentTurn;
        const plan = turn.movementPlan;
        const currentPosition = plan.position;

        const nextPosition = {
            section: (currentPosition.section + 1) % 30,
            lane: currentPosition.lane
        };

        season.chooseActiveRaceTurnPosition(nextPosition);
    }

    const updatedRace = season.applyActiveRaceTurn();

    assert.equal(updatedRace, race);
    assert.equal(
        season.currentEvent.activeRace.currentTurn,
        null
    );
    assert.equal(
        updatedRace.raceCars.find((car) => car.carId === "car-a").distance,
        5
    );
});

test("rejected active race turn application preserves the pending turn", () => {
    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            {
                heatNumber: 1,
                entries: [
                    { carId: "car-a", startingPosition: 1 },
                    { carId: "car-b", startingPosition: 2 }
                ]
            },
            { heatNumber: 2, entries: [] },
            { heatNumber: 3, entries: [] },
            { heatNumber: 4, entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    season.cars = [
        { id: "car-a", autoMovement: 4, bonusMovement: 1 },
        { id: "car-b", autoMovement: 5, bonusMovement: 2 }
    ];

    const race = season.startHeatRace(1);

    season.startActiveRaceTurn({
        movementDie: 1,
        laneChangeDie: 2,
        eventDie: 3
    });

    const pendingTurn = season.currentEvent.activeRace.currentTurn;
    const liveCar = race.raceCars.find(
        (car) => car.carId === "car-a"
    );
    const originalPosition = { ...liveCar.position };
    const originalDistance = liveCar.distance;

    assert.throws(
        () => season.applyActiveRaceTurn(),
        /event must be resolved/i
    );

    assert.equal(
        season.currentEvent.activeRace.currentTurn,
        pendingTurn
    );
    assert.deepEqual(liveCar.position, originalPosition);
    assert.equal(liveCar.distance, originalDistance);
});
test("active race turn rejects attempts when no race is active", () => {
    const season = makeSeasonWithEvent({
        phase: "heats"
    });

    assert.throws(
        () => season.startActiveRaceTurn({
            movementDie: 1,
            laneChangeDie: 2,
            eventDie: 3
        }),
        /No active race has been started/
    );
});

test("active race turn occupancy excludes cars that are no longer running", () => {
    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            {
                heatNumber: 1,
                entries: [
                    { carId: "car-a", startingPosition: 1 },
                    { carId: "car-b", startingPosition: 2 }
                ]
            },
            { heatNumber: 2, entries: [] },
            { heatNumber: 3, entries: [] },
            { heatNumber: 4, entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    season.cars = [
        { id: "car-a", autoMovement: 4, bonusMovement: 1 },
        { id: "car-b", autoMovement: 5, bonusMovement: 2 }
    ];

    const race = season.startHeatRace(1);

    race.raceCars[1].status = CAR_STATUSES.OUT_FOR_RACE;

    const turn = season.startActiveRaceTurn({
        movementDie: 1,
        laneChangeDie: 2,
        eventDie: 3
    });

    assert.deepEqual(turn.movementPlan.occupiedPositions, []);
});

test("season can restart an active race after a yellow flag", () => {
    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            {
                heatNumber: 1,
                entries: [
                    { carId: "car-a", startingPosition: 1 },
                    { carId: "car-b", startingPosition: 2 }
                ]
            },
            { heatNumber: 2, entries: [] },
            { heatNumber: 3, entries: [] },
            { heatNumber: 4, entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    season.cars = [
        { id: "car-a", autoMovement: 4, bonusMovement: 1 },
        { id: "car-b", autoMovement: 5, bonusMovement: 2 }
    ];

    const race = season.startHeatRace(1);

    season.startActiveRaceTurn({
        movementDie: 2,
        laneChangeDie: 2,
        eventDie: 2
    });

    // Finish the planned movement before applying the wreck and yellow flag.
    let turn = season.currentEvent.activeRace.currentTurn;
    let safetySteps = 0;

    while (turn.movementPlan.status === "planning") {
        const currentPosition = turn.movementPlan.position;

        season.chooseActiveRaceTurnPosition({
            section: (currentPosition.section + 1) % 30,
            lane: currentPosition.lane
        });

        turn = season.currentEvent.activeRace.currentTurn;
        safetySteps += 1;

        assert.ok(
            safetySteps <= 30,
            "Movement planning should finish within one lap."
        );
    }
    season.resolveActiveRaceWreckSpinner(4);
    season.applyActiveRaceTurn();

    assert.equal(race.status, "yellow-flag");
    assert.equal(race.yellowFlag, true);
    assert.equal(
        season.currentEvent.activeRace.currentTurn,
        null
    );

    const restartedRace = season.restartActiveRaceAfterYellow();

    assert.equal(restartedRace, race);
    assert.equal(race.status, "running");
    assert.equal(race.yellowFlag, false);
    assert.deepEqual(race.yellowFlagCarsToBack, []);

    const runningCars = race.raceCars.filter(
        raceCar => raceCar.status === CAR_STATUSES.RUNNING
    );

    assert.ok(runningCars.length > 0);

    for (const raceCar of runningCars) {
        assert.equal(raceCar.position.lane, 2);
    }

    assert.equal(
        race.round.order.length,
        runningCars.length
    );
});

test("season cannot restart a race that is not under a yellow flag", () => {
    const season = makeSeasonWithEvent({
        phase: "heats",
        heatLineups: [
            {
                heatNumber: 1,
                entries: [
                    { carId: "car-a", startingPosition: 1 },
                    { carId: "car-b", startingPosition: 2 }
                ]
            },
            { heatNumber: 2, entries: [] },
            { heatNumber: 3, entries: [] },
            { heatNumber: 4, entries: [] }
        ],
        heatResults: [
            { heatNumber: 1, results: [] },
            { heatNumber: 2, results: [] },
            { heatNumber: 3, results: [] },
            { heatNumber: 4, results: [] }
        ]
    });

    season.cars = [
        { id: "car-a", autoMovement: 4, bonusMovement: 1 },
        { id: "car-b", autoMovement: 5, bonusMovement: 2 }
    ];

    const race = season.startHeatRace(1);
    const originalRound = race.round;
    const originalPositions = race.raceCars.map(
        raceCar => ({ ...raceCar.position })
    );

    assert.throws(
        () => season.restartActiveRaceAfterYellow(),
        /stopped for a yellow flag/
    );

    assert.equal(race.status, "running");
    assert.equal(race.yellowFlag, false);
    assert.equal(race.round, originalRound);
    assert.deepEqual(
        race.raceCars.map(raceCar => raceCar.position),
        originalPositions
    );
});
