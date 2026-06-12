# Campus Mobility Platform

Real-time campus ride management MVP for passenger requests, driver assignment, live ride updates, ratings, and operations analytics.

## Project Overview

This project was built for the Cult Open Projects 2026 Real-Time Campus Mobility and Ride Management problem statement. It connects passengers, drivers, and coordinators through one responsive web dashboard.

The app uses a dependency-free Node.js backend, Server-Sent Events for live synchronization, a JSON-backed store, and role-specific views for Passenger, Driver, and Admin workflows.

## Feature List

- Demo passenger and driver profile creation / login selection
- Passenger ride requests with pickup, destination, seat count, and notes
- Driver online/offline availability management
- Dispatch queue with accept and reject actions
- Ride lifecycle: requested, accepted, in progress, completed, cancelled
- Live status updates across dashboards using Server-Sent Events
- Passenger ratings and written feedback for completed rides
- Admin operations dashboard with active rides, fleet availability, demand charts, leaderboard, and ride history
- File-backed persistence in `data/store.json`
- Demo reset endpoint for quick walkthroughs

## Technology Stack

- Backend: Node.js HTTP server
- Realtime: Server-Sent Events
- Frontend: HTML, CSS, vanilla JavaScript
- Persistence: JSON file store
- Dependencies: none beyond Node.js

## Setup Instructions

Clone the repository and ensure Node.js is installed.

No package installation is required because the app uses only Node.js built-in modules.

## Running the Application

```bash
npm start
```

Open `http://localhost:3000`.

## Verification

```bash
npm run check
npm run smoke
```

`npm run check` validates JavaScript syntax. `npm run smoke` exercises the backend health endpoint, SSE stream, ride lifecycle, guardrails, ratings, analytics, and demo reset.

## Demonstration Flow

1. Open the Passenger tab and request a ride from `Library Circle` to `MAC Auditorium`.
2. Switch to the Driver tab, keep `Ravi Kumar` online, and accept the incoming ride.
3. Start the ride, then complete it.
4. The app switches back to Passenger so the ride can be rated.
5. Submit feedback and open the Admin tab to show updated analytics.

This flow covers the required demo items: registration/profile selection, ride request workflow, ride assignment, realtime updates, driver dashboard, and ratings/feedback.

## API Overview

- `GET /api/state` returns passengers, drivers, rides, and analytics.
- `GET /api/events` opens the live Server-Sent Events stream.
- `POST /api/login` creates or returns a demo passenger or driver profile.
- `POST /api/drivers/:id/availability` updates driver online status and location.
- `POST /api/rides` creates a passenger ride request.
- `POST /api/rides/:id/accept` assigns an online driver to a requested ride.
- `POST /api/rides/:id/reject` records a driver rejection.
- `POST /api/rides/:id/status` moves a ride through lifecycle states.
- `POST /api/rides/:id/rating` records passenger feedback.
- `POST /api/reset` restores seeded demo data.

## Design Document

- Markdown source: `PROJECT_REPORT.md`
- PDF deliverable: `PROJECT_REPORT.pdf`

The report includes problem understanding, system architecture, database schema, ERD, API overview, and design decisions.

## Resume Bullet

Built a real-time campus ride dispatch platform with role-based passenger and driver workflows, Server-Sent Events synchronization, ride lifecycle state management, driver availability tracking, ratings, and an analytics dashboard.

## Notes

This MVP intentionally avoids external dependencies so it can be cloned and run immediately during evaluation. `data/store.json` acts as the persistence layer for the demo; the design document explains how the same model can be moved to a relational database.
