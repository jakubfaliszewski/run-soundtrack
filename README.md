# Run Soundtrack

> "If I run this route at this pace, what song will be playing at every point of my run?"

Map your playlist to your route. Upload a GPX file, set a target time and pacing strategy, and the app calculates exactly which song plays at each kilometre of your run — visualised on an interactive OpenStreetMap map with per-song polyline segments, transition markers, and a distance timeline.

No API keys required to run. Spotify integration is optional.

<img width="3356" height="1920" alt="image" src="https://github.com/user-attachments/assets/bc01d756-8382-43c4-bece-b920e4df791d" />


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

Spotify login is **fully client-side** using PKCE — no client secret, no server involvement for user auth.

### User login (browse your private playlists)

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and **create an app**.
2. In your app settings, add this **Redirect URI**:
   ```
   http://localhost:5173
   ```
3. Create `client/.env.local` with your Client ID:
   ```bash
   VITE_SPOTIFY_CLIENT_ID=your_client_id_here
   ```
4. Restart the Vite dev server (`npm run dev` in `client/`). The **"Log in with Spotify"** button will appear.

The browser handles the full PKCE flow — no client secret is ever needed or exposed.

### Public playlist URL import (no login)

Paste any public Spotify playlist URL in the picker. This uses the server's Client Credentials flow and requires both credentials in `server/.env`:

```bash
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

### No Spotify at all

The app works fine without any Spotify setup. The built-in demo playlist of 25 tracks is always available.

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
| `server/src/routes/spotify.ts` | Public playlist import endpoint (client credentials) |
| `client/src/lib/engine.ts` | Client-side mirror of the engine (offline fallback) |
| `client/src/lib/spotify.ts` | Client-side PKCE auth + Spotify API calls |
| `client/src/lib/api.ts` | Server API calls (GPX parse, soundtrack, public playlist import) |
| `client/src/lib/storage.ts` | LocalStorage: route + Spotify token persistence |
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

### `GET /api/spotify/playlist?url=<spotify-url>`

Fetches a **public** playlist by URL using server-side Client Credentials. Requires `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` in `server/.env`.

> User login (OAuth PKCE) is handled entirely in the browser via `client/src/lib/spotify.ts` — no server endpoints involved.

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
