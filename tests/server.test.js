/*
 * HTTP Server Tests
 * -----------------
 * Verifies that the browser server serves the real client files
 * and safely handles missing files, unsupported methods, HEAD
 * requests, and path traversal attempts.
 *
 * Each test starts the server on an operating-system-assigned port
 * and closes it afterward.
 */

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

test("the server can be created without immediately listening", () => {
    const server = createServer();

    assert.equal(server.listening, false);
    server.close();
});

test("the root route serves the browser entry page", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/`);
        const html = await response.text();

        assert.equal(response.status, 200);
        assert.match(
            response.headers.get("content-type"),
            /text\/html/
        );
        assert.match(html, /<title>Sprint Car Showdown<\/title>/);
        assert.match(html, /id="create-game"/);
        assert.match(html, /id="join-game"/);
        assert.match(html, /\/css\/styles\.css/);
        assert.match(html, /\/js\/app\.js/);
    });
});

test("the server delivers the stylesheet with a CSS content type", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/css/styles.css`);
        const css = await response.text();

        assert.equal(response.status, 200);
        assert.match(
            response.headers.get("content-type"),
            /text\/css/
        );
        assert.match(css, /--accent:\s*#e9ff61/);
        assert.match(css, /\.hero-art/);
        assert.match(css, /prefers-reduced-motion/);
    });
});

test("the server delivers browser JavaScript with a JavaScript content type", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/js/app.js`);
        const javascript = await response.text();

        assert.equal(response.status, 200);
        assert.match(
            response.headers.get("content-type"),
            /javascript/
        );
        assert.match(
            javascript,
            /createGameButton\.addEventListener/
        );
        assert.match(
            javascript,
            /joinGameButton\.addEventListener/
        );
        assert.match(javascript, /textContent/);
    });
});

test("missing files return 404", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/missing-file.css`);

        assert.equal(response.status, 404);
        assert.equal(await response.text(), "Not Found");
    });
});

test("unsupported HTTP methods return 405 and advertise allowed methods", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(baseUrl, {
            method: "POST"
        });

        assert.equal(response.status, 405);
        assert.equal(response.headers.get("allow"), "GET, HEAD");
        assert.equal(await response.text(), "Method Not Allowed");
    });
});

test("HEAD requests for missing files return 404 without a body", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/missing-file.css`, {
            method: "HEAD"
        });

        assert.equal(response.status, 404);
        assert.equal(await response.text(), "");
    });
});

test("HEAD requests for existing files return headers without a body", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/`, {
            method: "HEAD"
        });

        assert.equal(response.status, 200);
        assert.match(
            response.headers.get("content-type"),
            /text\/html/
        );
        assert.ok(Number(response.headers.get("content-length")) > 0);
        assert.equal(await response.text(), "");
    });
});

test("path traversal attempts cannot read files outside the client directory", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(
            `${baseUrl}/..%2F..%2Fpackage.json`
        );

        assert.ok(
            response.status === 403 || response.status === 404,
            `Expected 403 or 404, received ${response.status}`
        );

        assert.equal(
            (await response.text()).includes('"sprintcargame"'),
            false
        );
    });
});