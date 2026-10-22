# Context and queued-retry evidence

Backend integration receipts for nuphos/nuphos PRs711 and712. These are **not app screenshots or a completed full-app demonstration**.

- Before: upstream commit3ddfc44a8d1e1e50e0be96e3338b3b39775312db.
- Reader after: the exact source published in PR711 atd4508469e6ff8d05266bf5fb2e74c04a17999c08.
- Queue after: the exact source published in PR712 at1566200637c680d5001dbefe2b822a370a3b66f0.
- Both fixes live together in the local after checkout; they change disjoint paths.

##711: real HTTP MCP request

Two local full backend servers, each with neutral MongoDB conversations, answered the same `tools/call` request for `read_conversation`. Both returned HTTP200. The old response omits the persisted correction; the fixed response contains `Demo (during this turn): Use green instead of blue.` Raw responses are preserved alongside the summary.

`boot.ts` starts each local backend with separate generated demo credentials and seeded MongoDB data. `read-tool.ts` submits the real HTTP request. Neither replaces the tool handler or database reader. The source conversation is deliberately short, so this verifies receipt preservation rather than long-context retention.

##712: real database and production queue handoff

`queue-integration.ts` inserts one neutral persisted input into MongoDB and invokes the production `launchQueuedChatTurn` with the matching app message at `attempts:1`. No database or queue handler is mocked.

Before: no retry run is registered, no turn-start frame contains the message, and the claim is released. After: a retry run is registered and its turn-start frame includes the same input. The run is immediately cancelled after registration; this proves queue admission, **not completed model execution**. The development runtime endpoint uses its existing local transport configuration; it is not a replacement model server.

## Reproduction prerequisites

Use the repository's local Docker development stack (`nuphos-dev-mongo-1`, `nuphos-dev-runtime-1`, `nuphos-dev-rustfs-1`) and installed dependencies. Put the base checkout at `nuphos-evidence-before`, the fixed checkout at `nuphos-chat-target`, and these files under `artifacts/nuphos-context-proof` in their common workspace.

Run `bun artifacts/nuphos-context-proof/boot.ts before` and `bun artifacts/nuphos-context-proof/boot.ts after` in separate terminals, then `bun artifacts/nuphos-context-proof/read-tool.ts`. For the queue comparison run `bun ../../../artifacts/nuphos-context-proof/queue-integration.ts before` from the base `apps/backend` and the corresponding `after` command from the fixed `apps/backend`. The queue script uses only newly generated session ids in dedicated proof databases. Stop the backend processes afterward. Local generated credential/profile files must never be published.

## Full-app limitation

The actual Electron build launched against the after backend. A native UI submission reached the real runtime, but Claude Code failed OAuth refresh. One bounded later retry reported `OAuth session expired and could not be refreshed`. No screenshot or video of that unrelated authentication failure is presented as proof of either fix. Light/dark completed app recordings remain blocked until that demo runtime is signed in again.
