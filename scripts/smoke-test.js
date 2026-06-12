const baseUrl = process.env.BASE_URL || "http://localhost:3000";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path}: ${payload.error || response.statusText}`);
  }
  return payload;
}

async function post(path, body = {}) {
  return request(path, { method: "POST", body });
}

async function verifySseReceivesState() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${baseUrl}/api/events`, { signal: controller.signal });
    if (!response.ok) throw new Error(`GET /api/events: ${response.statusText}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (!buffer.includes("event: state")) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
    }

    await reader.cancel();
    if (!buffer.includes("event: state")) {
      throw new Error("SSE stream did not emit initial state");
    }
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

async function expectFailure(label, action) {
  try {
    await action();
  } catch (error) {
    return;
  }
  throw new Error(`${label} should have failed`);
}

async function main() {
  await request("/api/health");
  await post("/api/reset");
  await verifySseReceivesState();

  const created = await post("/api/rides", {
    passengerId: "passenger-1",
    pickup: "Library",
    destination: "MAC Auditorium",
    seats: 2,
    notes: "Smoke test ride"
  });
  const rideId = created.ride.id;

  await expectFailure("duplicate active passenger ride", () =>
    post("/api/rides", {
      passengerId: "passenger-1",
      pickup: "Main Building",
      destination: "Cautley Bhawan"
    })
  );

  await expectFailure("offline driver accept", () =>
    post(`/api/rides/${rideId}/accept`, { driverId: "driver-3" })
  );

  await post(`/api/rides/${rideId}/accept`, { driverId: "driver-1" });

  await expectFailure("second driver assignment", () =>
    post(`/api/rides/${rideId}/accept`, { driverId: "driver-2" })
  );

  await post(`/api/rides/${rideId}/status`, { driverId: "driver-1", status: "in_progress" });
  await post(`/api/rides/${rideId}/status`, { driverId: "driver-1", status: "completed" });
  await post(`/api/rides/${rideId}/rating`, {
    passengerId: "passenger-1",
    score: 5,
    comment: "Smooth test ride."
  });

  const state = await request("/api/state");
  const ride = state.state.rides.find((candidate) => candidate.id === rideId);
  if (!ride || ride.status !== "completed" || ride.rating?.score !== 5) {
    throw new Error("completed ride with rating was not persisted");
  }
  if (state.analytics.totals.completedRides < 2 || state.analytics.averageRating !== 5) {
    throw new Error("analytics did not update after completed rated ride");
  }

  await post("/api/reset");
  console.log("Smoke test passed: health, SSE, ride lifecycle, guards, ratings, analytics.");
}

main().catch(async (error) => {
  try {
    await post("/api/reset");
  } catch {
    // Keep the original failure visible.
  }
  console.error(error.message);
  process.exit(1);
});
