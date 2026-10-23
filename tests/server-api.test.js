/*
 * Multiplayer Room HTTP API Tests
 * -------------------------------
 * Tests the public HTTP contract and verifies that the room manager
 * is correctly connected to the API.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("../src/server/server");

async function withServer(runTest) {
    const server = createServer();

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
        await runTest(baseUrl);
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }
}

async function readJson(response) {
    return response.json();
}

/*
 * Create a room through the public HTTP API.
 *
 * Settings are optional so existing tests continue to exercise
 * the default room configuration unless they explicitly choose
 * different values.
 */
async function createRoom(baseUrl, name = "Host", settings = {}) {
    const response = await fetch(`${baseUrl}/api/rooms`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            name,
            ...settings
        })
    });

    return {
        response,
        data: await readJson(response)
    };
}

async function joinRoom(baseUrl, code, name = "Guest") {
    const response = await fetch(
        `${baseUrl}/api/rooms/${code}/join`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name })
        }
    );

    return {
        response,
        data: await readJson(response)
    };
}

test("POST /api/rooms creates a room and returns the host credential", async () => {
    await withServer(async (baseUrl) => {
        const { response, data } = await createRoom(baseUrl);

        assert.equal(response.status, 201);
        assert.equal(typeof data.playerId, "string");
        assert.match(data.room.code, /^[A-Z0-9]{6}$/);
        assert.equal(data.room.status, "waiting");
        assert.equal(data.room.playerCount, 1);
        assert.equal(data.room.players[0].isHost, true);
        assert.equal(data.room.players[0].isYou, true);
    });
});

test("POST /api/rooms/:code/join adds a player", async () => {
    await withServer(async (baseUrl) => {
        const host = await createRoom(baseUrl);
        const guest = await joinRoom(baseUrl, host.data.room.code);

        assert.equal(guest.response.status, 200);
        assert.equal(guest.data.room.playerCount, 2);
        assert.equal(guest.data.room.players[1].name, "Guest");
        assert.equal(guest.data.room.players[1].isYou, true);
    });
});

test("GET /api/rooms/:code requires a player credential", async () => {
    await withServer(async (baseUrl) => {
        const host = await createRoom(baseUrl);

        const response = await fetch(
            `${baseUrl}/api/rooms/${host.data.room.code}`
        );

        assert.equal(response.status, 401);

        const data = await readJson(response);
        assert.equal(
            data.error.code,
            "PLAYER_CREDENTIAL_REQUIRED"
        );
    });
});

test("GET /api/rooms/:code returns a member's lobby snapshot", async () => {
    await withServer(async (baseUrl) => {
        const host = await createRoom(baseUrl);

        const response = await fetch(
            `${baseUrl}/api/rooms/${host.data.room.code}`,
            {
                headers: {
                    "X-Player-Id": host.data.playerId
                }
            }
        );

        assert.equal(response.status, 200);

        const data = await readJson(response);
        assert.equal(data.room.code, host.data.room.code);
        assert.equal(data.room.players[0].isYou, true);
        assert.equal(JSON.stringify(data).includes(host.data.playerId), false);
    });
});

test("PUT /api/rooms/:code/ready updates the player's readiness", async () => {
    await withServer(async (baseUrl) => {
        const host = await createRoom(baseUrl);
        const guest = await joinRoom(baseUrl, host.data.room.code);

        const response = await fetch(
            `${baseUrl}/api/rooms/${host.data.room.code}/ready`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "X-Player-Id": host.data.playerId
                },
                body: JSON.stringify({ ready: true })
            }
        );

        assert.equal(response.status, 200);

        const data = await readJson(response);
        assert.equal(data.room.players[0].ready, true);
        assert.equal(data.room.players[1].ready, false);
        assert.equal(data.room.allPlayersReady, false);

        // The guest's credential remains separate from the host's.
        assert.notEqual(host.data.playerId, guest.data.playerId);
    });
});

test("POST /api/rooms/:code/start rejects a non-host", async () => {
    await withServer(async (baseUrl) => {
        const host = await createRoom(baseUrl);
        const guest = await joinRoom(baseUrl, host.data.room.code);

        const response = await fetch(
            `${baseUrl}/api/rooms/${host.data.room.code}/start`,
            {
                method: "POST",
                headers: {
                    "X-Player-Id": guest.data.playerId
                }
            }
        );

        assert.equal(response.status, 403);

        const data = await readJson(response);
        assert.equal(data.error.code, "HOST_ONLY");
    });
});

test("starting requires at least two players and everyone ready", async () => {
    await withServer(async (baseUrl) => {
        const host = await createRoom(baseUrl);

        const soloStart = await fetch(
            `${baseUrl}/api/rooms/${host.data.room.code}/start`,
            {
                method: "POST",
                headers: {
                    "X-Player-Id": host.data.playerId
                }
            }
        );

        assert.equal(soloStart.status, 409);
        assert.equal(
            (await readJson(soloStart)).error.code,
            "NOT_ENOUGH_PLAYERS"
        );

        const guest = await joinRoom(baseUrl, host.data.room.code);

        const hostReady = await fetch(
            `${baseUrl}/api/rooms/${host.data.room.code}/ready`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "X-Player-Id": host.data.playerId
                },
                body: JSON.stringify({ ready: true })
            }
        );

        assert.equal(hostReady.status, 200);

        const notReadyStart = await fetch(
            `${baseUrl}/api/rooms/${host.data.room.code}/start`,
            {
                method: "POST",
                headers: {
                    "X-Player-Id": host.data.playerId
                }
            }
        );

        assert.equal(notReadyStart.status, 409);
        assert.equal(
            (await readJson(notReadyStart)).error.code,
            "PLAYERS_NOT_READY"
        );

        const guestReady = await fetch(
            `${baseUrl}/api/rooms/${host.data.room.code}/ready`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "X-Player-Id": guest.data.playerId
                },
                body: JSON.stringify({ ready: true })
            }
        );

        assert.equal(guestReady.status, 200);

        const start = await fetch(
            `${baseUrl}/api/rooms/${host.data.room.code}/start`,
            {
                method: "POST",
                headers: {
                    "X-Player-Id": host.data.playerId
                }
            }
        );

        assert.equal(start.status, 200);
        assert.equal((await readJson(start)).room.status, "started");
    });
});

test("malformed JSON returns a useful 400 response", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/rooms`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: "{not valid JSON"
        });

        assert.equal(response.status, 400);

        const data = await readJson(response);
        assert.equal(data.error.code, "INVALID_JSON");
    });
});

test("API requests require the JSON content type", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/rooms`, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain"
            },
            body: "Host"
        });

        assert.equal(response.status, 415);

        const data = await readJson(response);
        assert.equal(data.error.code, "JSON_REQUIRED");
    });
});

test("unknown API routes return JSON 404 responses", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/not-a-route`);

        assert.equal(response.status, 404);

        const data = await readJson(response);
        assert.equal(data.error.code, "API_ROUTE_NOT_FOUND");
    });
});

test("a player credential from one room cannot access another room", async () => {
    await withServer(async (baseUrl) => {
        const first = await createRoom(baseUrl, "First");
        const second = await createRoom(baseUrl, "Second");

        const response = await fetch(
            `${baseUrl}/api/rooms/${second.data.room.code}`,
            {
                headers: {
                    "X-Player-Id": first.data.playerId
                }
            }
        );

        assert.equal(response.status, 403);

        const data = await readJson(response);
        assert.equal(data.error.code, "PLAYER_NOT_IN_ROOM");
    });
});
test("POST /api/rooms accepts custom player and season settings", async () => {
    await withServer(async (baseUrl) => {
        const { response, data } = await createRoom(baseUrl, "Host", {
            maxPlayers: 3,
            seasonEvents: 12
        });

        assert.equal(response.status, 201);
        assert.equal(data.room.maxPlayers, 3);
        assert.equal(data.room.seasonEvents, 12);
    });
});

test("POST /api/rooms uses default player and season settings", async () => {
    await withServer(async (baseUrl) => {
        const { response, data } = await createRoom(baseUrl);

        assert.equal(response.status, 201);
        assert.equal(data.room.maxPlayers, 4);
        assert.equal(data.room.seasonEvents, 5);
    });
});

test("POST /api/rooms rejects invalid room settings", async () => {
    await withServer(async (baseUrl) => {
        const { response, data } = await createRoom(baseUrl, "Host", {
            maxPlayers: 5,
            seasonEvents: 12
        });

        assert.equal(response.status, 400);
        assert.equal(data.error.code, "INVALID_MAX_PLAYERS");
    });
});