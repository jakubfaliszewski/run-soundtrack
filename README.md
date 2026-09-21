# Run Soundtrack

> "If I run this route at this pace, what song will be playing at every point of my run?"

Map your playlist to your route. Upload a GPX file, set a target time and pacing strategy, and the app calculates exactly which song plays at each kilometre of your run — visualised on an interactive OpenStreetMap map with per-song polyline segments, transition markers, and a distance timeline.

No API keys required to run. Spotify integration is optional.

---

## Features

- **GPX import** — drag-and-drop or file picker; supports multi-segment tracks
- **Pacing strategies** — even pace, negative split, positive split with configurable intensity
- **Soundtrack calculation** — assigns songs sequentially to run time, converts time → distance → GPS coordinate for each song boundary
- **Interactive map** — per-song coloured polylines, start/finish/transition markers, hover tooltips, click to select
- **Timeline** — distance-proportional bar of all songs; click or hover to highlight the corresponding map segment
- **Spotify integration** — log in with Spotify (OAuth PKCE) to browse and select from your own playlists; or paste any public playlist URL (no login needed)
- **Demo playlist** — 25 tracks built in; app is fully usable without any Spotify account
- **Offline fallback** — if the server is unreachable, all calculations run client-side
- **LocalStorage persistence** — last uploaded route survives a page refresh
- **No database, no accounts** required

---

## Getting Started

### Requirements

- Node.js ≥ 18
- npm ≥ 10

### Install

```bash
git clone https://github.com/jakubfaliszewski/run-soundtrack.git
cd run-soundtrack
npm install
```

### Run in development

```bash
npm run dev
```

This starts both servers concurrently:

| Process | URL |
|---|---|
| Vite dev server (frontend) | http://localhost:5173 |
| Fastify API server (backend) | http://localhost:3001 |

### Run server and client separately

```bash
npm run dev:server   # terminal 1
npm run dev:client   # terminal 2
```

### Tests

```bash
npm test
```

27 unit tests covering haversine, GPX parsing, pace calculation, timed route, time→distance interpolation, GPS interpolation, and the full soundtrack engine.

---

## Spotify Setup (optional)

Two modes of Spotify integration are available:

### Mode 1: User login (full access to private playlists)

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and create an app.
2. In your app settings, add this **Redirect URI**:
   ```
   http://localhost:3001/api/spotify/callback
   ```
3. Copy your credentials into `server/.env` (create it from `server/.env.example`):
   ```bash
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   ```
4. Restart the server. The **"Log in with Spotify"** button will appear in the playlist picker.

The login flow uses **PKCE** (Proof Key for Code Exchange) — the client secret stays on the server and is never exposed to the browser.

### Mode 2: Public playlist URL (no login)

If you set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`, you can also paste any **public** Spotify playlist URL directly in the app — no user login required. This uses the Client Credentials flow.

### No Spotify at all

The app works fine without any Spotify credentials. The demo playlist of 25 tracks is always available.

---

## Architecture

```
GPX file
  └─▶ Route (points + cumulative distance)
        └─▶ RunPlan (target time + pacing strategy)
              └─▶ TimedRoute (each point gains elapsedSeconds)
                    └─▶ Soundtrack Engine
                          ├─▶ Track[] (from any source)
                          └─▶ Soundtrack (segments with GPS bounds)
                                └─▶ Map + Timeline + Playlist Panel
```

The **Soundtrack Engine** is a pure function — it receives `Route`, `TimedRoute`, and `Track[]`. It has no knowledge of Spotify, GPX, or React. This separation is intentional and must be preserved.

### Module map

| Path | Role |
|---|---|
| `server/src/services/soundtrackEngine.ts` | Core calculation: pacing, timed route, interpolation, soundtrack |
| `server/src/services/gpxParser.ts` | GPX XML → `Route` |
| `server/src/services/distance.ts` | Haversine formula |
| `server/src/routes/route.ts` | `POST /api/routes/parse`, `POST /api/soundtrack` |
| `server/src/routes/spotify.ts` | All Spotify endpoints (OAuth + playlist fetch) |
| `client/src/lib/engine.ts` | Client-side mirror of the engine (offline fallback) |
| `client/src/lib/api.ts` | All API calls |
| `client/src/lib/storage.ts` | LocalStorage: route persistence + Spotify session key |
| `client/src/components/Wizard.tsx` | Onboarding flow (GPX → pace → playlist) |
| `client/src/components/MapView.tsx` | Leaflet map with segments, markers, tooltips |
| `client/src/components/SpotifyPicker.tsx` | Spotify login + playlist grid |
| `client/src/components/Timeline.tsx` | Distance-proportional timeline bar |

### Domain types

```ts
type Route = { points: RoutePoint[]; totalDistanceMeters: number; elevationGainMeters?: number };

type RunPlan = { targetTimeSeconds: number; strategy: RunStrategy; startPaceSecondsPerKm: number; endPaceSecondsPerKm: number };

type Track = { id: string; title: string; artist: string; durationSeconds: number; source?: "demo" | "spotify"; externalId?: string };

type SoundtrackSegment = {
  track: Track;
  startTimeSeconds: number; endTimeSeconds: number;
  startDistanceMeters: number; endDistanceMeters: number;
  startCoordinate: Coordinate; endCoordinate: Coordinate;
};
```

---

## API Reference

### `POST /api/routes/parse`

Multipart file upload. Accepts `.gpx`. Returns a `Route`.

### `POST /api/soundtrack`

```json
{ "route": {}, "runPlan": {}, "tracks": [] }
```

Returns `{ timedRoute, soundtrack }`.

### `GET /api/spotify/status`

Returns `{ configured: boolean }` — whether server has Spotify credentials set.

### `GET /api/spotify/login`

Redirects to Spotify's OAuth authorization page. Requires credentials in `.env`.

### `GET /api/spotify/callback`

OAuth callback. Redirects back to the client with `?spotify_session=<key>`.

### `GET /api/spotify/me`

Returns the authenticated user's profile. Requires `x-spotify-session` header.

### `GET /api/spotify/me/playlists`

Returns all the user's playlists. Requires `x-spotify-session` header.

### `GET /api/spotify/me/playlists/:id/tracks`

Returns `Track[]` for a playlist. Requires `x-spotify-session` header.

### `GET /api/spotify/playlist?url=<spotify-url>`

Fetches a **public** playlist by URL using Client Credentials. No user session needed.

### `POST /api/spotify/logout`

Invalidates the server-side session. Requires `x-spotify-session` header.

---

## Pacing strategies

| Strategy | Description |
|---|---|
| `even` | Constant pace: `startPace === endPace` |
| `negative_split` | Starts slow, finishes fast: `startPace > endPace` |
| `positive_split` | Starts fast, fades: `startPace < endPace` |

Split intensity is configurable (5 – 30%). Both paces are derived from the average and then scaled so the timed model integrates to **exactly** the target time.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite 7 |
| Styles | SCSS (no CSS framework) |
| Map | Leaflet + React-Leaflet + OpenStreetMap |
| Backend | Node.js, TypeScript, Fastify 5 |
| GPX parsing | fast-xml-parser |
| Tests | Vitest |
| Package management | npm workspaces |

No database. No Docker required. No paid services required.

---

## License

[MIT](./LICENSE) © Jakub Faliszewski
