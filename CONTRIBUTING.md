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

77 unit tests across three suites:

| Suite | File | What it covers |
|---|---|---|
| Engine | `client/src/lib/__tests__/engine.test.ts` | Haversine, GPX parsing, pace calculation, timed route, interpolation, soundtrack engine |
| Storage | `client/src/lib/__tests__/storage.test.ts` | Route, run plan, playlist, draft playlist, and Spotify token persistence |
| Spotify | `client/src/lib/__tests__/spotify.test.ts` | `SpotifyForbiddenError`, `hasWriteScopes`, `searchTracks`, `createSpotifyPlaylist`, `addTracksToSpotifyPlaylist` |

Run TypeScript checks before opening a PR:

```bash
cd client && npx tsc --noEmit
cd server && npx tsc --noEmit
```

## Project structure

```
run-soundtrack/
├── client/               React + Vite frontend
│   └── src/
│       ├── components/   UI components
│       │   ├── PlaylistBuilder.tsx   ← in-app playlist builder
│       │   ├── SpotifyPicker.tsx     ← Spotify login + playlist grid
│       │   ├── Wizard.tsx            ← onboarding flow
│       │   └── ...
│       ├── lib/          engine.ts, api.ts, storage.ts, spotify.ts, format.ts
│       │   └── __tests__/
│       ├── data/         demoPlaylist.ts
│       └── types/        domain.ts
└── server/               Fastify backend
    └── src/
        ├── routes/       route.ts, spotify.ts
        ├── services/     gpxParser.ts, soundtrackEngine.ts, distance.ts
        ├── data/         demoPlaylist.ts
        └── types/        domain.ts
```

## Key architectural rules

**1. The soundtrack engine receives only `Track[]`.**
It must never know where the playlist came from — Spotify import, demo, or the in-app builder. Keep it that way.

**2. Spotify write calls stay client-side.**
`createSpotifyPlaylist` and `addTracksToSpotifyPlaylist` call the Spotify Web API directly from the browser using the user's PKCE token. Do not route these through the server.

**3. Draft playlist state lives in `localStorage` only.**
No server-side playlist entity. `saveDraftPlaylist` / `loadDraftPlaylist` in `storage.ts` are the only persistence layer.

**4. Write scopes are opt-in.**
`startLogin(withWriteScopes = false)` — only pass `true` when the user explicitly attempts to save to Spotify. Do not request `playlist-modify-*` for search or import.

## Theming

All colours are CSS custom properties defined on `:root` (dark) and `[data-theme="light"]`. The Sass `$color-*` variables are thin aliases to `var(--color-*)`, so every existing selector works unchanged with both themes. The active theme is stored in `localStorage` under `rs_theme_v1` and applied with `data-theme` on `<html>` before first paint to avoid flash.

To add a new colour token, add it to both the `:root` and `[data-theme="light"]` blocks at the top of `client/src/index.scss`.

## Spotify API notes

- Track search: `GET /v1/search?type=track&q=…&limit=10`
- Create playlist: `POST /v1/me/playlists` (body: JSON)
- Add tracks: `POST /v1/playlists/{id}/items?uris=…` (URIs as comma-separated query parameter — the `/tracks` endpoint was removed by Spotify in February 2026)

## Pull requests

- Keep changes focused and minimal.
- Add or update tests for any calculation or service logic changes.
- Run `npm test` and both `tsc --noEmit` checks before opening a PR.
