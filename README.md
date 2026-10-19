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
- Heartbeat with a interval ping to inform user of api connection status
- Satellite overview section showing satellites with Out-of-Spec readings 
  - This is only the most recent and therefore the current satellite state
  - This will updates on changes to telemetry rows from the dashboard 
  - It is color coded to draw attention to unhealthy metrics
- Telemetry table
  - paginated
  - sortable on desired telemetry
  - filterable on satellite id
  - filterable telemetry to desired telemetry type
  - allows user to hard delete telemetry readings
  - allows user to add telemetry readings
    - client side checks on form
  - color coded entries draw attention to Out-of-Spec readings
- Toast system to colocate all error messages.
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
- Telemetry parameters gives list of telemetry types applicable to that satellite. 
- In memory DB using SQLite.
- Derived telemetry with derived check and derived specs. 
- Tests

## Getting started

### Start the Backend
refer to `/backend/README.md` to get started.


### Start the Frontend
refer to `/frontend/README.md` to get started.


## Derived Telemetry Notes 
This application has been updated to handle general derived telemetry.  To do this I updated the telemetry table to hold measurements rather than a specified schema.  I also added a telemetry parameters table that contains all information about a telemetry measurement including 
 - equation (if derived)
 - units 
 - deprecated_at (to handle equation revs)
 - metadata (for any information the client desires to include like description, rev, ect...)

This system collects data piecewise, meaning we can't guarantee if or when we will have enough information to calculate derived data.  To handle this while limiting database load I implement a cache system that maintains telemetry data by datetime and satellite id. Currently it is optimized for sub thousand parameter systems. For larger systems with lots of inter connections a graph solution is optimal. If less than full data set ingestion is rare, this can be removed for simplicity. 

Calculations are assumed to be fast and therefore not requiring a queue.  

We included the idea of checks and specs both are equations and decided by the client. 
- checks define acceptable inputs. So, negative altitude fails a check if client desires.  
- specs are acceptable ranges for a reading but don't violate a check, So, temp > 200 can be a valid check but out of spec.

Telemetry parameters can be deprecated for updated telemetry parameters, the telemetry is always associated with the parameter that derived it. 

The frontend was updated to filter on any telemetry type and can sort on telemetry type when filtered.