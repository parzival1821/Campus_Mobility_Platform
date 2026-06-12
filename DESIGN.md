# Campus Mobility Platform Design Document

## Problem Understanding

IIT Roorkee campus transport depends on quick coordination between passengers and e-rickshaw drivers. Informal coordination makes driver availability unclear, ride assignment inconsistent, and operational visibility weak. This MVP centralizes the core workflow: passengers request rides, drivers accept and complete assignments, and administrators monitor system health in real time.

## System Architecture

The application uses a simple three-layer architecture:

- Browser dashboard: HTML, CSS, and vanilla JavaScript render Passenger, Driver, and Admin views.
- Node.js server: one HTTP server serves static assets, JSON APIs, and the Server-Sent Events stream.
- JSON store: `data/store.json` persists passengers, drivers, rides, ratings, and demo seed data.

Realtime synchronization uses Server-Sent Events. Each write operation saves the JSON store and broadcasts the full public state plus analytics to connected browsers. This keeps all tabs synchronized without polling.

## Data Model

Core entities:

- Passenger: `id`, `name`, `phone`, `hostel`
- Driver: `id`, `name`, `phone`, `vehicleNumber`, `vehicleType`, `currentLocation`, `online`, `verified`
- Ride: `id`, `passengerId`, `driverId`, `pickup`, `destination`, `seats`, `notes`, `status`, `rejectedBy`, lifecycle timestamps, optional `rating`
- Rating: `score`, `comment`, `createdAt`

Entity relationships:

```text
Passenger 1 --- many Ride many --- 1 Driver
Ride 1 --- 0..1 Rating
```

Ride lifecycle:

```text
requested -> accepted -> in_progress -> completed
requested -> cancelled
accepted -> cancelled
```

## API Overview

- `GET /api/state`: returns the public state and analytics snapshot.
- `GET /api/events`: opens the Server-Sent Events stream for live updates.
- `POST /api/login`: creates or returns a demo passenger or driver profile.
- `POST /api/rides`: creates a ride request after checking the passenger has no active ride.
- `POST /api/rides/:id/accept`: assigns one online driver to one requested ride.
- `POST /api/rides/:id/reject`: records that a driver declined a request.
- `POST /api/rides/:id/status`: transitions assigned rides through valid lifecycle states.
- `POST /api/rides/:id/rating`: stores passenger feedback for a completed ride.
- `POST /api/drivers/:id/availability`: updates driver online status and location.
- `POST /api/reset`: restores seeded demo data.

## Data Integrity Rules

- A passenger can have only one active ride at a time.
- A ride can be assigned to only one driver.
- Only online drivers can accept ride requests.
- A driver can hold only one active assignment.
- Only the assigned driver can start or complete a ride.
- Ratings are accepted only after ride completion.

## Dashboard Design

Passenger view focuses on requesting and tracking a ride. Driver view focuses on availability, incoming requests, and lifecycle controls. Admin view focuses on operational visibility: active rides, driver availability, demand hotspots, destination trends, driver leaderboard, feedback, and ride history.

The UI uses responsive grids, compact cards, status badges, and clear role tabs so the demo works on laptop and mobile screen widths.

## Design Decisions

- Vanilla Node.js keeps the app reproducible with no install step beyond Node.
- Server-Sent Events are simpler than WebSockets for this one-way broadcast workload.
- JSON persistence is sufficient for a deadline MVP while preserving a clear migration path to PostgreSQL or MongoDB.
- The app uses demo login/profile creation instead of password auth to prioritize the real-time workflow and evaluation criteria.
- Maps, payments, scheduling, and forecasting are documented as future extensions.

## Future Improvements

- Replace JSON persistence with PostgreSQL and indexed ride queries.
- Add password-based auth with sessions or JWTs.
- Add WebSocket driver location streaming for live map updates.
- Add scheduled rides, UPI payment simulation, and demand forecasting.
- Add audit logs for every dispatch and lifecycle operation.
