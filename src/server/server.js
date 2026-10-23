/*
 * Sprint Car Game HTTP Server
 * ---------------------------
 * Serves the browser client using Node's built-in HTTP module.
 *
 * This server deliberately does not modify or initialize the game
 * engine yet. The browser foundation is being established separately
 * so it can be tested before game integration begins.
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// All browser-facing files must live inside this directory.
const CLIENT_ROOT = path.resolve(__dirname, "../client");

// Use the hosting provider's port when supplied, otherwise use 3000.
const PORT = Number(process.env.PORT) || 3000;

// Explicit MIME types prevent browsers from guessing file formats.
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

/*
 * Send a plain-text response with a consistent content type.
 */
function sendText(response, statusCode, message) {
    response.writeHead(statusCode, {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store"
    });

    response.end(message);
}

/*
 * Resolve and serve one requested browser file.
 */
async function serveFile(request, response) {
    // Only GET and HEAD requests are needed for the initial browser UI.
    if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        sendText(response, 405, "Method Not Allowed");
        return;
    }

    let pathname;

    try {
        // Parse the URL and decode its path. Invalid encodings are rejected.
        pathname = decodeURIComponent(
            new URL(request.url, "http://localhost").pathname
        );
    } catch {
        sendText(response, 400, "Bad Request");
        return;
    }

    // The site root serves the browser entry page.
    if (pathname === "/") {
        pathname = "/index.html";
    }

    // Resolve the requested path against the browser directory.
    const filePath = path.resolve(
        CLIENT_ROOT,
        `.${pathname}`
    );

    // Prevent path traversal outside src/client.
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

    // HEAD returns the same headers as GET without the response body.
    if (request.method === "HEAD") {
        response.end();
        return;
    }

    response.end(fileContents);
}

/*
 * Create a server instance without starting it immediately.
 *
 * Exporting the factory allows automated tests to use a temporary
 * local port without launching a separate Node process.
 */
function createServer() {
    return http.createServer((request, response) => {
        serveFile(request, response).catch(() => {
            if (!response.headersSent) {
                sendText(response, 500, "Internal Server Error");
            } else {
                response.destroy();
            }
        });
    });
}

// Start listening only when this file is run directly with Node.
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