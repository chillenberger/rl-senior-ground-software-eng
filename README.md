# Rocket Lab Satellite Telemetry

A small system for viewing and managing satellite telemetry: where a satellite was, how fast it was moving, and whether it looked healthy.

## Purpose

Ground operators need a straightforward way to record readings, look them up, filter them, and remove bad ones. This repository is that system. A REST API stores the data, and a web dashboard is the place you work with it.

The product requirements live in [`docs/client-task.md`](docs/client-task.md). That file is the source of truth. Fit the code to it; do not edit it to match the code.

## Overview

This is an npm monorepo with two apps:

| App | Role | Stack |
| --- | --- | --- |
| `backend/` | Telemetry API | TypeScript, Fastify, SQLite (`better-sqlite3`) |
| `frontend/` | Dashboard | TypeScript, React, Vite |

The dashboard talks to the API. It does not use a mock server.

A reading includes a satellite id, an ISO 8601 timestamp, altitude, velocity, and a health status (`healthy`, `anomaly`, or `critical`). Latitude and longitude are optional.

## Getting started

You need **Node.js 22 or newer**. `better-sqlite3` compiles a native addon during install, so the machine also needs a C toolchain (on macOS, the Xcode command line tools).

From the repository root:

```bash
npm install
npm run install:all
npm run dev
```

`npm install` only sets up the root scripts. `npm run install:all` installs the frontend and backend.

That starts both apps:

- API: [http://localhost:3000](http://localhost:3000)
- Dashboard: [http://localhost:5173](http://localhost:5173)

Run one side on its own:

```bash
npm run dev:backend
npm run dev:frontend
```

Build both, then run the API and a local preview of the dashboard:

```bash
npm run build
npm start --prefix backend
npm run preview --prefix frontend
```

Backend tests:

```bash
npm test --prefix backend
```

## Docs 
Refer to `/docs` for design decisions, client needs, development plan, running task list. 