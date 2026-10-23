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