const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const ACTIVE_RIDE_STATUSES = new Set(["requested", "accepted", "in_progress"]);
const VALID_RIDE_STATUSES = new Set(["requested", "accepted", "in_progress", "completed", "cancelled"]);
const clients = new Set();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendError(res, status, message, details = {}) {
  sendJson(res, status, { error: message, ...details });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function makeSeedStore() {
  return {
    passengers: [
      {
        id: "passenger-1",
        name: "Aarav Sharma",
        phone: "+91 98765 12001",
        hostel: "Rajendra Bhawan"
      },
      {
        id: "passenger-2",
        name: "Meera Nair",
        phone: "+91 98765 12002",
        hostel: "Sarojini Bhawan"
      }
    ],
    drivers: [
      {
        id: "driver-1",
        name: "Ravi Kumar",
        phone: "+91 98765 22001",
        vehicleNumber: "UK 08 ER 1421",
        vehicleType: "E-rickshaw",
        currentLocation: "Library Circle",
        online: true,
        verified: true
      },
      {
        id: "driver-2",
        name: "Imran Ali",
        phone: "+91 98765 22002",
        vehicleNumber: "UK 08 ER 2432",
        vehicleType: "E-rickshaw",
        currentLocation: "Convocation Hall",
        online: true,
        verified: true
      },
      {
        id: "driver-3",
        name: "Sunita Rawat",
        phone: "+91 98765 22003",
        vehicleNumber: "UK 08 ER 3288",
        vehicleType: "E-rickshaw",
        currentLocation: "Cautley Bhawan",
        online: false,
        verified: true
      }
    ],
    rides: [
      {
        id: "ride-demo-1",
        passengerId: "passenger-2",
        driverId: "driver-2",
        pickup: "Main Building",
        destination: "MAC Auditorium",
        seats: 1,
        notes: "Rehearsal equipment drop",
        status: "completed",
        rejectedBy: [],
        rating: {
          score: 5,
          comment: "Quick pickup and smooth ride.",
          createdAt: "2026-06-11T09:35:00.000Z"
        },
        requestedAt: "2026-06-11T09:05:00.000Z",
        acceptedAt: "2026-06-11T09:07:00.000Z",
        startedAt: "2026-06-11T09:12:00.000Z",
        completedAt: "2026-06-11T09:32:00.000Z",
        cancelledAt: null
      }
    ]
  };
}

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    saveStore(makeSeedStore(), false);
  }
}

function loadStore() {
  ensureStore();
  const raw = fs.readFileSync(STORE_PATH, "utf8");
  return JSON.parse(raw);
}

function saveStore(store, shouldBroadcast = true) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`);
  if (shouldBroadcast) {
    broadcastState(store);
  }
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function publicState(store) {
  return {
    passengers: store.passengers,
    drivers: store.drivers.map((driver) => ({
      ...driver,
      activeRideId: findActiveRideForDriver(store, driver.id)?.id || null,
      averageRating: getDriverAverageRating(store, driver.id)
    })),
    rides: store.rides.map((ride) => ({
      ...ride,
      passenger: store.passengers.find((passenger) => passenger.id === ride.passengerId) || null,
      driver: store.drivers.find((driver) => driver.id === ride.driverId) || null
    }))
  };
}

function computeAnalytics(store) {
  const activeRides = store.rides.filter((ride) => ACTIVE_RIDE_STATUSES.has(ride.status));
  const completedRides = store.rides.filter((ride) => ride.status === "completed");
  const cancelledRides = store.rides.filter((ride) => ride.status === "cancelled");
  const ratedRides = completedRides.filter((ride) => ride.rating);
  const onlineDrivers = store.drivers.filter((driver) => driver.online);
  const availableDrivers = onlineDrivers.filter((driver) => !findActiveRideForDriver(store, driver.id));

  return {
    totals: {
      rides: store.rides.length,
      activeRides: activeRides.length,
      completedRides: completedRides.length,
      cancelledRides: cancelledRides.length,
      onlineDrivers: onlineDrivers.length,
      availableDrivers: availableDrivers.length,
      passengers: store.passengers.length
    },
    averageRating: ratedRides.length
      ? Number((ratedRides.reduce((sum, ride) => sum + ride.rating.score, 0) / ratedRides.length).toFixed(1))
      : null,
    popularPickups: rankByCount(store.rides, "pickup"),
    popularDestinations: rankByCount(store.rides, "destination"),
    driverPerformance: store.drivers.map((driver) => {
      const driverRides = store.rides.filter((ride) => ride.driverId === driver.id);
      const driverCompleted = driverRides.filter((ride) => ride.status === "completed");
      return {
        driverId: driver.id,
        name: driver.name,
        online: driver.online,
        completedRides: driverCompleted.length,
        activeRideId: findActiveRideForDriver(store, driver.id)?.id || null,
        averageRating: getDriverAverageRating(store, driver.id)
      };
    })
  };
}

function rankByCount(items, key) {
  const counts = new Map();
  for (const item of items) {
    if (!item[key]) continue;
    counts.set(item[key], (counts.get(item[key]) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5);
}

function getDriverAverageRating(store, driverId) {
  const ratings = store.rides
    .filter((ride) => ride.driverId === driverId && ride.rating)
    .map((ride) => ride.rating.score);

  if (!ratings.length) return null;
  return Number((ratings.reduce((sum, score) => sum + score, 0) / ratings.length).toFixed(1));
}

function findActiveRideForDriver(store, driverId) {
  return store.rides.find((ride) => ride.driverId === driverId && ["accepted", "in_progress"].includes(ride.status));
}

function findActiveRideForPassenger(store, passengerId) {
  return store.rides.find((ride) => ride.passengerId === passengerId && ACTIVE_RIDE_STATUSES.has(ride.status));
}

function broadcastState(store = loadStore()) {
  const payload = JSON.stringify({
    state: publicState(store),
    analytics: computeAnalytics(store),
    sentAt: new Date().toISOString()
  });

  for (const client of clients) {
    client.write(`event: state\n`);
    client.write(`data: ${payload}\n\n`);
  }
}

function openEventStream(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.write(`retry: 2000\n\n`);
  clients.add(res);
  broadcastState();

  req.on("close", () => {
    clients.delete(res);
  });
}

async function handleApi(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, service: "campus-mobility-platform" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      openEventStream(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      const store = loadStore();
      sendJson(res, 200, { state: publicState(store), analytics: computeAnalytics(store) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/analytics") {
      sendJson(res, 200, computeAnalytics(loadStore()));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/reset") {
      const store = makeSeedStore();
      saveStore(store);
      sendJson(res, 200, { state: publicState(store), analytics: computeAnalytics(store) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      const body = await readBody(req);
      const store = loadStore();
      const user = loginDemoUser(store, body);
      saveStore(store);
      sendJson(res, 200, { user, state: publicState(store), analytics: computeAnalytics(store) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/rides") {
      const store = loadStore();
      const ride = createRide(store, await readBody(req));
      saveStore(store);
      sendJson(res, 201, { ride, state: publicState(store), analytics: computeAnalytics(store) });
      return;
    }

    const driverAvailabilityMatch = url.pathname.match(/^\/api\/drivers\/([^/]+)\/availability$/);
    if (req.method === "POST" && driverAvailabilityMatch) {
      const store = loadStore();
      const driver = updateDriverAvailability(store, driverAvailabilityMatch[1], await readBody(req));
      saveStore(store);
      sendJson(res, 200, { driver, state: publicState(store), analytics: computeAnalytics(store) });
      return;
    }

    const rideActionMatch = url.pathname.match(/^\/api\/rides\/([^/]+)\/(accept|reject|status|rating)$/);
    if (req.method === "POST" && rideActionMatch) {
      const store = loadStore();
      const [, rideId, action] = rideActionMatch;
      const body = await readBody(req);
      const ride = updateRide(store, rideId, action, body);
      saveStore(store);
      sendJson(res, 200, { ride, state: publicState(store), analytics: computeAnalytics(store) });
      return;
    }

    sendError(res, 404, "API route not found");
  } catch (error) {
    const status = error.statusCode || 400;
    sendError(res, status, error.message || "Request failed");
  }
}

function fail(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    fail(400, `${fieldName} is required`);
  }
  return value.trim();
}

function loginDemoUser(store, body) {
  const role = requireString(body.role, "role");
  const name = requireString(body.name, "name");

  if (role === "passenger") {
    const existing = store.passengers.find((passenger) => passenger.name.toLowerCase() === name.toLowerCase());
    if (existing) return { ...existing, role };

    const passenger = {
      id: makeId("passenger"),
      name,
      phone: body.phone || "",
      hostel: body.hostel || "Campus"
    };
    store.passengers.push(passenger);
    return { ...passenger, role };
  }

  if (role === "driver") {
    const existing = store.drivers.find((driver) => driver.name.toLowerCase() === name.toLowerCase());
    if (existing) return { ...existing, role };

    const driver = {
      id: makeId("driver"),
      name,
      phone: body.phone || "",
      vehicleNumber: body.vehicleNumber || "TEMP ER 0000",
      vehicleType: "E-rickshaw",
      currentLocation: body.currentLocation || "Campus Gate",
      online: false,
      verified: true
    };
    store.drivers.push(driver);
    return { ...driver, role };
  }

  fail(400, "role must be passenger or driver");
}

function createRide(store, body) {
  const passengerId = requireString(body.passengerId, "passengerId");
  const passenger = store.passengers.find((candidate) => candidate.id === passengerId);
  if (!passenger) fail(404, "Passenger not found");

  const existingRide = findActiveRideForPassenger(store, passengerId);
  if (existingRide) fail(409, "Passenger already has an active ride");

  const ride = {
    id: makeId("ride"),
    passengerId,
    driverId: null,
    pickup: requireString(body.pickup, "pickup"),
    destination: requireString(body.destination, "destination"),
    seats: Math.max(1, Math.min(Number(body.seats || 1), 4)),
    notes: typeof body.notes === "string" ? body.notes.trim() : "",
    status: "requested",
    rejectedBy: [],
    rating: null,
    requestedAt: new Date().toISOString(),
    acceptedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null
  };

  store.rides.unshift(ride);
  return ride;
}

function updateDriverAvailability(store, driverId, body) {
  const driver = store.drivers.find((candidate) => candidate.id === driverId);
  if (!driver) fail(404, "Driver not found");

  driver.online = Boolean(body.online);
  if (typeof body.currentLocation === "string" && body.currentLocation.trim()) {
    driver.currentLocation = body.currentLocation.trim();
  }

  return driver;
}

function updateRide(store, rideId, action, body) {
  const ride = store.rides.find((candidate) => candidate.id === rideId);
  if (!ride) fail(404, "Ride not found");

  if (action === "accept") {
    return acceptRide(store, ride, body);
  }
  if (action === "reject") {
    return rejectRide(store, ride, body);
  }
  if (action === "status") {
    return changeRideStatus(store, ride, body);
  }
  if (action === "rating") {
    return rateRide(store, ride, body);
  }

  fail(404, "Ride action not found");
}

function acceptRide(store, ride, body) {
  const driverId = requireString(body.driverId, "driverId");
  const driver = store.drivers.find((candidate) => candidate.id === driverId);
  if (!driver) fail(404, "Driver not found");
  if (!driver.online) fail(409, "Driver must be online to accept rides");
  if (ride.status !== "requested") fail(409, "Only requested rides can be accepted");
  if (ride.rejectedBy.includes(driverId)) fail(409, "Driver already rejected this ride");

  const activeRide = findActiveRideForDriver(store, driverId);
  if (activeRide) fail(409, "Driver already has an active ride");

  ride.driverId = driverId;
  ride.status = "accepted";
  ride.acceptedAt = new Date().toISOString();
  return ride;
}

function rejectRide(store, ride, body) {
  const driverId = requireString(body.driverId, "driverId");
  const driver = store.drivers.find((candidate) => candidate.id === driverId);
  if (!driver) fail(404, "Driver not found");
  if (ride.status !== "requested") fail(409, "Only requested rides can be rejected");
  if (!ride.rejectedBy.includes(driverId)) {
    ride.rejectedBy.push(driverId);
  }
  return ride;
}

function changeRideStatus(store, ride, body) {
  const nextStatus = requireString(body.status, "status");
  if (!VALID_RIDE_STATUSES.has(nextStatus)) fail(400, "Invalid ride status");

  if (nextStatus === "cancelled") {
    if (!ACTIVE_RIDE_STATUSES.has(ride.status)) fail(409, "Only active rides can be cancelled");
    ride.status = "cancelled";
    ride.cancelledAt = new Date().toISOString();
    return ride;
  }

  const driverId = requireString(body.driverId, "driverId");
  if (ride.driverId !== driverId) fail(403, "Only the assigned driver can update this ride");

  if (nextStatus === "in_progress") {
    if (ride.status !== "accepted") fail(409, "Ride must be accepted before starting");
    ride.status = "in_progress";
    ride.startedAt = new Date().toISOString();
    return ride;
  }

  if (nextStatus === "completed") {
    if (ride.status !== "in_progress") fail(409, "Ride must be in progress before completion");
    ride.status = "completed";
    ride.completedAt = new Date().toISOString();
    return ride;
  }

  fail(409, "Unsupported status transition");
}

function rateRide(store, ride, body) {
  const passengerId = requireString(body.passengerId, "passengerId");
  if (ride.passengerId !== passengerId) fail(403, "Only the passenger can rate this ride");
  if (ride.status !== "completed") fail(409, "Only completed rides can be rated");

  const score = Number(body.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    fail(400, "Rating score must be an integer from 1 to 5");
  }

  ride.rating = {
    score,
    comment: typeof body.comment === "string" ? body.comment.trim() : "",
    createdAt: new Date().toISOString()
  };
  return ride;
}

function serveStatic(req, res, pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const requestedPath = path.normalize(path.join(PUBLIC_DIR, relativePath));

  if (!requestedPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(requestedPath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(requestedPath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream"
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url);
    return;
  }

  serveStatic(req, res, url.pathname);
});

ensureStore();

setInterval(() => {
  for (const client of clients) {
    client.write(`: heartbeat ${Date.now()}\n\n`);
  }
}, 25000);

server.listen(PORT, () => {
  console.log(`Campus Mobility Platform running at http://localhost:${PORT}`);
});
