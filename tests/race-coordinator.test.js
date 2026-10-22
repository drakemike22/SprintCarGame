
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createRaceState,
    getCurrentRaceCar,
    completeRaceCarTurn,
    skipRaceCarTurn,
    stopRaceRoundForYellow,
    applyCompletedRaceTurn,
    restartRaceAfterYellow
} = require("../src/game/rules/race-coordinator");

const { CAR_STATUSES } = require("../src/game/rules/car-status");
const {
    startMovementTurn,
    chooseMovementTurnPosition
} = require("../src/game/track/movement-turn");

function makeCar(carId, section, lane = 2, status = CAR_STATUSES.RUNNING) {
    return {
        carId,
        position: { section, lane },
        completedLaps: 0,
        distance: 0,
        status,
        mechanicalDamage: "none"
    };
}

test("creates a race state with cars ordered for the first round", () => {
    const cars = [
        makeCar("car-a", 5),
        makeCar("car-b", 12),
        makeCar("car-c", 8)
    ];

    const race = createRaceState(cars);

    assert.equal(race.status, "running");
    assert.equal(race.yellowFlag, false);
    assert.deepEqual(
        race.round.order,
        ["car-b", "car-c", "car-a"]
    );
    assert.equal(getCurrentRaceCar(race).carId, "car-b");
});

test("copies the car array and track positions", () => {
    const original = makeCar("car-a", 10);
    const race = createRaceState([original]);

    assert.notStrictEqual(race.raceCars, original);
    assert.notStrictEqual(race.raceCars[0], original);
    assert.notStrictEqual(race.raceCars[0].position, original.position);

    race.raceCars[0].position.section = 20;

    assert.equal(original.position.section, 10);
});

test("completes turns in the original round order", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    completeRaceCarTurn(race, "car-b");

    assert.equal(getCurrentRaceCar(race).carId, "car-a");
    assert.equal(race.status, "running");

    completeRaceCarTurn(race, "car-a");

    assert.equal(getCurrentRaceCar(race), null);
    assert.equal(race.status, "round-complete");
});

test("skips a car and advances to the next car", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    skipRaceCarTurn(race, "car-b");

    assert.equal(getCurrentRaceCar(race).carId, "car-a");
    assert.deepEqual(race.round.skippedCarIds, ["car-b"]);
});

test("yellow flag immediately stops the current round", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    stopRaceRoundForYellow(race);

    assert.equal(race.yellowFlag, true);
    assert.equal(race.status, "yellow-flag");
    assert.equal(getCurrentRaceCar(race), null);
});

test("rejects a non-array of race cars", () => {
    assert.throws(
        () => createRaceState(null),
        /array/
    );
});


test("applies movement progress and advances to the next car", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    const turn = {
        status: "complete",
        position: { section: 14, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 },
            { section: 14, lane: 2 }
        ]
    };

    applyCompletedRaceTurn(race, "car-b", turn);

    const updatedCar = race.raceCars.find(
        car => car.carId === "car-b"
    );

    assert.deepEqual(updatedCar.position, { section: 14, lane: 2 });
    assert.equal(updatedCar.distance, 2);
    assert.equal(updatedCar.completedLaps, 0);
    assert.equal(getCurrentRaceCar(race).carId, "car-a");
});

test("accepts a valid movement plan against live track occupancy", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    let turn = startMovementTurn({
        currentPosition: { section: 12, lane: 2 },
        occupiedPositions: [{ section: 5, lane: 2 }],
        movementRemaining: 2,
        laneChangesRemaining: 0
    });

    turn = chooseMovementTurnPosition(turn, {
        section: 13,
        lane: 2
    });

    turn = chooseMovementTurnPosition(turn, {
        section: 14,
        lane: 2
    });

    applyCompletedRaceTurn(race, "car-b", turn);

    const updatedCar = race.raceCars.find(
        car => car.carId === "car-b"
    );

    assert.deepEqual(updatedCar.position, {
        section: 14,
        lane: 2
    });
    assert.equal(updatedCar.distance, 2);
});

test("rejects a movement plan when another running car moves", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    let turn = startMovementTurn({
        currentPosition: { section: 12, lane: 2 },
        occupiedPositions: [{ section: 5, lane: 2 }],
        movementRemaining: 2,
        laneChangesRemaining: 0
    });

    turn = chooseMovementTurnPosition(turn, {
        section: 13,
        lane: 2
    });

    turn = chooseMovementTurnPosition(turn, {
        section: 14,
        lane: 2
    });

    // Another running car moves after the route was planned.
    race.raceCars.find(
        car => car.carId === "car-a"
    ).position = { section: 13, lane: 2 };

    const carsBefore = JSON.parse(JSON.stringify(race.raceCars));
    const roundBefore = JSON.parse(JSON.stringify(race.round));
    const statusBefore = race.status;

    assert.throws(
        () => applyCompletedRaceTurn(race, "car-b", turn),
        /Occupied spaces changed/
    );

    // A rejected route must not partially update the race.
    assert.deepEqual(race.raceCars, carsBefore);
    assert.deepEqual(race.round, roundBefore);
    assert.equal(race.status, statusBefore);
});

test("rejects a movement plan that starts at the wrong position", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    let turn = startMovementTurn({
        // The actual car is at section 12, not section 11.
        currentPosition: { section: 11, lane: 2 },
        occupiedPositions: [{ section: 5, lane: 2 }],
        movementRemaining: 2,
        laneChangesRemaining: 0
    });

    turn = chooseMovementTurnPosition(turn, {
        section: 12,
        lane: 2
    });

    turn = chooseMovementTurnPosition(turn, {
        section: 13,
        lane: 2
    });

    const carsBefore = JSON.parse(JSON.stringify(race.raceCars));
    const roundBefore = JSON.parse(JSON.stringify(race.round));

    assert.throws(
        () => applyCompletedRaceTurn(race, "car-b", turn),
        /starting position does not match/
    );

    assert.deepEqual(race.raceCars, carsBefore);
    assert.deepEqual(race.round, roundBefore);
});

test("cars out of the race or event do not block movement plans", () => {
    const race = createRaceState([
        makeCar("car-a", 13, 2, CAR_STATUSES.OUT_FOR_RACE),
        makeCar("car-c", 14, 2, CAR_STATUSES.OUT_FOR_EVENT),
        makeCar("car-b", 12)
    ]);

    let turn = startMovementTurn({
        currentPosition: { section: 12, lane: 2 },
        // Neither off-track car should appear in this snapshot.
        occupiedPositions: [],
        movementRemaining: 2,
        laneChangesRemaining: 0
    });

    turn = chooseMovementTurnPosition(turn, {
        section: 13,
        lane: 2
    });

    turn = chooseMovementTurnPosition(turn, {
        section: 14,
        lane: 2
    });

    assert.doesNotThrow(() => {
        applyCompletedRaceTurn(race, "car-b", turn);
    });

    const updatedCar = race.raceCars.find(
        car => car.carId === "car-b"
    );

    assert.deepEqual(updatedCar.position, {
        section: 14,
        lane: 2
    });
});

test("counts a lap when a completed turn crosses the finish line", () => {
    const race = createRaceState([
        makeCar("car-a", 29)
    ]);

    const turn = {
        status: "complete",
        position: { section: 1, lane: 2 },
        history: [
            { section: 29, lane: 2 },
            { section: 0, lane: 2 },
            { section: 1, lane: 2 }
        ]
    };

    applyCompletedRaceTurn(race, "car-a", turn);

    assert.equal(race.raceCars[0].completedLaps, 1);
    assert.equal(race.raceCars[0].distance, 2);
    assert.deepEqual(
        race.raceCars[0].position,
        { section: 1, lane: 2 }
    );
    assert.equal(race.status, "round-complete");
});

test("rejects a completed turn from the wrong car", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    const turn = {
        status: "complete",
        position: { section: 13, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 }
        ]
    };

    assert.throws(
        () => applyCompletedRaceTurn(race, "car-a", turn),
        /current turn/
    );
});


test("does not advance a turn when the event is still pending", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    const turn = {
        status: "complete",
        position: { section: 13, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 }
        ],
        eventResolution: {
            status: "pending"
        }
    };

    assert.throws(
        () => applyCompletedRaceTurn(race, "car-b", turn),
        /event/i
    );

    assert.equal(getCurrentRaceCar(race).carId, "car-b");
});


test("does not advance a turn while the mechanical wheel awaits a spin", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    const turn = {
        status: "complete",
        position: { section: 13, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 }
        ],
        eventResolution: {
            status: "resolved",
            result: { type: "mechanical-spinner" }
        },
        mechanicalWheel: {
            status: "awaiting-spin"
        }
    };

    assert.throws(
        () => applyCompletedRaceTurn(race, "car-b", turn),
        /mechanical wheel/i
    );

    assert.equal(getCurrentRaceCar(race).carId, "car-b");
});


test("preserves mechanical outcomes when applying completed movement", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    const mechanicallyDamagedCar = {
        ...makeCar("car-b", 12),
        status: CAR_STATUSES.OUT_FOR_RACE,
        mechanicalDamage: "blown-tire"
    };

    const turn = {
        status: "complete",
        position: { section: 14, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 },
            { section: 14, lane: 2 }
        ],
        raceCar: mechanicallyDamagedCar,
        eventResolution: {
            status: "resolved",
            result: { type: "mechanical-spinner" }
        },
        mechanicalWheel: {
            status: "resolved",
            result: {
                type: "blown-tire",
                consequence: "out-for-race"
            }
        }
    };

    applyCompletedRaceTurn(race, "car-b", turn);

    const updatedCar = race.raceCars.find(
        car => car.carId === "car-b"
    );

    assert.deepEqual(updatedCar.position, { section: 14, lane: 2 });
    assert.equal(updatedCar.distance, 2);
    assert.equal(updatedCar.status, CAR_STATUSES.OUT_FOR_RACE);
    assert.equal(updatedCar.mechanicalDamage, "blown-tire");
    assert.equal(getCurrentRaceCar(race).carId, "car-a");
});


test("preserves out-for-event status after a blown motor", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    const turn = {
        status: "complete",
        position: { section: 14, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 },
            { section: 14, lane: 2 }
        ],
        raceCar: {
            ...makeCar("car-b", 12),
            status: CAR_STATUSES.OUT_FOR_EVENT,
            mechanicalDamage: "blown-motor"
        },
        eventResolution: {
            status: "resolved",
            result: { type: "mechanical-spinner" }
        },
        mechanicalWheel: {
            status: "resolved",
            result: {
                type: "blown-motor",
                consequence: "out-for-event"
            }
        }
    };

    applyCompletedRaceTurn(race, "car-b", turn);

    const updatedCar = race.raceCars.find(
        car => car.carId === "car-b"
    );

    assert.equal(updatedCar.status, CAR_STATUSES.OUT_FOR_EVENT);
    assert.equal(updatedCar.mechanicalDamage, "blown-motor");
    assert.equal(updatedCar.distance, 2);
    assert.equal(getCurrentRaceCar(race).carId, "car-a");
});


test("does not advance a turn while the wreck wheel awaits a spin", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    const turn = {
        status: "complete",
        position: { section: 13, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 }
        ],
        eventResolution: {
            status: "resolved",
            result: { type: "wreck" }
        },
        wreckWheel: {
            status: "awaiting-spin"
        }
    };

    assert.throws(
        () => applyCompletedRaceTurn(race, "car-b", turn),
        /wreck wheel/i
    );

    assert.equal(getCurrentRaceCar(race).carId, "car-b");
});


test("applies a resolved close-call wreck and advances normally", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12)
    ]);

    const turn = {
        status: "complete",
        position: { section: 14, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 },
            { section: 14, lane: 2 }
        ],
        raceCar: makeCar("car-b", 12),
        eventResolution: {
            status: "resolved",
            result: { type: "wreck" }
        },
        wreckWheel: {
            status: "resolved",
            result: {
                slot: 1,
                type: "close-call",
                consequence: "none"
            }
        },
        wreckResolution: {
            yellowFlag: false,
            goToBack: false,
            followOnSpins: []
        }
    };

    applyCompletedRaceTurn(race, "car-b", turn);

    const updatedCar = race.raceCars.find(
        car => car.carId === "car-b"
    );

    assert.deepEqual(
        updatedCar.position,
        { section: 14, lane: 2 }
    );
    assert.equal(updatedCar.status, CAR_STATUSES.RUNNING);
    assert.equal(race.yellowFlag, false);
    assert.equal(race.status, "running");
    assert.equal(getCurrentRaceCar(race).carId, "car-a");
});


test("applies a resolved wreck that raises a yellow flag", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 18),
        makeCar("car-c", 12)
    ]);

    const turn = {
        status: "complete",
        position: { section: 14, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 },
            { section: 14, lane: 2 }
        ],
        raceCar: {
            ...makeCar("car-b", 12),
            status: CAR_STATUSES.OUT_FOR_RACE
        },
        eventResolution: {
            status: "resolved",
            result: { type: "wreck" }
        },
        wreckWheel: {
            status: "resolved",
            result: {
                slot: 4,
                type: "hit-wall-hard",
                consequence: "out-for-race",
                yellowFlag: true
            }
        },
        wreckResolution: {
            yellowFlag: true,
            goToBack: false,
            followOnSpins: []
        }
    };

    applyCompletedRaceTurn(race, "car-b", turn);

    const wreckedCar = race.raceCars.find(
        car => car.carId === "car-b"
    );

    assert.equal(wreckedCar.status, CAR_STATUSES.OUT_FOR_RACE);
    assert.equal(race.yellowFlag, true);
    assert.equal(race.status, "yellow-flag");
    assert.equal(getCurrentRaceCar(race), null);
});


test("applies a follow-on spin to the car immediately behind a wreck", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12),
        makeCar("car-c", 11)
    ]);

    const turn = {
        status: "complete",
        position: { section: 14, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 },
            { section: 14, lane: 2 }
        ],
        raceCar: makeCar("car-b", 12),
        eventResolution: {
            status: "resolved",
            result: { type: "wreck" }
        },
        wreckWheel: {
            status: "resolved",
            result: {
                slot: 3,
                type: "bicycle-big",
                consequence: "backward-3",
                yellowFlag: false,
                followOnSpins: [1]
            }
        },
        wreckResolution: {
            yellowFlag: false,
            goToBack: false,
            followOnSpins: [
                { carId: "car-c", slot: 2 }
            ]
        }
    };

    applyCompletedRaceTurn(race, "car-b", turn);

    const followingCar = race.raceCars.find(
        car => car.carId === "car-c"
    );

    assert.deepEqual(
        followingCar.position,
        { section: 8, lane: 2 }
    );
    assert.equal(race.yellowFlag, false);
});


test("applies separate punishments to multiple follow-on cars", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12),
        makeCar("car-c", 11),
        makeCar("car-d", 10)
    ]);

    const turn = {
        status: "complete",
        position: { section: 14, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 },
            { section: 14, lane: 2 }
        ],
        raceCar: makeCar("car-b", 12),
        eventResolution: {
            status: "resolved",
            result: { type: "wreck" }
        },
        wreckWheel: {
            status: "resolved",
            result: {
                slot: 3,
                type: "bicycle-big",
                consequence: "backward-3",
                yellowFlag: false,
                followOnSpins: [1]
            }
        },
        wreckResolution: {
            yellowFlag: false,
            goToBack: false,
            followOnSpins: [
                { carId: "car-c", slot: 2 },
                { carId: "car-d", slot: 1 }
            ]
        }
    };

    applyCompletedRaceTurn(race, "car-b", turn);

    const carC = race.raceCars.find(car => car.carId === "car-c");
    const carD = race.raceCars.find(car => car.carId === "car-d");

    assert.equal(carC.position.section, 8);
    assert.equal(carD.position.section, 10);
});

test("rejects an invalid follow-on car without partially updating the race", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12),
        makeCar("car-c", 11)
    ]);

    const originalState = structuredClone(race);

    const turn = {
        status: "complete",
        position: { section: 14, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 },
            { section: 14, lane: 2 }
        ],
        raceCar: makeCar("car-b", 12),
        eventResolution: {
            status: "resolved",
            result: { type: "wreck" }
        },
        wreckWheel: {
            status: "resolved",
            result: {
                slot: 3,
                type: "bicycle-big",
                consequence: "backward-3",
                yellowFlag: false,
                followOnSpins: [1]
            }
        },
        wreckResolution: {
            yellowFlag: false,
            goToBack: false,
            followOnSpins: [
                { carId: "car-c", slot: 2 },
                { carId: "missing-car", slot: 1 }
            ]
        }
    };

    assert.throws(
        () => applyCompletedRaceTurn(race, "car-b", turn),
        /Follow-on spin car "missing-car" was not found/
    );

    assert.deepEqual(race, originalState);
});

test("rejects duplicate follow-on cars without partially updating the race", () => {
    const race = createRaceState([
        makeCar("car-a", 5),
        makeCar("car-b", 12),
        makeCar("car-c", 11)
    ]);

    const originalState = structuredClone(race);

    const turn = {
        status: "complete",
        position: { section: 14, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 },
            { section: 14, lane: 2 }
        ],
        raceCar: makeCar("car-b", 12),
        eventResolution: {
            status: "resolved",
            result: { type: "wreck" }
        },
        wreckWheel: {
            status: "resolved",
            result: {
                slot: 3,
                type: "bicycle-big",
                consequence: "backward-3",
                yellowFlag: false,
                followOnSpins: [1]
            }
        },
        wreckResolution: {
            yellowFlag: false,
            goToBack: false,
            followOnSpins: [
                { carId: "car-c", slot: 2 },
                { carId: "car-c", slot: 1 }
            ]
        }
    };

    assert.throws(
        () => applyCompletedRaceTurn(race, "car-b", turn),
        /Follow-on car "car-c" cannot be listed more than once/
    );

    assert.deepEqual(race, originalState);
});


test("restarts a yellow-flag race with running cars single-file in lane 2", () => {
    const race = createRaceState([
        makeCar("leader", 25),
        makeCar("second", 22),
        makeCar("third", 18),
        makeCar("fourth", 14)
    ]);

    stopRaceRoundForYellow(race);
    restartRaceAfterYellow(race);

    assert.equal(race.status, "running");
    assert.equal(race.yellowFlag, false);
    assert.equal(race.round.status, "in-progress");

    // The leader remains first, and the other cars line up behind.
    assert.deepEqual(
        race.round.order,
        ["leader", "second", "third", "fourth"]
    );

    assert.deepEqual(
        race.raceCars.map(car => ({
            carId: car.carId,
            position: car.position
        })).sort((a, b) => a.carId.localeCompare(b.carId)),
        [
            { carId: "fourth", position: { section: 22, lane: 2 } },
            { carId: "leader", position: { section: 25, lane: 2 } },
            { carId: "second", position: { section: 24, lane: 2 } },
            { carId: "third", position: { section: 23, lane: 2 } }
        ]
    );

    assert.equal(getCurrentRaceCar(race).carId, "leader");
});

test("keeps cars out for the race or event off the restart lineup", () => {
    const race = createRaceState([
        makeCar("leader", 25),
        makeCar("running-car", 20),
        makeCar("out-race", 18, 2, CAR_STATUSES.OUT_FOR_RACE),
        makeCar("out-event", 15, 2, CAR_STATUSES.OUT_FOR_EVENT)
    ]);

    stopRaceRoundForYellow(race);
    restartRaceAfterYellow(race);

    assert.deepEqual(race.round.order, ["leader", "running-car"]);

    assert.deepEqual(
        race.raceCars.find(car => car.carId === "out-race").position,
        { section: 18, lane: 2 }
    );

    assert.deepEqual(
        race.raceCars.find(car => car.carId === "out-event").position,
        { section: 15, lane: 2 }
    );
});

test("rejects restarting a race that has not been stopped for a yellow flag", () => {
    const race = createRaceState([
        makeCar("leader", 25),
        makeCar("second", 20)
    ]);

    assert.throws(
        () => restartRaceAfterYellow(race),
        /yellow/i
    );
});


test("restarts after a yellow-flag wreck with the incident cars at the back", () => {
    const race = createRaceState([
        makeCar("leader", 25),
        makeCar("wreck-car", 12),
        makeCar("spinner-one", 11),
        makeCar("spinner-two", 10)
    ]);

    const turn = {
        status: "complete",
        position: { section: 14, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 },
            { section: 14, lane: 2 }
        ],
        raceCar: makeCar("wreck-car", 12),
        eventResolution: {
            status: "resolved",
            result: { type: "wreck" }
        },
        wreckWheel: {
            status: "resolved",
            result: {
                slot: 5,
                type: "spin-out",
                consequence: "go-to-back",
                yellowFlag: true
            }
        },
        wreckResolution: {
            yellowFlag: true,
            goToBack: true,
            followOnSpins: [
                { carId: "spinner-one", slot: 5 },
                { carId: "spinner-two", slot: 5 }
            ]
        }
    };

    const leaderTurn = {
    status: "complete",
    position: { section: 26, lane: 2 },
    history: [
        { section: 25, lane: 2 },
        { section: 26, lane: 2 }
    ],
    raceCar: makeCar("leader", 25),
    eventResolution: {
        status: "resolved",
        result: { type: "none" }
    }
};

applyCompletedRaceTurn(race, "leader", leaderTurn);
applyCompletedRaceTurn(race, "wreck-car", turn);

    assert.equal(race.status, "yellow-flag");
    assert.equal(race.yellowFlag, true);
    assert.equal(getCurrentRaceCar(race), null);

    restartRaceAfterYellow(race);

    assert.equal(race.status, "running");
    assert.equal(race.yellowFlag, false);
    assert.deepEqual(
        race.round.order,
        ["leader", "wreck-car", "spinner-one", "spinner-two"]
    );

    assert.deepEqual(
        race.raceCars
            .filter(car => race.round.order.includes(car.carId))
            .map(car => ({
                carId: car.carId,
                position: car.position
            }))
            .sort((a, b) =>
                race.round.order.indexOf(a.carId) -
                race.round.order.indexOf(b.carId)
            ),
        [
            { carId: "leader", position: { section: 26, lane: 2 } },
            { carId: "wreck-car", position: { section: 25, lane: 2 } },
            { carId: "spinner-one", position: { section: 24, lane: 2 } },
            { carId: "spinner-two", position: { section: 23, lane: 2 } }
        ]
    );
});

test("keeps cars out for the race or event out of a yellow restart lineup", () => {
    const race = createRaceState([
        makeCar("leader", 25),
        makeCar("wreck-car", 12),
        makeCar("out-race", 10, 2, CAR_STATUSES.OUT_FOR_RACE),
        makeCar("out-event", 8, 2, CAR_STATUSES.OUT_FOR_EVENT)
    ]);

    const turn = {
        status: "complete",
        position: { section: 14, lane: 2 },
        history: [
            { section: 12, lane: 2 },
            { section: 13, lane: 2 },
            { section: 14, lane: 2 }
        ],
        raceCar: {
            ...makeCar("wreck-car", 12),
            status: CAR_STATUSES.OUT_FOR_RACE
        },
        eventResolution: {
            status: "resolved",
            result: { type: "wreck" }
        },
        wreckWheel: {
            status: "resolved",
            result: {
                slot: 4,
                type: "hit-wall-hard",
                consequence: "out-for-race",
                yellowFlag: true
            }
        },
        wreckResolution: {
            yellowFlag: true,
            goToBack: false,
            followOnSpins: []
        }
    };

    const leaderTurn = {
    status: "complete",
    position: { section: 26, lane: 2 },
    history: [
        { section: 25, lane: 2 },
        { section: 26, lane: 2 }
    ],
    raceCar: makeCar("leader", 25),
    eventResolution: {
        status: "resolved",
        result: { type: "none" }
    }
};

applyCompletedRaceTurn(race, "leader", leaderTurn);
applyCompletedRaceTurn(race, "wreck-car", turn);
    restartRaceAfterYellow(race);

    assert.deepEqual(race.round.order, ["leader"]);

    assert.equal(
        race.raceCars.find(car => car.carId === "wreck-car").status,
        CAR_STATUSES.OUT_FOR_RACE
    );

    assert.deepEqual(
        race.raceCars.find(car => car.carId === "out-race").position,
        { section: 10, lane: 2 }
    );

    assert.deepEqual(
        race.raceCars.find(car => car.carId === "out-event").position,
        { section: 8, lane: 2 }
    );
});


test("preserves restart order when the lineup crosses section zero", () => {
    const cars = [
        makeCar("leader", 1),
        makeCar("second", 20),
        makeCar("third", 18),
        makeCar("fourth", 16)
    ];

    // The leader has completed one more lap than the other cars.
    cars[0].completedLaps = 2;
    cars[1].completedLaps = 1;
    cars[2].completedLaps = 1;
    cars[3].completedLaps = 1;

    const race = createRaceState(cars);

    stopRaceRoundForYellow(race);
    restartRaceAfterYellow(race);

    assert.deepEqual(
        race.raceCars
            .filter(car => race.round.order.includes(car.carId))
            .map(car => ({
                carId: car.carId,
                position: car.position
            }))
            .sort((a, b) =>
                race.round.order.indexOf(a.carId) -
                race.round.order.indexOf(b.carId)
            ),
        [
            { carId: "leader", position: { section: 1, lane: 2 } },
            { carId: "second", position: { section: 0, lane: 2 } },
            { carId: "third", position: { section: 29, lane: 2 } },
            { carId: "fourth", position: { section: 28, lane: 2 } }
        ]
    );

    assert.deepEqual(
        race.round.order,
        ["leader", "second", "third", "fourth"]
    );
});
