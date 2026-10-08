# Rocket Lab Satellite Telemetry

A small system for viewing and managing satellite telemetry.


## Overview

This is an npm monorepo with two decoupled apps:

| App | Role | Stack |
| --- | --- | --- |
| `backend/` | Telemetry API | TypeScript, Fastify, SQLite (`better-sqlite3`) |
| `frontend/` | Dashboard | TypeScript, React, Vite |

### Frontend
The frontend dashboard uses the backend, rather than a mock server, to display information. 

Key features include: 
- Heartbeat with a interval ping to inform user if connection is lost and regained
- Satellite overview section showing most recent health status metrics
  - This is only the most recent and therefore the current satellite state
  - Updates on changes to telemetry readings. 
  - color coded to call out unhealthy metrics. 
- Telemetry table
  - paginated
  - sortable on timestamp, altitude, velocity
  - filterable on satellite id and status
  - can hard delete telemetry readings
  - can add telemetry readings
    - client side checks on form
  - color coded entries bring attention to unhealthy telemetry readings
- Toast system to collocate all error messages.
- Loading spinner
- Tests

### Backend
The backend allows users to interact with telemetry data. 
Features include: 
- Health check endpoint to easily see if server and database are online. 
- Satellite endpoint to allow for easily viewing available satellites and their most current state. 
- Telemetry endpoint
  - get all telemetry, paginated, filtered, sorted
  - delete a telemetry entry by id
  - add a telemetry entry
- In memory DB using SQLite.
- Tests

## Getting started

You need **Node.js 22 or newer**. `better-sqlite3` compiles a native addon during install, so the machine also needs a C toolchain (on macOS, the Xcode command line tools).

### Start the Backend
From `backend/` run the following commands

```bash
npm install
npm run seed
npm run dev
```

This starts the API: [http://localhost:3000](http://localhost:3000)


### Start the Frontend
From `frontend/` run the following commands


```bash
npm install 
npm run dev
```

- Dashboard: [http://localhost:5173](http://localhost:5173)

Backend tests:

```bash
npm test --prefix backend
```

Frontend tests: 
```bash
npm test --prefix frontend
```

