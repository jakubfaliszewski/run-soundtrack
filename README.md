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
- **In-app playlist builder** — search Spotify tracks, add/remove/reorder them into a custom playlist, see live duration, and save as a new Spotify playlist — all without leaving the app
- **Spotify integration** — log in with Spotify (OAuth PKCE) to browse and select from your own playlists; or paste any public playlist URL (no login needed)
- **Save to Spotify** — create a new private or public playlist directly from the builder with one click
- **Start / finish track summary** — always see which song plays at the gun and at the finish line
- **Demo playlist** — 25 tracks built in; app is fully usable without any Spotify account
- **Light / dark mode** — toggle with one click; preference persists across sessions
- **Offline fallback** — if the server is unreachable, all calculations run client-side
- **LocalStorage persistence** — last uploaded route and current draft playlist survive a page refresh
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

77 unit tests across three suites:

| Suite | Tests | What it covers |
|---|---|---|
| `engine.test.ts` | 35 | Haversine, GPX parsing, pace calculation, timed route, time→distance interpolation, GPS interpolation, soundtrack engine |
| `storage.test.ts` | 20 | Route, run plan, playlist, draft playlist, and Spotify token persistence |
| `spotify.test.ts` | 22 | `SpotifyForbiddenError`, `hasWriteScopes`, `searchTracks` mapping, `createSpotifyPlaylist`, `addTracksToSpotifyPlaylist` |

---

## Spotify Setup (optional)

Spotify login is **fully client-side** using PKCE — no client secret, no server involvement for user auth.

### User login (browse and build playlists)

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

### Scopes

The app requests different OAuth scopes depending on what the user is doing:

| Action | Scopes requested |
|---|---|
| Browse/import playlists | `playlist-read-private`, `playlist-read-collaborative` |
| Save a built playlist to Spotify | + `playlist-modify-private`, `playlist-modify-public` |

Write scopes are only requested when the user explicitly clicks **Save to Spotify**.

### Developer Mode note

Spotify apps in Development Mode can only make write API calls on behalf of users added under **Settings → User Management** in the Developer Dashboard. Add your Spotify username there if you encounter 403 errors when saving playlists.

### Public playlist URL import (no login)

Paste any public Spotify playlist URL in the picker. This uses the server's Client Credentials flow and requires both credentials in `server/.env`:

```bash
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

### No Spotify at all

The app works fine without any Spotify setup. The built-in demo playlist of 25 tracks is always available.

---

## Playlist Builder

The in-app playlist builder lets you construct a custom running playlist from scratch:

```
Create Playlist

Name
[ My Running Playlist ]

Search Spotify                    Your playlist
[ 🔍 Search tracks… ]
                                  1. The Pretender        4:29
The Pretender                     2. Hysteria              3:45
Foo Fighters          [+]        3. Everlong              4:10
4:29
                                  ─────────────────────────────
Everlong                          Total  12:24
Foo Fighters          [+]
4:10                              [ Save to Spotify ]
                                  [ Generate soundtrack ]
```

- Debounced search (300 ms), up to 10 results per query
- Drag-and-drop reorder, or use ↑ / ↓ buttons
- Duplicate tracks allowed (same song can appear multiple times)
- **Live coverage panel** — shows playlist duration, run duration, coverage %, and a progress bar; updates on every edit
- **Undo** — remove or reorder a track and get a 3-second toast to undo it
- **Auto-named** — playlist name pre-filled as `{Route} — {target time}`, never overwritten once you type your own
- **Autosave indicator** — "✓ Saved" / "Saving…" feedback next to the name field
- **Edit from result screen** — open the builder pre-loaded with the current active playlist via the **Edit** button in the playlist panel
- **Back to playlist** — after generating a soundtrack, re-open the builder to iterate without starting over
- Draft auto-saved to `localStorage` — survives a page refresh
- **Save to Spotify** creates a new playlist (private by default) and adds all tracks in the current order

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

The **Soundtrack Engine** is a pure function — it receives `Route`, `TimedRoute`, and `Track[]`. It has no knowledge of Spotify, GPX, or React. Tracks from an imported playlist, the demo, or the in-app builder are all identical from the engine's perspective.

### Module map

| Path | Role |
|---|---|
| `server/src/services/soundtrackEngine.ts` | Core calculation: pacing, timed route, interpolation, soundtrack |
| `server/src/services/gpxParser.ts` | GPX XML → `Route` |
| `server/src/services/distance.ts` | Haversine formula |
| `server/src/routes/route.ts` | `POST /api/routes/parse`, `POST /api/soundtrack` |
| `server/src/routes/spotify.ts` | Public playlist import endpoint (client credentials) |
| `client/src/lib/engine.ts` | Client-side mirror of the engine (offline fallback) |
| `client/src/lib/spotify.ts` | PKCE auth + Spotify API: search, create playlist, add tracks |
| `client/src/lib/api.ts` | Server API calls (GPX parse, soundtrack, public playlist import) |
| `client/src/lib/storage.ts` | LocalStorage: route, run plan, playlist, draft playlist, tokens |
| `client/src/components/Wizard.tsx` | Onboarding flow (GPX → pace → playlist choice) |
| `client/src/components/PlaylistBuilder.tsx` | In-app playlist builder (search, edit, save to Spotify) |
| `client/src/components/MapView.tsx` | Leaflet map with segments, markers, tooltips |
| `client/src/components/SpotifyPicker.tsx` | Spotify login + playlist grid |
| `client/src/components/PlaylistPanel.tsx` | Active playlist panel with Change / Build / Edit actions |
| `client/src/components/RunSummary.tsx` | Run stats + start/finish track summary |
| `client/src/components/Timeline.tsx` | Distance-proportional timeline bar |

### Domain types

```ts
type Track = {
  id: string;
  title: string;
  artist: string;
  durationSeconds: number;
  source?: "demo" | "spotify";
  provider?: "demo" | "spotify";
  providerTrackId?: string;       // Spotify track ID
  spotifyUri?: string;            // e.g. "spotify:track:abc123"
  artworkUrl?: string;
  externalId?: string;
};

type DraftPlaylist = {
  id: string;
  name: string;
  tracks: Track[];
};

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

> User login (OAuth PKCE) and the playlist builder (search, create, add tracks) are handled entirely in the browser via `client/src/lib/spotify.ts` — no server endpoints involved.

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
