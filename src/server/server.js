/*
 * Sprint Car Game HTTP Server
 * ---------------------------
 * Serves the browser client and exposes the multiplayer room API.
 *
 * Room rules live in RoomManager, not in this HTTP layer. Each server
 * instance receives its own in-memory room manager, which also keeps
 * automated tests isolated from one another.
 */

"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const { RoomManager, RoomError } = require("./rooms");

const CLIENT_ROOT = path.resolve(__dirname, "../client");
const PORT = Number(process.env.PORT) || 3000;
const MAX_JSON_BODY_BYTES = 16 * 1024;

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon"
};

function sendText(response, statusCode, message) {
    response.writeHead(statusCode, {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store"
    });

    response.end(message);
}

function sendJson(response, statusCode, data) {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store"
    });

    response.end(JSON.stringify(data));
}

function sendRoomError(response, error) {
    if (error instanceof RoomError) {
        sendJson(response, error.statusCode, {
            error: {
                code: error.code,
                message: error.message
            }
        });
        return;
    }

    sendJson(response, 500, {
        error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "An unexpected server error occurred."
        }
    });
}

/*
 * Read a small JSON request body. Reject unsupported content types,
 * malformed JSON, and oversized bodies before passing data to the
 * room manager.
 */
async function readJsonBody(request) {
    const contentType = request.headers["content-type"] || "";

    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
        request.resume();

        throw new RoomError(
            "JSON_REQUIRED",
            "Send this request with Content-Type: application/json.",
            415
        );
    }

    const chunks = [];
    let totalBytes = 0;
    let tooLarge = false;

    await new Promise((resolve, reject) => {
        request.on("data", (chunk) => {
            totalBytes += chunk.length;

            if (totalBytes > MAX_JSON_BODY_BYTES) {
                tooLarge = true;
                chunks.length = 0;
                return;
            }

            if (!tooLarge) {
                chunks.push(chunk);
            }
        });

        request.on("end", resolve);
        request.on("error", reject);
        request.on("aborted", () => {
            reject(new RoomError(
                "REQUEST_ABORTED",
                "The request was interrupted.",
                400
            ));
        });
    });

    if (tooLarge) {
        throw new RoomError(
            "BODY_TOO_LARGE",
            "The JSON request body is too large.",
            413
        );
    }

    let parsed;

    try {
        parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
        throw new RoomError(
            "INVALID_JSON",
            "The request body must contain valid JSON."
        );
    }

    if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
    ) {
        throw new RoomError(
            "INVALID_JSON_SHAPE",
            "The JSON body must be an object."
        );
    }

    return parsed;
}

/*
 * Player credentials are deliberately accepted only in this header.
 * Public room snapshots never contain the credentials themselves.
 */
function getPlayerCredential(request) {
    const value = request.headers["x-player-id"];

    if (typeof value !== "string" || value.length === 0) {
        throw new RoomError(
            "PLAYER_CREDENTIAL_REQUIRED",
            "A player credential is required in the X-Player-Id header.",
            401
        );
    }

    return value;
}

function decodeRoomCode(encodedCode) {
    let code;

    try {
        code = decodeURIComponent(encodedCode);
    } catch {
        throw new RoomError(
            "INVALID_ROOM_CODE",
            "Enter a valid room code."
        );
    }

    return code;
}

/*
 * Handle API routes. Return true when the request belongs to /api/,
 * including unknown API routes, so they never fall through to static
 * file serving.
 */
async function handleApiRequest(request, response, url, roomManager) {
    if (!url.pathname.startsWith("/api/") && url.pathname !== "/api") {
        return false;
    }

    try {
        const method = request.method;
        const pathname = url.pathname;

        // POST /api/rooms — create a room and register the host.
        //
        // The room manager validates the optional settings. When omitted,
        // its defaults are four players and five season events.
        if (method === "POST" && pathname === "/api/rooms") {
            const body = await readJsonBody(request);

            const result = roomManager.createRoom(body.name, {
                maxPlayers: body.maxPlayers,
                seasonEvents: body.seasonEvents
            });

            sendJson(response, 201, {
                playerId: result.playerId,
                room: result.room
            });

            return true;
        }

        // POST /api/rooms/:code/join — join a waiting room.
        const joinMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/join$/
        );

        if (method === "POST" && joinMatch) {
            const body = await readJsonBody(request);
            const result = roomManager.joinRoom(
                decodeRoomCode(joinMatch[1]),
                body.name
            );

            sendJson(response, 200, {
                playerId: result.playerId,
                room: result.room
            });

            return true;
        }

        // GET /api/rooms/:code — fetch the member's current room view.
        const roomMatch = pathname.match(/^\/api\/rooms\/([^/]+)$/);

        if (method === "GET" && roomMatch) {
            const playerId = getPlayerCredential(request);
            const room = roomManager.getRoom(
                decodeRoomCode(roomMatch[1]),
                playerId
            );

            sendJson(response, 200, { room });
            return true;
        }
        
        // POST /api/rooms/:code/race/turn/preview
        // Validate a proposed movement path without changing the live turn.
        const raceTurnPreviewMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/race\/turn\/preview$/
        );
        if (method === "POST" && raceTurnPreviewMatch) {
            const playerId = getPlayerCredential(request);
            const body = await readJsonBody(request);
            const preview = roomManager.previewActiveRaceTurnRoute(
                decodeRoomCode(raceTurnPreviewMatch[1]),
                playerId,
                body.positions
            );
            sendJson(response, 200, { preview });
            return true;
        }

        // POST /api/rooms/:code/race/turn/confirm
        // Commit the complete movement path atomically.
        const raceTurnConfirmMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/race\/turn\/confirm$/
        );
        if (method === "POST" && raceTurnConfirmMatch) {
            const playerId = getPlayerCredential(request);
            const body = await readJsonBody(request);
            const room = roomManager.confirmActiveRaceTurnRoute(
                decodeRoomCode(raceTurnConfirmMatch[1]),
                playerId,
                body.positions
            );
            sendJson(response, 200, { room });
            return true;
        }

        // POST /api/rooms/:code/race/turn/position
        // Select the next legal position for the active race car.
        const raceTurnPositionMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/race\/turn\/position$/
        );

        if (method === "POST" && raceTurnPositionMatch) {
            const playerId = getPlayerCredential(request);
            const body = await readJsonBody(request);

            const room = roomManager.chooseActiveRaceTurnPosition(
                decodeRoomCode(raceTurnPositionMatch[1]),
                playerId,
                body.targetPosition
            );

            sendJson(response, 200, { room });
            return true;
        }

        // POST /api/rooms/:code/race/turn/undo
        // Undo the latest movement choice for the active race car.
        const raceTurnUndoMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/race\/turn\/undo$/
        );

        if (method === "POST" && raceTurnUndoMatch) {
            const playerId = getPlayerCredential(request);
            const room = roomManager.undoActiveRaceTurnPosition(
                decodeRoomCode(raceTurnUndoMatch[1]),
                playerId
            );

            sendJson(response, 200, { room });
            return true;
        }


        // POST /api/rooms/:code/race/turn/apply
        // Apply the completed movement and advance the race turn round.
        const raceTurnApplyMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/race\/turn\/apply$/
        );
        if (method === "POST" && raceTurnApplyMatch) {
            const playerId = getPlayerCredential(request);
            const room = roomManager.applyActiveRaceTurn(
                decodeRoomCode(raceTurnApplyMatch[1]),
                playerId
            );
            sendJson(response, 200, { room });
            return true;
        }

        // POST /api/rooms/:code/race/restart
        // Re-form the two-wide lineup after a yellow flag.
        const raceRestartMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/race\/restart$/
        );
        if (method === "POST" && raceRestartMatch) {
            const playerId = getPlayerCredential(request);
            const room = roomManager.restartActiveRaceAfterYellow(
                decodeRoomCode(raceRestartMatch[1]),
                playerId
            );
            sendJson(response, 200, { room });
            return true;
        }

        // POST /api/rooms/:code/race/turn/mechanical-wheel
        const raceMechanicalWheelMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/race\/turn\/mechanical-wheel$/
        );
        if (method === "POST" && raceMechanicalWheelMatch) {
            const playerId = getPlayerCredential(request);
            const room = roomManager.resolveActiveRaceMechanicalWheel(
                decodeRoomCode(raceMechanicalWheelMatch[1]),
                playerId
            );
            sendJson(response, 200, { room });
            return true;
        }

        // POST /api/rooms/:code/race/turn/wreck-wheel
        const raceWreckWheelMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/race\/turn\/wreck-wheel$/
        );
        if (method === "POST" && raceWreckWheelMatch) {
            const playerId = getPlayerCredential(request);
            const room = roomManager.resolveActiveRaceWreckWheel(
                decodeRoomCode(raceWreckWheelMatch[1]),
                playerId
            );
            sendJson(response, 200, { room });
            return true;
        }

        // PUT /api/rooms/:code/ready — change this player's ready state.
        const readyMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/ready$/
        );

        if (method === "PUT" && readyMatch) {
            const playerId = getPlayerCredential(request);
            const body = await readJsonBody(request);
            const room = roomManager.setReady(
                decodeRoomCode(readyMatch[1]),
                playerId,
                body.ready
            );

            sendJson(response, 200, { room });
            return true;
        }

        // POST /api/rooms/:code/heats/ready — confirm readiness for Heat 1.
        const heatReadyMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/heats\/ready$/
        );

        if (method === "POST" && heatReadyMatch) {
            const playerId = getPlayerCredential(request);
            const room = roomManager.setHeatReady(
                decodeRoomCode(heatReadyMatch[1]),
                playerId
            );

            sendJson(response, 200, { room });
            return true;
        }
        // POST /api/rooms/:code/season/ready — confirm readiness for the next event.
        const seasonReadyMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/season\/ready$/
        );
        if (method === "POST" && seasonReadyMatch) {
            const playerId = getPlayerCredential(request);
            const room = roomManager.setSeasonEventReady(
                decodeRoomCode(seasonReadyMatch[1]),
                playerId
            );
            sendJson(response, 200, { room });
            return true;
        }

        // POST /api/rooms/:code/race/ready — confirm readiness for the next heat/main.
        const raceReadyMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/race\/ready$/
        );
        if (method === "POST" && raceReadyMatch) {
            const playerId = getPlayerCredential(request);
            const room = roomManager.setRaceTransitionReady(
                decodeRoomCode(raceReadyMatch[1]),
                playerId
            );
            sendJson(response, 200, { room });
            return true;
        }

        // POST /api/rooms/:code/race/turn/start
        // Start the current heat or main-race car's movement turn.
        const raceTurnStartMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/race\/turn\/start$/
        );

        if (method === "POST" && raceTurnStartMatch) {
            const playerId = getPlayerCredential(request);

            const room = roomManager.startActiveRaceTurn(
                decodeRoomCode(raceTurnStartMatch[1]),
                playerId
            );

            sendJson(response, 200, { room });
            return true;
        }

        // POST /api/rooms/:code/start — host-only start action.
        const startMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/start$/
        );

        if (method === "POST" && startMatch) {
            const playerId = getPlayerCredential(request);
            const room = roomManager.startRoom(
                decodeRoomCode(startMatch[1]),
                playerId
            );

            sendJson(response, 200, { room });
            return true;
        }
                // POST /api/rooms/:code/draft/roll — submit initial draft roll.
        const draftRollMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/draft\/roll$/
        );

        if (method === "POST" && draftRollMatch) {
            const playerId = getPlayerCredential(request);
            const body = await readJsonBody(request);

            const room = roomManager.submitDraftRoll(
                decodeRoomCode(draftRollMatch[1]),
                playerId,
                body.roll
            );

            sendJson(response, 200, { room });
            return true;
        }

        // POST /api/rooms/:code/draft/reroll — break a tied draft roll.
        const draftRerollMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/draft\/reroll$/
        );

        if (method === "POST" && draftRerollMatch) {
            const playerId = getPlayerCredential(request);
            const body = await readJsonBody(request);

            const room = roomManager.submitDraftReroll(
                decodeRoomCode(draftRerollMatch[1]),
                playerId,
                body.roll
            );

            sendJson(response, 200, { room });
            return true;
        }

        // POST /api/rooms/:code/draft/pick — select a car by number.
        const draftPickMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/draft\/pick$/
        );

        if (method === "POST" && draftPickMatch) {
            const playerId = getPlayerCredential(request);
            const body = await readJsonBody(request);

            const room = roomManager.selectCar(
                decodeRoomCode(draftPickMatch[1]),
                playerId,
                body.carNumber
            );

            sendJson(response, 200, { room });
            return true;
        }


        // POST /api/rooms/:code/qualifying/next
        const qualifyingNextMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/qualifying\/next$/
        );

        if (method === "POST" && qualifyingNextMatch) {
            const playerId = getPlayerCredential(request);

            const room = roomManager.startNextQualifyingRun(
                decodeRoomCode(qualifyingNextMatch[1]),
                playerId
            );

            sendJson(response, 200, { room });
            return true;
        }
        
        // POST /api/rooms/:code/qualifying/movement/start
        const qualifyingMovementStartMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/qualifying\/movement\/start$/
        );

        if (method === "POST" && qualifyingMovementStartMatch) {
            const playerId = getPlayerCredential(request);

            const room = roomManager.startQualifyingMovementTurn(
                decodeRoomCode(qualifyingMovementStartMatch[1]),
                playerId
            );

            sendJson(response, 200, { room });
            return true;
        }
        
        // POST /api/rooms/:code/qualifying/movement/choose
        const qualifyingMovementChooseMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/qualifying\/movement\/choose$/
        );

        if (method === "POST" && qualifyingMovementChooseMatch) {
            const playerId = getPlayerCredential(request);
            const body = await readJsonBody(request);

            const room = roomManager.chooseQualifyingMovementPosition(
                decodeRoomCode(qualifyingMovementChooseMatch[1]),
                playerId,
                body.targetPosition
            );

            sendJson(response, 200, { room });
            return true;
        }
        
        // POST /api/rooms/:code/qualifying/movement/preview
        const qualifyingMovementPreviewMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/qualifying\/movement\/preview$/
        );

        if (method === "POST" && qualifyingMovementPreviewMatch) {
            const playerId = getPlayerCredential(request);
            const body = await readJsonBody(request);

            const preview = roomManager.previewQualifyingMovementRoute(
                decodeRoomCode(qualifyingMovementPreviewMatch[1]),
                playerId,
                body.positions
            );

            sendJson(response, 200, { preview });
            return true;
        }

        // POST /api/rooms/:code/qualifying/movement/confirm
        const qualifyingMovementConfirmMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/qualifying\/movement\/confirm$/
        );

        if (method === "POST" && qualifyingMovementConfirmMatch) {
            const playerId = getPlayerCredential(request);
            const body = await readJsonBody(request);

            const room = roomManager.confirmQualifyingMovementRoute(
                decodeRoomCode(qualifyingMovementConfirmMatch[1]),
                playerId,
                body.positions
            );

            sendJson(response, 200, { room });
            return true;
        }
        
        // POST /api/rooms/:code/qualifying/movement/record
        const qualifyingMovementRecordMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/qualifying\/movement\/record$/
        );

        if (method === "POST" && qualifyingMovementRecordMatch) {
            const playerId = getPlayerCredential(request);

            const room = roomManager.recordQualifyingMovementRoll(
                decodeRoomCode(qualifyingMovementRecordMatch[1]),
                playerId
            );

            sendJson(response, 200, { room });
            return true;
        }
        
        
        // POST /api/rooms/:code/qualifying/mechanical-wheel
        const qualifyingMechanicalWheelMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/qualifying\/mechanical-wheel$/
        );

        if (method === "POST" && qualifyingMechanicalWheelMatch) {
            const playerId = getPlayerCredential(request);

            const room = roomManager.resolveQualifyingMechanicalWheel(
                decodeRoomCode(qualifyingMechanicalWheelMatch[1]),
                playerId
            );

            sendJson(response, 200, { room });
            return true;
        }

        // POST /api/rooms/:code/qualifying/wreck-wheel
        const qualifyingWreckWheelMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/qualifying\/wreck-wheel$/
        );

        if (method === "POST" && qualifyingWreckWheelMatch) {
            const playerId = getPlayerCredential(request);

            const room = roomManager.resolveQualifyingWreckWheel(
                decodeRoomCode(qualifyingWreckWheelMatch[1]),
                playerId
            );

            sendJson(response, 200, { room });
            return true;
        }

        // POST /api/rooms/:code/incident/acknowledge
        const acknowledgeIncidentMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/incident\/acknowledge$/
        );

        if (method === "POST" && acknowledgeIncidentMatch) {
            const playerId = getPlayerCredential(request);

            const room = roomManager.acknowledgeIncident(
                decodeRoomCode(acknowledgeIncidentMatch[1]),
                playerId
            );

            sendJson(response, 200, { room });
            return true;
        }

        // POST /api/rooms/:code/qualifying/roll
        const qualifyingRollMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/qualifying\/roll$/
        );

        if (method === "POST" && qualifyingRollMatch) {
            const playerId = getPlayerCredential(request);
            const body = await readJsonBody(request);

            const room = roomManager.recordQualifyingRoll(
                decodeRoomCode(qualifyingRollMatch[1]),
                playerId,
                body.spaces
            );

            sendJson(response, 200, { room });
            return true;
        }

        // POST /api/rooms/:code/qualifying/finish
        const qualifyingFinishMatch = pathname.match(
            /^\/api\/rooms\/([^/]+)\/qualifying\/finish$/
        );

        if (method === "POST" && qualifyingFinishMatch) {
            const playerId = getPlayerCredential(request);
            const body = await readJsonBody(request);

            const room = roomManager.finishQualifyingRun(
                decodeRoomCode(qualifyingFinishMatch[1]),
                playerId,
                body.reason
            );

            sendJson(response, 200, { room });
            return true;
        }
        sendJson(response, 404, {
            error: {
                code: "API_ROUTE_NOT_FOUND",
                message: "That API endpoint does not exist."
            }
        });

        return true;
    } catch (error) {
        sendRoomError(response, error);
        return true;
    }
}

/*
 * Resolve and serve one requested browser file.
 */
async function serveFile(request, response) {
    if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        sendText(response, 405, "Method Not Allowed");
        return;
    }

    let pathname;

    try {
        pathname = decodeURIComponent(
            new URL(request.url, "http://localhost").pathname
        );
    } catch {
        sendText(response, 400, "Bad Request");
        return;
    }

    if (pathname === "/") {
        pathname = "/index.html";
    }

    const filePath = path.resolve(CLIENT_ROOT, `.${pathname}`);

    if (
        filePath !== CLIENT_ROOT &&
        !filePath.startsWith(CLIENT_ROOT + path.sep)
    ) {
        sendText(response, 403, "Forbidden");
        return;
    }

    let fileContents;

    try {
        fileContents = await fs.promises.readFile(filePath);
    } catch (error) {
        if (
            error.code === "ENOENT" ||
            error.code === "ENOTDIR" ||
            error.code === "EISDIR"
        ) {
            sendText(response, 404, "Not Found");
            return;
        }

        sendText(response, 500, "Internal Server Error");
        return;
    }

    const contentType =
        MIME_TYPES[path.extname(filePath).toLowerCase()] ||
        "application/octet-stream";

    response.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": fileContents.length,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache"
    });

    if (request.method === "HEAD") {
        response.end();
        return;
    }

    response.end(fileContents);
}

function createServer() {
    const roomManager = new RoomManager();

    return http.createServer(async (request, response) => {
        let url;

        try {
            url = new URL(request.url, "http://localhost");
        } catch {
            sendText(response, 400, "Bad Request");
            return;
        }

        const handledByApi = await handleApiRequest(
            request,
            response,
            url,
            roomManager
        );

        if (handledByApi) {
            return;
        }

        try {
            await serveFile(request, response);
        } catch {
            if (!response.headersSent) {
                sendText(response, 500, "Internal Server Error");
            } else {
                response.destroy();
            }
        }
    });
}

if (require.main === module) {
    const server = createServer();

    server.listen(PORT, () => {
        console.log(`Sprint Car Game server listening on port ${PORT}`);
    });

    server.on("error", (error) => {
        console.error("Unable to start the Sprint Car Game server:", error);
        process.exitCode = 1;
    });
}

module.exports = {
    createServer
};