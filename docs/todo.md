# Feature Tracker
## Overview
Space Ground Software Industry

Scenario: Satellite Telemetry Dashboard
Task: build a system to display and manage telemetry data from satellites.
Telemetry data includes information such as: satellite ID, timestamp, altitude, velocity,health status. 
The system should allow users to view, filter, add new telemetry entries.


## Backend Task: REST API for Satellite Telemetry
Objective: Design and implement a REST API to manage satellite telemetry data.

### Requirements:
#### 1. Endpoints
Implement the following API endpoints:

[x] GET /telemetry:
  [x] Return {satelliteId, timestamp, altitude, velocity, status}
  [x] No limit return all telemetry data
[x] Optional query parameters:
  [x] satelliteId: Filter by satellite ID.
  [x] status: Filter by health status (e.g., “healthy”, “critical”).

[x] POST /telemetry: Add a new telemetry entry.
  [x] Deduplication 
  [x] Indempotency
  [x] Request body should include:
```
{
"satelliteId": "string",
"timestamp": "ISO 8601 datetime",
"altitude": "number",
"velocity": "number",
"status": "string"
}
```

[x] GET /telemetry/:id: Retrieve a specific telemetry entry by ID.
[x] DELETE /telemetry/:id: Delete a specific telemetry entry.


#### 2. Data Storage
[x] Use an in-memory database (e.g., SQLite, or a simple array for simplicity).
  [x] Ensure data persistence during runtime.

#### 3. Validation
[x] Validate incoming data:
  [x] timestamp must be a valid ISO 8601 datetime.
  [x] altitude and velocity must be positive numbers.

#### 4. Implementation Details
[x] Use a backend framework of your choice (e.g., Node.js with Express, Python
with Flask/FastAPI, etc.).
[ ] Write clean, modular code with comments explaining key decisions.

#### Bonus Features
[x] Add pagination support to the GET /telemetry endpoint.
[x] Implement unit tests for the API endpoints.
[ ] Include Docker support for easy deployment.

## Frontend Task: Satellite Telemetry Dashboard
Objective: Design and implement a web interface to display and manage satellite telemetry data.
### Requirements: 
#### 1. Features
Build a web application with the following functionality:
[x] Display a table of telemetry data with columns: 
  [x] Satellite ID, 
  [x] Timestamp,
  [x] Altitude, 
  [x] Velocity, 
  [x] Health Status.

[x] Allow users to filter telemetry data by Satellite ID and Health Status.
[x] Provide a form to add new telemetry entries.
[x] Allow users to delete telemetry entries. (hard delete)


#### 2. Mock API or Backend Integration
[x] You may use the backend API provided in the test or create a mock API for
the frontend task.

#### 3. Design
[x] Use a modern frontend framework (e.g., React, Angular, Vue).
[x] Ensure the UI is responsive and user-friendly.

#### 4. Implementation Details
[x] Use state management (e.g., React’s useState or Redux) to manage telemetry
data.
[x] Validate form inputs before sending data to the backend or mock API.

#### Bonus Features
[x] Add sorting functionality to the table (e.g., sort by Timestamp, Altitude, or Velocity).
[x] Implement error handling for API requests (e.g., display error messages if the
backend is unreachable).
[x] Include unit tests for key components.
[x] Add a loading spinner while fetching data from the backend or mock API.

## Review 
[ ] init boilerplate code removed
  [ ] BE support plugin, 
  [ ] FE assets
[ ] All tests pass

## Submission Guidelines
### Backend Task
[ ] Provide a link to the repository containing the code.
[ ] Include instructions for running the API locally (e.g., npm install && npm start or
python app.py).
[ ] If Docker is implemented, include a Dockerfile and instructions for running the
container.

### Frontend Task
[ ] Provide a link to the repository containing the code.
[ ] Include instructions for running the app locally (e.g., npm install && npm start).
[ ] If applicable, provide a live demo link (e.g., deployed on Vercel, Netlify, etc.).
Documentation
[ ] Include a short README file explaining your approach, any assumptions made, and
how to test the application.