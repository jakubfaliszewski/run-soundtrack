# Run Soundtrack — Client

React + TypeScript + Vite frontend for Run Soundtrack.

## Development

```bash
# From the repo root
npm run dev          # starts both client and server

# Or client only
npm run dev:client
```

Dev server runs at **http://localhost:5173**.

## Tests

```bash
cd client
npx vitest run
```

77 unit tests across three suites — engine, storage, and Spotify service.

## Environment variables

Create `client/.env.local` (not committed):

```bash
# Required for Spotify login and the in-app playlist builder
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id
```

Without this the app still works — the demo playlist and the server-side public URL import remain available.

## Source layout

```
src/
├── components/
│   ├── PlaylistBuilder.tsx   In-app playlist builder (search, coverage, undo, save to Spotify)
│   ├── SpotifyPicker.tsx     Spotify login + playlist grid
│   ├── Wizard.tsx            Onboarding: GPX → pace → playlist
│   ├── MapView.tsx           Leaflet map
│   ├── PlaylistPanel.tsx     Active playlist panel (Change / Build / Edit)
│   ├── Timeline.tsx          Distance timeline bar
│   ├── RunSetup.tsx          Pace/route editor overlay
│   ├── RunSummary.tsx        Run stats + start/finish track summary
│   └── TrackItem.tsx         Single track row
├── lib/
│   ├── engine.ts             Soundtrack engine (client-side mirror)
│   ├── spotify.ts            PKCE auth + Spotify API calls
│   ├── storage.ts            localStorage helpers
│   ├── api.ts                Server API calls
│   ├── format.ts             Time/distance/pace formatting
│   └── __tests__/            Vitest test suites
├── data/
│   └── demoPlaylist.ts       25 built-in tracks
└── types/
    └── domain.ts             Shared domain types (Track, Route, DraftPlaylist, …)
```

## Theming

The stylesheet uses CSS custom properties for all colours. Dark theme is the default (`:root`); light theme overrides via `[data-theme="light"]` on `<html>`. Toggle with the `☀/☾` button in the header.

## TypeScript

```bash
cd client && npx tsc --noEmit
```
