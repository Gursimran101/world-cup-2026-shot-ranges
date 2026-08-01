# World Cup 2026 Shot Ranges

Interactive GitHub Pages app for visualizing FIFA World Cup 2026 shot and goal distances by nation.

## Data

The app uses a baked static dataset at `public/data/worldcup-2026.json`. The API key is only needed locally when regenerating that file.

```bash
cp .env.example .env.local
# add BDL_FIFA_API_KEY to .env.local
npm run data:fetch
npm run data:images
```

The fetch script pulls 2026 teams, completed matches, rosters, and per-match shots from the BALLDONTLIE FIFA World Cup API. Shot distances are computed from the API shot origin coordinates using a 105m x 68m pitch and the goal center at `x=0, y=50`.

Player image URLs are enriched from [The Guardian World Cup 2026 player guide](https://www.theguardian.com/football/ng-interactive/2026/jun/04/world-cup-2026-complete-player-guide).

Country flags are rendered from [Circle Flags](https://hatscripts.github.io/circle-flags/).

## Development

```bash
npm install
npm run data:fetch
npm run dev
```

## Build

```bash
npm run build
```

## Deploy

Push `main` to GitHub. The included GitHub Actions workflow builds the static app and deploys `dist/` to GitHub Pages.
