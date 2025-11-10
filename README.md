# Borealis Hub

Vue 3 + Vite client with an Express API server in a simple npm workspaces monorepo.

## Quickstart

- Install dependencies: `npm install`
- Run both client and server: `npm run dev`
- Open the app: http://localhost:5173

The client proxies API calls from `/api/*` to the Express server on `http://localhost:5001`.

## Scripts

- `npm run dev` — run client (Vite) and server (Express) together
- `npm run start` — start only the Express server
- `npm run build` — build the client for production
- `npm --prefix client run dev` — run only the client
- `npm --prefix server run dev` — run only the server (with nodemon)

## API

- `GET /api/hello` → `{ "message": "Hello from Borealis Hub API" }`
- `GET /api/aurora?lat=..&lon=..` → `{"ok":true,"probability":XX,"timestamps":{"forecast":"..."},"source":"NOAA OVATION (SWPC)","cloud":{"cover":NN,"status":"Visibile|Coperto"}}`

Notes:
- Aurora probability computed from NOAA SWPC OVATION latest grid at nearest point.
- Cloud cover from Open‑Meteo at the nearest hour in UTC. Optional; omitted if fetch fails.

## Env

- Copy `server/.env.example` to `server/.env` to customize the API port (defaults to 5001).
