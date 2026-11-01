# Cloudflare migration — API routing milestone

This milestone moves the existing room API request handling into a Cloudflare
Durable Object while preserving the existing API paths and RoomManager rules.

## Included

- `worker.js` routes `/api/*` requests to a named Durable Object and serves
  browser assets through the Workers Assets binding.
- `room-durable-object.js` adapts Fetch requests to the existing tested
  Node-style API handler, serializes requests, restores the RoomManager from
  Durable Object storage, and saves state after each API request.
- Existing room creation, join, read, draft, qualifying, race, readiness, and
  season routes continue to use the same `RoomManager` implementation.
- Internal snapshot endpoints remain available to trusted Durable Object
  callers for diagnostics and migration tests.
- `migrations/0001_initial.sql` remains the initial D1 schema.

## Architecture note

For this first working API migration, all room codes are handled by one named
Durable Object (`global-room-manager`). This keeps the current in-memory
`RoomManager` semantics and allows serialized room updates. It is a
correctness-first starting point, not the final horizontal-scaling design.
A later milestone can shard rooms into separate Durable Objects.

D1 is bound but is not yet used by gameplay requests. Durable Object storage is
the authoritative store for the room manager snapshot at this stage.

## Deployment prerequisites

1. Replace the D1 `database_id` placeholder in `wrangler.toml` with the actual
   database ID from Cloudflare.
2. Confirm the Worker has the `DB` D1 binding and `ROOMS` Durable Object
   binding, and that the `v1` SQLite-class migration is applied.
3. Deploy only after local tests and a Cloudflare preview deployment pass.

Supabase Auth and profile integration are not included yet. Do not put a
Supabase secret key in browser code or commit it to this repository.

## Supabase account profile API (initial milestone)

Configure the Worker variable `SUPABASE_URL` with the public project URL. No Supabase secret key is required for this endpoint. Supabase Auth issues the user's access token; the Worker validates its signature against the project's published JWKS and validates issuer, audience, expiry, and subject before allowing access to D1.

- `GET /api/account/profile` returns the signed-in user's profile or `null`.
- `PUT /api/account/profile` accepts `{ "displayName": "..." }` and creates/updates that user's profile.
- Both routes require `Authorization: Bearer <Supabase access token>`.
- Profile ownership is derived from the verified JWT subject, never from the request body.

This is backend profile storage only. Browser signup/login UI and account-to-saved-room membership integration are not yet connected.

## Required accounts for all multiplayer games

The public Worker now verifies a Supabase access token before forwarding **any** game API request (`/api` and `/api/*`). This includes room creation, room joining, room retrieval, and every gameplay action. Requests without a valid signed-in account receive HTTP 401 before reaching the Durable Object. The Worker overwrites `X-Account-Id` with the verified JWT subject; callers cannot choose this identity themselves.

The browser game client obtains the current Supabase session token and sends it as `Authorization: Bearer <access token>` with every game API request. If the player is signed out, it stops the request and asks them to create an account or sign in. The profile API continues to enforce authentication independently. `/api/health` remains a public health-check endpoint and does not create or join games.

This gate is enforced at the Cloudflare Worker production entry point. The legacy standalone Node development server is still intended for local development/tests and does not yet perform Supabase authentication; do not expose that server directly to the public internet.


## Account-linked saved games

The Worker verifies Supabase access tokens and forwards the verified account ID to the room Durable Object. Room creation and joining attach that account ID to the private player record in the Durable Object snapshot. The Durable Object writes the `saved_games` and `saved_game_players` index rows in D1. `GET /api/account/games` returns only the signed-in account's memberships. `POST /api/rooms/:code/rejoin` checks the account ID against the persisted room member record before returning that player's private room credential.

Apply the D1 schema before deploying this milestone:

```powershell
npx wrangler d1 execute sprint-car-showdown-db --remote --file=./migrations/0001_initial.sql
```

The D1 database ID in `wrangler.toml` must be replaced with the ID of the actual database created in the Cloudflare account. Never put Supabase secret/service-role keys in Worker vars; the browser uses the public publishable key and the Worker validates Supabase access tokens using the project's JWKS endpoint.
