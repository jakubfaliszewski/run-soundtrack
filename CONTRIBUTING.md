# Contributing

Contributions are welcome. Here's how to get started.

## Development setup

```bash
# Install all dependencies (root, client, server)
npm install

# Run both dev servers concurrently
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

## Running tests

```bash
npm test
```

All 27 unit tests live in `server/src/services/__tests__/engine.test.ts` and cover the pure calculation functions — haversine, GPX parsing, pace, timed route, interpolation, and soundtrack engine.

## Project structure

```
run-soundtrack/
├── client/               React + Vite frontend
│   └── src/
│       ├── components/   UI components
│       ├── lib/          engine.ts (calculations), api.ts, storage.ts, format.ts
│       ├── data/         demoPlaylist.ts
│       └── types/        domain.ts
└── server/               Fastify backend
    └── src/
        ├── routes/       route.ts, spotify.ts
        ├── services/     gpxParser.ts, soundtrackEngine.ts, distance.ts
        ├── data/         demoPlaylist.ts
        └── types/        domain.ts
```

## Key architectural rule

The **soundtrack engine** (`soundtrackEngine.ts`) must never depend on where the playlist came from. It receives `Track[]` and returns `Soundtrack`. Keep it that way.

## Pull requests

- Keep changes focused and minimal.
- Add or update tests for any calculation logic changes.
- Run `npm test` and `npx tsc --noEmit` in both `client/` and `server/` before opening a PR.
