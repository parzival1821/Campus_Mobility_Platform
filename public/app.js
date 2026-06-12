const els = {
  connectionStatus: document.querySelector("#connectionStatus"),
  resetDemoButton: document.querySelector("#resetDemoButton"),
  metricGrid: document.querySelector("#metricGrid"),
  toast: document.querySelector("#toast"),
  passengerSelect: document.querySelector("#passengerSelect"),
  passengerProfileForm: document.querySelector("#passengerProfileForm"),
  newPassengerName: document.querySelector("#newPassengerName"),
  rideRequestForm: document.querySelector("#rideRequestForm"),
  pickupInput: document.querySelector("#pickupInput"),
  destinationInput: document.querySelector("#destinationInput"),
  seatsInput: document.querySelector("#seatsInput"),
  notesInput: document.querySelector("#notesInput"),
  passengerRideCard: document.querySelector("#passengerRideCard"),
  passengerActiveBadge: document.querySelector("#passengerActiveBadge"),
  driverSelect: document.querySelector("#driverSelect"),
  driverProfileForm: document.querySelector("#driverProfileForm"),
  newDriverName: document.querySelector("#newDriverName"),
  driverOnlineBadge: document.querySelector("#driverOnlineBadge"),
  driverLocationInput: document.querySelector("#driverLocationInput"),
  goOnlineButton: document.querySelector("#goOnlineButton"),
  goOfflineButton: document.querySelector("#goOfflineButton"),
  driverStats: document.querySelector("#driverStats"),
  incomingRequests: document.querySelector("#incomingRequests"),
  driverActiveRide: document.querySelector("#driverActiveRide"),
  activeRidesTable: document.querySelector("#activeRidesTable"),
  driversTable: document.querySelector("#driversTable"),
  pickupChart: document.querySelector("#pickupChart"),
  destinationChart: document.querySelector("#destinationChart"),
  driverPerformance: document.querySelector("#driverPerformance"),
  feedbackList: document.querySelector("#feedbackList"),
  rideHistory: document.querySelector("#rideHistory")
};

const app = {
  state: { passengers: [], drivers: [], rides: [] },
  analytics: null,
  selectedPassengerId: localStorage.getItem("selectedPassengerId") || "passenger-1",
  selectedDriverId: localStorage.getItem("selectedDriverId") || "driver-1",
  activeRole: "passenger"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatStatus(status) {
  return status.replaceAll("_", " ");
}

function statusBadge(status) {
  return `<span class="status-badge ${status}">${formatStatus(status)}</span>`;
}

function formatTime(value) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short"
  }).format(new Date(value));
}

function selectedPassenger() {
  return app.state.passengers.find((passenger) => passenger.id === app.selectedPassengerId) || app.state.passengers[0] || null;
}

function selectedDriver() {
  return app.state.drivers.find((driver) => driver.id === app.selectedDriverId) || app.state.drivers[0] || null;
}

function activeRideForPassenger(passengerId) {
  return app.state.rides.find((ride) => ride.passengerId === passengerId && ["requested", "accepted", "in_progress"].includes(ride.status));
}

function activeRideForDriver(driverId) {
  return app.state.rides.find((ride) => ride.driverId === driverId && ["accepted", "in_progress"].includes(ride.status));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }
  if (payload.state) {
    app.state = payload.state;
    app.analytics = payload.analytics;
    render();
  }
  return payload;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}

function setConnectionStatus(isLive) {
  els.connectionStatus.textContent = isLive ? "Live sync" : "Offline";
  els.connectionStatus.classList.toggle("live", isLive);
  els.connectionStatus.classList.toggle("offline", !isLive);
}

function connectEvents() {
  const source = new EventSource("/api/events");
  source.addEventListener("open", () => setConnectionStatus(true));
  source.addEventListener("state", (event) => {
    const payload = JSON.parse(event.data);
    app.state = payload.state;
    app.analytics = payload.analytics;
    render();
    setConnectionStatus(true);
  });
  source.addEventListener("error", () => setConnectionStatus(false));
}

function render() {
  syncSelections();
  renderMetrics();
  renderProfileSelectors();
  renderPassengerView();
  renderDriverView();
  renderAdminView();
  syncActiveRole();
}

function syncSelections() {
  if (!app.state.passengers.some((passenger) => passenger.id === app.selectedPassengerId)) {
    app.selectedPassengerId = app.state.passengers[0]?.id || "";
  }
  if (!app.state.drivers.some((driver) => driver.id === app.selectedDriverId)) {
    app.selectedDriverId = app.state.drivers[0]?.id || "";
  }
  localStorage.setItem("selectedPassengerId", app.selectedPassengerId);
  localStorage.setItem("selectedDriverId", app.selectedDriverId);
}

function renderMetrics() {
  const totals = app.analytics?.totals || {};
  const metrics = [
    ["Active rides", totals.activeRides ?? 0],
    ["Available drivers", totals.availableDrivers ?? 0],
    ["Completed rides", totals.completedRides ?? 0],
    ["Avg rating", app.analytics?.averageRating ?? "N/A"]
  ];

  els.metricGrid.innerHTML = metrics
    .map(([label, value]) => `
      <div class="metric-card">
        <div class="metric-label">${label}</div>
        <div class="metric-value">${value}</div>
      </div>
    `)
    .join("");
}

function renderProfileSelectors() {
  els.passengerSelect.innerHTML = app.state.passengers
    .map((passenger) => `<option value="${passenger.id}">${escapeHtml(passenger.name)} - ${escapeHtml(passenger.hostel || "Campus")}</option>`)
    .join("");
  els.passengerSelect.value = app.selectedPassengerId;

  els.driverSelect.innerHTML = app.state.drivers
    .map((driver) => `<option value="${driver.id}">${escapeHtml(driver.name)} - ${escapeHtml(driver.vehicleNumber)}</option>`)
    .join("");
  els.driverSelect.value = app.selectedDriverId;
}

function renderPassengerView() {
  const passenger = selectedPassenger();
  if (!passenger) {
    els.passengerRideCard.innerHTML = "Add a passenger profile to request a ride.";
    return;
  }

  const activeRide = activeRideForPassenger(passenger.id);
  const latestCompleted = app.state.rides.find((ride) => ride.passengerId === passenger.id && ride.status === "completed" && !ride.rating);
  els.passengerActiveBadge.textContent = activeRide ? formatStatus(activeRide.status) : "No active ride";
  els.rideRequestForm.querySelector("button[type='submit']").disabled = Boolean(activeRide);

  if (activeRide) {
    els.passengerRideCard.className = "ride-list";
    els.passengerRideCard.innerHTML = rideCard(activeRide, {
      actions: activeRide.status === "requested" || activeRide.status === "accepted"
        ? `<button class="danger-button" type="button" data-cancel-ride="${activeRide.id}">Cancel ride</button>`
        : ""
    });
    return;
  }

  if (latestCompleted) {
    els.passengerRideCard.className = "ride-list";
    els.passengerRideCard.innerHTML = `
      ${rideCard(latestCompleted)}
      <form class="rating-form" data-rating-form="${latestCompleted.id}">
        <label>
          Rating
          <select name="score">
            <option value="5">5 - Excellent</option>
            <option value="4">4 - Good</option>
            <option value="3">3 - Average</option>
            <option value="2">2 - Poor</option>
            <option value="1">1 - Bad</option>
          </select>
        </label>
        <label>
          Feedback
          <textarea name="comment" rows="2" placeholder="Optional feedback"></textarea>
        </label>
        <button class="primary-button" type="submit">Submit feedback</button>
      </form>
    `;
    return;
  }

  els.passengerRideCard.className = "empty-state";
  els.passengerRideCard.innerHTML = "No active ride. Submit a request and keep this panel open to watch the status change live.";
}

function renderDriverView() {
  const driver = selectedDriver();
  if (!driver) {
    els.driverActiveRide.className = "empty-state";
    els.driverActiveRide.innerHTML = "Add a driver profile to manage rides.";
    return;
  }

  els.driverLocationInput.value = document.activeElement === els.driverLocationInput ? els.driverLocationInput.value : driver.currentLocation || "";
  els.driverOnlineBadge.textContent = driver.online ? "Online" : "Offline";
  els.driverOnlineBadge.style.background = driver.online ? "var(--success-soft)" : "var(--danger-soft)";
  els.driverOnlineBadge.style.color = driver.online ? "var(--success)" : "var(--danger)";
  els.goOnlineButton.disabled = driver.online;
  els.goOfflineButton.disabled = !driver.online;

  const driverRides = app.state.rides.filter((ride) => ride.driverId === driver.id);
  const completed = driverRides.filter((ride) => ride.status === "completed").length;
  els.driverStats.innerHTML = `
    <div class="compact-stat"><span class="small-muted">Completed</span><strong>${completed}</strong></div>
    <div class="compact-stat"><span class="small-muted">Rating</span><strong>${driver.averageRating ?? "N/A"}</strong></div>
    <div class="compact-stat"><span class="small-muted">Status</span><strong>${driver.online ? "Ready" : "Offline"}</strong></div>
  `;

  const activeRide = activeRideForDriver(driver.id);
  const requests = app.state.rides.filter((ride) => ride.status === "requested" && !ride.rejectedBy.includes(driver.id));

  els.incomingRequests.innerHTML = requests.length
    ? requests.map((ride) => rideCard(ride, {
        actions: `
          <button class="primary-button" type="button" data-accept-ride="${ride.id}">Accept</button>
          <button class="ghost-button" type="button" data-reject-ride="${ride.id}">Reject</button>
        `
      })).join("")
    : `<div class="empty-state">No pending ride requests.</div>`;

  if (activeRide) {
    const actions = activeRide.status === "accepted"
      ? `<button class="primary-button" type="button" data-start-ride="${activeRide.id}">Start ride</button>`
      : `<button class="primary-button" type="button" data-complete-ride="${activeRide.id}">Complete ride</button>`;
    els.driverActiveRide.className = "ride-list";
    els.driverActiveRide.innerHTML = rideCard(activeRide, { actions });
  } else {
    els.driverActiveRide.className = "empty-state";
    els.driverActiveRide.innerHTML = driver.online
      ? "You are online. Accept a pending request to begin an assignment."
      : "Go online to accept ride requests.";
  }
}

function renderAdminView() {
  const activeRides = app.state.rides.filter((ride) => ["requested", "accepted", "in_progress"].includes(ride.status));
  els.activeRidesTable.innerHTML = tableHtml(
    ["Ride", "Passenger", "Driver", "Status"],
    activeRides.map((ride) => [
      `${escapeHtml(ride.pickup)} to ${escapeHtml(ride.destination)}`,
      escapeHtml(ride.passenger?.name || "Unknown"),
      escapeHtml(ride.driver?.name || "Unassigned"),
      statusBadge(ride.status)
    ]),
    "No active rides."
  );

  els.driversTable.innerHTML = tableHtml(
    ["Driver", "Location", "Availability", "Rating"],
    app.state.drivers.map((driver) => [
      `${escapeHtml(driver.name)}<div class="small-muted">${escapeHtml(driver.vehicleNumber)}</div>`,
      escapeHtml(driver.currentLocation || "Campus"),
      driver.activeRideId ? "On ride" : driver.online ? "Available" : "Offline",
      driver.averageRating ?? "N/A"
    ]),
    "No drivers registered."
  );

  renderBarChart(els.pickupChart, app.analytics?.popularPickups || [], "Demand chart appears after ride requests.");
  renderBarChart(els.destinationChart, app.analytics?.popularDestinations || [], "Destination chart appears after ride requests.");
  renderDriverPerformance();
  renderFeedbackList();
  els.rideHistory.innerHTML = app.state.rides.length
    ? app.state.rides.slice(0, 8).map((ride) => rideCard(ride)).join("")
    : `<div class="empty-state">No rides yet.</div>`;
}

function tableHtml(headers, rows, emptyText) {
  if (!rows.length) return `<div class="empty-state">${emptyText}</div>`;
  return `
    <table>
      <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function renderBarChart(element, items, emptyText) {
  const max = items[0]?.count || 1;
  element.innerHTML = items.length
    ? items.map((item) => `
        <div class="bar-row">
          <div class="bar-row-top">
            <span>${escapeHtml(item.label)}</span>
            <span>${item.count}</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width: ${(item.count / max) * 100}%"></div></div>
        </div>
      `).join("")
    : `<div class="empty-state">${emptyText}</div>`;
}

function renderDriverPerformance() {
  const rows = [...(app.analytics?.driverPerformance || [])]
    .sort((a, b) => b.completedRides - a.completedRides || (b.averageRating || 0) - (a.averageRating || 0))
    .map((driver) => [
      escapeHtml(driver.name),
      String(driver.completedRides),
      driver.averageRating ?? "N/A",
      driver.activeRideId ? "On ride" : driver.online ? "Available" : "Offline"
    ]);

  els.driverPerformance.innerHTML = tableHtml(
    ["Driver", "Completed", "Rating", "Status"],
    rows,
    "No driver activity yet."
  );
}

function renderFeedbackList() {
  const feedback = app.state.rides
    .filter((ride) => ride.rating)
    .slice(0, 5);

  els.feedbackList.innerHTML = feedback.length
    ? feedback.map((ride) => `
        <div class="history-card">
          <div class="ride-card-header">
            <div>
              <div class="ride-title">${escapeHtml(ride.driver?.name || "Driver")}</div>
              <div class="ride-meta">${escapeHtml(ride.pickup)} to ${escapeHtml(ride.destination)}</div>
            </div>
            <span class="status-badge completed">${ride.rating.score}/5</span>
          </div>
          <p class="ride-meta">${escapeHtml(ride.rating.comment || "No written feedback")}</p>
        </div>
      `).join("")
    : `<div class="empty-state">Passenger feedback appears after completed rides are rated.</div>`;
}

function rideCard(ride, options = {}) {
  return `
    <div class="ride-card">
      <div class="ride-card-header">
        <div>
          <div class="ride-title">${escapeHtml(ride.passenger?.name || "Passenger ride")}</div>
          <div class="ride-meta">Requested ${formatTime(ride.requestedAt)} - ${ride.seats} seat${ride.seats > 1 ? "s" : ""}</div>
        </div>
        ${statusBadge(ride.status)}
      </div>
      <div class="route-line">
        <div class="route-stop">${escapeHtml(ride.pickup)}</div>
        <div class="route-arrow">to</div>
        <div class="route-stop">${escapeHtml(ride.destination)}</div>
      </div>
      <div class="ride-meta">
        Driver: ${escapeHtml(ride.driver?.name || "Unassigned")}
        ${ride.notes ? `<br>Notes: ${escapeHtml(ride.notes)}` : ""}
        ${ride.rating ? `<br>Rating: ${ride.rating.score}/5 - ${escapeHtml(ride.rating.comment || "No comment")}` : ""}
      </div>
      ${options.actions ? `<div class="button-row">${options.actions}</div>` : ""}
    </div>
  `;
}

function activateRole(role) {
  app.activeRole = role;
  syncActiveRole();
}

function syncActiveRole() {
  document.querySelectorAll("[data-role-tab]").forEach((button) => {
    const isActive = button.dataset.roleTab === app.activeRole;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  document.querySelectorAll("[data-view]").forEach((view) => {
    view.classList.toggle("active", view.dataset.view === app.activeRole);
  });
}

async function createProfile(role, name) {
  const body = { role, name };
  if (role === "driver") {
    body.vehicleNumber = `UK 08 ER ${Math.floor(1000 + Math.random() * 9000)}`;
    body.currentLocation = "Campus Gate";
  }
  const payload = await api("/api/login", { method: "POST", body });
  if (role === "passenger") {
    app.selectedPassengerId = payload.user.id;
  } else {
    app.selectedDriverId = payload.user.id;
  }
  showToast(`${name} added`);
  render();
}

function bindEvents() {
  document.querySelectorAll("[data-role-tab]").forEach((button) => {
    button.addEventListener("click", () => activateRole(button.dataset.roleTab));
  });

  els.resetDemoButton.addEventListener("click", async () => {
    await api("/api/reset", { method: "POST" });
    showToast("Demo data reset");
  });

  els.passengerSelect.addEventListener("change", () => {
    app.selectedPassengerId = els.passengerSelect.value;
    render();
  });

  els.driverSelect.addEventListener("change", () => {
    app.selectedDriverId = els.driverSelect.value;
    render();
  });

  els.passengerProfileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = els.newPassengerName.value.trim();
    if (!name) return;
    await createProfile("passenger", name);
    els.newPassengerName.value = "";
  });

  els.driverProfileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = els.newDriverName.value.trim();
    if (!name) return;
    await createProfile("driver", name);
    els.newDriverName.value = "";
  });

  els.rideRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const passenger = selectedPassenger();
    if (!passenger) return;

    await api("/api/rides", {
      method: "POST",
      body: {
        passengerId: passenger.id,
        pickup: els.pickupInput.value,
        destination: els.destinationInput.value,
        seats: Number(els.seatsInput.value),
        notes: els.notesInput.value
      }
    });
    els.rideRequestForm.reset();
    showToast("Ride requested");
  });

  els.goOnlineButton.addEventListener("click", () => updateAvailability(true));
  els.goOfflineButton.addEventListener("click", () => updateAvailability(false));

  document.body.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    const driver = selectedDriver();
    const passenger = selectedPassenger();

    try {
      if (target.dataset.acceptRide) {
        await api(`/api/rides/${target.dataset.acceptRide}/accept`, { method: "POST", body: { driverId: driver.id } });
        showToast("Ride accepted");
      }
      if (target.dataset.rejectRide) {
        await api(`/api/rides/${target.dataset.rejectRide}/reject`, { method: "POST", body: { driverId: driver.id } });
        showToast("Ride rejected");
      }
      if (target.dataset.startRide) {
        await api(`/api/rides/${target.dataset.startRide}/status`, { method: "POST", body: { driverId: driver.id, status: "in_progress" } });
        showToast("Ride started");
      }
      if (target.dataset.completeRide) {
        await api(`/api/rides/${target.dataset.completeRide}/status`, { method: "POST", body: { driverId: driver.id, status: "completed" } });
        activateRole("passenger");
        showToast("Ride completed");
      }
      if (target.dataset.cancelRide) {
        await api(`/api/rides/${target.dataset.cancelRide}/status`, { method: "POST", body: { passengerId: passenger.id, status: "cancelled" } });
        showToast("Ride cancelled");
      }
    } catch (error) {
      showToast(error.message);
    }
  });

  document.body.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-rating-form]");
    if (!form) return;
    event.preventDefault();
    const passenger = selectedPassenger();
    const data = new FormData(form);
    try {
      await api(`/api/rides/${form.dataset.ratingForm}/rating`, {
        method: "POST",
        body: {
          passengerId: passenger.id,
          score: Number(data.get("score")),
          comment: data.get("comment")
        }
      });
      showToast("Feedback submitted");
    } catch (error) {
      showToast(error.message);
    }
  });
}

async function updateAvailability(online) {
  const driver = selectedDriver();
  if (!driver) return;
  try {
    await api(`/api/drivers/${driver.id}/availability`, {
      method: "POST",
      body: {
        online,
        currentLocation: els.driverLocationInput.value
      }
    });
    showToast(online ? "Driver online" : "Driver offline");
  } catch (error) {
    showToast(error.message);
  }
}

async function init() {
  bindEvents();
  activateRole(app.activeRole);
  try {
    const payload = await api("/api/state");
    app.state = payload.state;
    app.analytics = payload.analytics;
    render();
    connectEvents();
  } catch (error) {
    setConnectionStatus(false);
    showToast(error.message);
  }
}

init();
