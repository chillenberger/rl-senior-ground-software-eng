# Overview 
This is a satellite telemetry dashboard Rocket Lab. It consists of two parts: 
- Backend: API for relaying data to frontend.   
- Frontend: Easy viewing and managing satellite data. 

## Project Notes
- all units are in metric: standard engineering and scientific globally understood. 
- db names in snake_case. API JSON stays camelCase; map between them in the route, removes sqlite folding.
- Deduplication 
- idempotency


## Backend
### Stack
- Language: Typescript
  Good balance of safe and robust with development speed. Trading execution speed for development speed by not choosing GO or Rust.
- Framework: Fastify
  Benefits: Fast, builtin schema validation, large community and support.
- DB: SQLite: in memory per document: client-task.md section: backend step: 2 
- Testing: #TODO:
- Package Manager: npm - simple good for small project no setup

### Schema and notes
- db entry types do not need to match API types.
#### Satellites
{
  id: string (okay not to be sequential or integer since rite and filter by should be rare)
  operator: string
  created_at: ISO 8601 datetime
  updated_at: ISO 8601 datetime
}

- Not delete option for now


Telemetry
{
  id: number (sequential since read write filter by could be often)
  satellite_id: string (link satellite table )
  latitude: number
  longitude: number 
  timestamp: ISO 8601 datetime (data timestamp)
  altitude: number (meters)
  velocity: number (km / s)
  health_status: enum string (healthy, anomaly, critical)
  created_at: ISO 8601 datetime (date in database timestamp)
}

### Features
- Caching with quary params
- Filter / Sort / Pagination

### Consumers
#TODO: One or many? Security? Login? 



## Frontend
This is a dashboard which will consume the Satellite Telemetry API backend

The instructions say we have the choice of mocking the backend, as I am building a perfectly good backend, I will use it. Mocking will be reserved for testing if needed. 

### Stack
- Language: Typescript
- Framework: React 
- State Management: #TODO:
- Testing: #TODO:
- Bundler and dev: Vita - Fast development speed, modern, simple, typescript support
- Package Manager: npm - simple good for small project no setup. 

### Features 
- Filter / Sort / Pagination
