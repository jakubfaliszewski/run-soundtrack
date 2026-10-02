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
│   ├── PlaylistBuilder.tsx   Sidebar playlist builder (search, coverage, undo, auto-apply, save to Spotify)
│   ├── SpotifyPicker.tsx     Spotify login + playlist grid
│   ├── Wizard.tsx            Onboarding: GPX → pace → playlist
│   ├── MapView.tsx           Leaflet map with shadow halos and distance pin
│   ├── PlaylistPanel.tsx     Active playlist panel (Change / Build / Edit)
│   ├── Timeline.tsx          Distance timeline + elevation profile with hover tooltip
│   ├── TrackArt.tsx          Album art with 30s preview player and Spotify deep-link
│   ├── RunSetup.tsx          Pace/route editor overlay
│   ├── RunSummary.tsx        Run stats, elevation gain/loss, start/finish track summary
│   └── TrackItem.tsx         Single track row in the playlist panel
├── lib/
│   ├── engine.ts             Soundtrack engine (client-side mirror) + GPX elevation smoother
│   ├── spotify.ts            PKCE auth + Spotify API: search, preview URL, create/add playlist tracks
│   ├── storage.ts            localStorage helpers
│   ├── api.ts                Server API calls
│   ├── format.ts             Time/distance/pace/elevation formatting
│   └── __tests__/            Vitest test suites
├── data/
│   └── demoPlaylist.ts       25 built-in tracks
└── types/
    └── domain.ts             Shared domain types (Track, Route, DraftPlaylist, …)
```

## Key behaviours

### Playlist builder auto-apply
The builder no longer has a "Generate soundtrack" button. Changes to the track list or playlist name are debounced 300 ms and then applied automatically — the map and timeline update live while you edit.

### Elevation profile
The timeline bar is preceded by an SVG area chart of the route's elevation. GPX elevation data is smoothed with a ±7-point moving average to remove GPS noise before display. Hovering the chart shows distance, altitude, and incline % at that point; the position is simultaneously pinned on the map.

### Map distance pin
Hovering anywhere on the timeline (elevation area or the coloured segment bar) drops a white circle marker on the map at the corresponding route position.

### Spotify preview player
`TrackArt` renders album art in all track list views. If the track has a `previewUrl` (from the Spotify API search response), hovering reveals a ▶/⏸ button that plays a 30-second clip. If there's no preview but there is a `spotifyUri`, the art becomes a deep-link to open the track in Spotify.

> **Note:** Spotify's `/audio-features` BPM endpoint returns 403 for apps without explicit allowlisting. BPM display is not implemented.

## Theming

The stylesheet uses CSS custom properties for all colours. Dark theme is the default (`:root`); light theme overrides via `[data-theme="light"]` on `<html>`. Toggle with the `☀/☾` button in the header.

## TypeScript

```bash
cd client && npx tsc --noEmit
```
