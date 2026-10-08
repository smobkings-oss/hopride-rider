const PLACES = [
  { id: "dt", name: "Downtown Toledo", sub: "Summit & Madison", lat: 41.6528, lng: -83.5379 },
  { id: "tol", name: "Toledo Express Airport", sub: "TOL · Swanton", lat: 41.5868, lng: -83.8078 },
  { id: "fifth", name: "Fifth Third Field", sub: "Mud Hens · Downtown", lat: 41.6456, lng: -83.5383 },
  { id: "prom", name: "ProMedica Toledo Hospital", sub: "Monroe St", lat: 41.6792, lng: -83.5936 },
  { id: "ut", name: "University of Toledo", sub: "Main Campus", lat: 41.6577, lng: -83.6136 },
  { id: "utmc", name: "UT Medical Center", sub: "Arlington Ave", lat: 41.6202, lng: -83.6166 },
  { id: "zoo", name: "Toledo Zoo", sub: "Anthony Wayne Trail", lat: 41.6214, lng: -83.587 },
  { id: "franklin", name: "Franklin Park Mall", sub: "Monroe St", lat: 41.6975, lng: -83.6124 },
  { id: "docks", name: "The Docks", sub: "International Park", lat: 41.6419, lng: -83.5312 },
  { id: "casino", name: "Hollywood Casino", sub: "Rossford", lat: 41.6098, lng: -83.564 },
  { id: "perrysburg", name: "Levis Commons", sub: "Perrysburg", lat: 41.5356, lng: -83.6386 },
  { id: "maumee", name: "Fallen Timbers", sub: "Maumee", lat: 41.5628, lng: -83.7045 },
  { id: "sylvania", name: "Downtown Sylvania", sub: "Main St", lat: 41.7189, lng: -83.713 },
  { id: "bg", name: "Bowling Green State University", sub: "Bowling Green", lat: 41.3786, lng: -83.638 },
  { id: "findlay", name: "Downtown Findlay", sub: "Main St", lat: 41.0442, lng: -83.6499 },
  { id: "fremont", name: "Downtown Fremont", sub: "Front St", lat: 41.3503, lng: -83.1219 },
  { id: "holland", name: "Spring Meadows", sub: "Holland", lat: 41.6181, lng: -83.7088 }
];

const TIERS = [
  { id: "hop", name: "Hop", desc: "Everyday sedan", seats: 4, mult: 1, wait: 4 },
  { id: "tesla", name: "Tesla Navigator", desc: "Model 3 fleet", seats: 4, mult: 1.22, wait: 6 },
  { id: "xl", name: "Hop XL", desc: "SUV · extra bags", seats: 6, mult: 1.35, wait: 8 }
];

const DRIVERS = [
  { name: "Marcus Hale", car: "Tesla Model 3", color: "Midnight", plate: "A2B-301", rating: 4.97 },
  { name: "Elena Voss", car: "Tesla Model 3", color: "Pearl", plate: "A2B-218", rating: 4.95 },
  { name: "Jordan Pike", car: "Tesla Model Y", color: "Stealth", plate: "A2B-440", rating: 4.93 },
  { name: "Amina Cole", car: "Camry Hybrid", color: "Silver", plate: "A2B-117", rating: 4.91 },
  { name: "Luis Ortega", car: "Highlander", color: "Black", plate: "A2B-552", rating: 4.94 }
];

const KEY = "hopride_v1";
const HUB = { lat: 41.6528, lng: -83.5379 };

const state = load();
let map, pickupMarker, dropMarker, driverMarker, routeLine;
let sim = null;
let ui = { tab: "home", sheet: null, mode: "instant", tier: "hop", query: "", rating: 5, promo: "" };

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.rides) return raw;
  } catch (e) {}
  return {
    rider: null,
    card: { brand: "Visa", last4: "4242" },
    rides: [],
    saved: ["dt", "tol", "ut"]
  };
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
function money(n) { return "$" + n.toFixed(2); }
function uid() { return "HR" + Math.random().toString(36).slice(2, 7).toUpperCase(); }
function localInput(date) {
  const pad = n => String(n).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
}
function milesBetween(a, b) {
  const R = 3958.8;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s1 + s2));
}
function surgeNow() {
  const h = new Date().getHours();
  if (h >= 22 || h < 5) return 1.35;
  if (h >= 16 && h <= 18) return 1.18;
  if (h >= 7 && h <= 9) return 1.12;
  return 1;
}
function quote(pickup, dropoff, tierId, scheduled) {
  const miles = Math.max(0.8, milesBetween(pickup, dropoff));
  const minutes = Math.round(miles / 0.42 + 4);
  const tier = TIERS.find(t => t.id === tierId) || TIERS[0];
  const surge = surgeNow();
  const base = 3.5, perMile = 1.85, perMin = 0.28, book = 1.5;
  let fare = (base + miles * perMile + minutes * perMin + book) * tier.mult * surge;
  if (scheduled) fare += 1;
  const promoOff = ui.promo.trim().toUpperCase() === "HOPLOCAL" ? 2 : 0;
  fare = Math.max(8, fare - promoOff);
  return { miles: +miles.toFixed(1), minutes, surge, fare: +fare.toFixed(2), promoOff, tier };
}
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.display = "none"; }, 2400);
}
function activeRide() {
  return state.rides.find(r => ["searching", "accepted", "arriving", "arrived", "onboard"].includes(r.status));
}

function boot() {
  document.getElementById("toast").style.display = "none";
  if (!state.rider) renderGate();
  else renderApp();
}

function renderGate() {
  document.getElementById("app").innerHTML = `
    <div class="toast" id="toast"></div>
    <section class="gate">
      <div class="mark" style="width:52px;height:52px;border-radius:16px;font-size:22px">H</div>
      <p class="status-pill" style="margin-top:18px">A2B Rides · NW Ohio</p>
      <h1>Hop on.<br><span class="holographic">Now or later.</span></h1>
      <p class="fine" style="max-width:320px">Instant rides and scheduled pickups across Toledo, Perrysburg, Maumee, Findlay, and the airport. Transparent fares. Tesla Navigators when you want them.</p>
      <div class="field" style="margin-top:18px"><label>Name</label><input id="g-name" placeholder="Alex Rivera" /></div>
      <div class="field"><label>Mobile</label><input id="g-phone" placeholder="419-555-0142" inputmode="tel" /></div>
      <button class="btn" id="g-go">Hop in</button>
      <button class="btn ghost" id="g-demo" style="margin-top:8px">Use demo rider</button>
    </section>`;
  document.getElementById("g-go").onclick = () => {
    const name = document.getElementById("g-name").value.trim();
    const phone = document.getElementById("g-phone").value.trim();
    if (name.length < 2 || phone.length < 7) return toast("Add a name and mobile to hop in.");
    state.rider = { name, phone };
    save(); boot();
  };
  document.getElementById("g-demo").onclick = () => {
    state.rider = { name: "Alex Rivera", phone: "419-555-0142" };
    save(); boot();
  };
}

function renderApp() {
  const ride = activeRide();
  document.getElementById("app").innerHTML = `
    <div class="toast" id="toast"></div>
    <header class="topbar">
      <div class="brand"><div class="mark">H</div><div><b>HOPRIDE</b><span>${state.rider.name.split(" ")[0]} · NW Ohio</span></div></div>
      <button class="chip" id="surge-chip">${surgeNow().toFixed(2)}x surge</button>
    </header>
    <section class="view ${ui.tab === "home" ? "on" : ""}" id="view-home">
      <div id="map"></div>
      <div class="sheet" id="home-sheet"></div>
    </section>
    <section class="view ${ui.tab === "rides" ? "on" : ""}" id="view-rides"><div class="screen" id="rides-screen"></div></section>
    <section class="view ${ui.tab === "sched" ? "on" : ""}" id="view-sched"><div class="screen" id="sched-screen"></div></section>
    <section class="view ${ui.tab === "account" ? "on" : ""}" id="view-account"><div class="screen" id="account-screen"></div></section>
    <nav class="nav">
      <button data-tab="home" class="${ui.tab === "home" ? "on" : ""}">Home</button>
      <button data-tab="rides" class="${ui.tab === "rides" ? "on" : ""}">Trips</button>
      <button data-tab="sched" class="${ui.tab === "sched" ? "on" : ""}">Schedule</button>
      <button data-tab="account" class="${ui.tab === "account" ? "on" : ""}">Account</button>
    </nav>
    <div id="overlay"></div>`;
  document.querySelectorAll(".nav button").forEach(b => b.onclick = () => { ui.tab = b.dataset.tab; ui.sheet = null; renderApp(); });
  document.getElementById("surge-chip").onclick = () => toast("Surge follows morning, evening, and late-night demand. Drivers keep the majority.");
  if (ui.tab === "home") {
    paintHome();
    setTimeout(initMap, 40);
  }
  if (ui.tab === "rides") paintRides();
  if (ui.tab === "sched") paintSched();
  if (ui.tab === "account") paintAccount();
  if (ride && ui.tab === "home") openTrip(ride.id, false);
  if (ui.sheet) openSheet(ui.sheet);
}

function paintHome() {
  const pickup = state.pickup || PLACES[0];
  document.getElementById("home-sheet").innerHTML = `
    <div class="handle"></div>
    <button class="where" id="open-book"><b>Where to?</b><small>Pickup · ${pickup.name}</small></button>
    <div class="quick">
      ${state.saved.map(id => PLACES.find(p => p.id === id)).filter(Boolean).map(p => `<button data-place="${p.id}">${p.name.split(" ")[0]}</button>`).join("")}
      <button id="open-sched">Schedule</button>
    </div>`;
  document.getElementById("open-book").onclick = () => openSheet("book");
  document.getElementById("open-sched").onclick = () => { ui.mode = "scheduled"; openSheet("book"); };
  document.querySelectorAll("[data-place]").forEach(b => b.onclick = () => {
    state.dropoff = PLACES.find(p => p.id === b.dataset.place);
    ui.mode = "instant";
    openSheet("confirm");
  });
}

function initMap() {
  const el = document.getElementById("map");
  if (!el || typeof L === "undefined") return;
  if (map) { map.remove(); map = null; }
  const pickup = state.pickup || PLACES[0];
  map = L.map(el, { zoomControl: false, attributionControl: true }).setView([pickup.lat, pickup.lng], 12);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd", maxZoom: 19, attribution: "&copy; OSM &copy; CARTO"
  }).addTo(map);
  pickupMarker = L.circleMarker([pickup.lat, pickup.lng], { radius: 8, color: "#e8c97a", fillColor: "#e8c97a", fillOpacity: 1 }).addTo(map);
  if (state.dropoff) {
    dropMarker = L.circleMarker([state.dropoff.lat, state.dropoff.lng], { radius: 7, color: "#8ee7ff", fillColor: "#8ee7ff", fillOpacity: 1 }).addTo(map);
    drawRoute(pickup, state.dropoff);
    map.fitBounds([[pickup.lat, pickup.lng], [state.dropoff.lat, state.dropoff.lng]], { padding: [30, 30] });
  }
  setTimeout(() => map.invalidateSize(), 120);
}

function drawRoute(a, b) {
  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: "#e8c97a", weight: 4, opacity: 0.9 }).addTo(map);
}

function openSheet(kind) {
  ui.sheet = kind;
  const root = document.getElementById("overlay");
  if (!root) return;
  if (kind === "book") root.innerHTML = bookSheet();
  if (kind === "confirm") root.innerHTML = confirmSheet();
  if (kind === "trip") return;
  bindSheet();
}

function bookSheet() {
  const pickup = state.pickup || PLACES[0];
  const later = new Date(Date.now() + 60 * 60 * 1000);
  later.setMinutes(0, 0, 0);
  const local = localInput(later);
  return `<div class="overlay"><div class="panel">
    <div class="row"><h3>Book a ride</h3><button class="chip" id="close-sheet">Close</button></div>
    <div class="seg" style="margin-top:12px">
      <button data-mode="instant" class="${ui.mode === "instant" ? "on" : ""}">Instant</button>
      <button data-mode="scheduled" class="${ui.mode === "scheduled" ? "on" : ""}">Schedule</button>
    </div>
    <div class="field"><label>Pickup</label><input id="q-pick" value="${pickup.name}" /></div>
    <div class="field"><label>Dropoff</label><input id="q-drop" placeholder="Airport, hospital, address" value="${state.dropoff ? state.dropoff.name : ""}" /></div>
    <div id="when-wrap" style="${ui.mode === "scheduled" ? "" : "display:none"}">
      <div class="field"><label>Pickup time</label><input id="when" type="datetime-local" value="${local}" /></div>
    </div>
    <div id="results"></div>
    <p class="fine">Launch area: Toledo metro, Perrysburg, Maumee, Sylvania, Holland, Bowling Green, Findlay, Fremont, TOL airport.</p>
  </div></div>`;
}

function resultsFor(inputId, setter) {
  const q = (document.getElementById(inputId).value || "").trim().toLowerCase();
  const hits = PLACES.filter(p => (p.name + p.sub).toLowerCase().includes(q)).slice(0, 6);
  const box = document.getElementById("results");
  const custom = q.length > 2 && !hits.some(h => h.name.toLowerCase() === q);
  box.innerHTML = hits.map(p => `<button class="place" data-set="${setter}" data-id="${p.id}"><b>${p.name}</b><div class="fine">${p.sub}</div></button>`).join("")
    + (custom ? `<button class="place" data-custom="${setter}" data-q="${q}"><b>Use “${q}”</b><div class="fine">Pin near Toledo for this demo</div></button>` : "");
  box.querySelectorAll("[data-id]").forEach(b => b.onclick = () => {
    const place = PLACES.find(p => p.id === b.dataset.id);
    if (b.dataset.set === "pickup") state.pickup = place; else state.dropoff = place;
    save(); openSheet(state.dropoff ? "confirm" : "book");
  });
  box.querySelectorAll("[data-custom]").forEach(b => b.onclick = () => {
    const place = customPlace(b.dataset.q);
    if (b.dataset.custom === "pickup") state.pickup = place; else state.dropoff = place;
    save(); openSheet("confirm");
  });
}

function customPlace(q) {
  const n = Array.from(q).reduce((a, c) => a + c.charCodeAt(0), 0);
  return { id: "c" + n, name: q.replace(/\b\w/g, m => m.toUpperCase()), sub: "Custom pin", lat: HUB.lat + ((n % 17) - 8) * 0.01, lng: HUB.lng + ((n % 13) - 6) * 0.012 };
}

function confirmSheet() {
  const pickup = state.pickup || PLACES[0];
  const drop = state.dropoff;
  if (!drop) return bookSheet();
  const q = quote(pickup, drop, ui.tier, ui.mode === "scheduled");
  const whenVal = ui.when || localInput(new Date(Date.now() + 60 * 60 * 1000));
  return `<div class="overlay"><div class="panel">
    <div class="row"><h3>${ui.mode === "scheduled" ? "Schedule ride" : "Confirm hop"}</h3><button class="chip" id="close-sheet">Back</button></div>
    <div class="card">
      <div><span class="route-dot"></span> ${pickup.name}</div>
      <div style="margin-top:6px"><span class="pin-drop"></span> ${drop.name}</div>
      <p class="fine" style="margin:8px 0 0">${q.miles} mi · ${q.minutes} min · ${q.surge.toFixed(2)}x</p>
    </div>
    ${ui.mode === "scheduled" ? `<div class="field"><label>Pickup time</label><input id="when" type="datetime-local" value="${whenVal}" /></div>` : ""}
    <div class="tiers">
      ${TIERS.map(t => {
        const fq = quote(pickup, drop, t.id, ui.mode === "scheduled");
        return `<button class="tier ${ui.tier === t.id ? "on" : ""}" data-tier="${t.id}"><div class="row"><b>${t.name}</b><b>${money(fq.fare)}</b></div><div class="fine">${t.desc} · ${t.seats} seats · ~${t.wait} min</div></button>`;
      }).join("")}
    </div>
    <div class="field" style="margin-top:10px"><label>Promo</label><input id="promo" placeholder="HOPLOCAL saves $2" value="${ui.promo}" /></div>
    <p class="fine">Pay with ${state.card.brand} •••• ${state.card.last4}. Demo only — no card is charged. Drivers keep the majority after a small platform fee.</p>
    <button class="btn" id="confirm-ride">${ui.mode === "scheduled" ? "Reserve pickup" : "Request " + money(q.fare)}</button>
  </div></div>`;
}

function bindSheet() {
  const close = document.getElementById("close-sheet");
  if (close) close.onclick = () => { ui.sheet = null; document.getElementById("overlay").innerHTML = ""; if (ui.tab === "home") renderApp(); };
  document.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { ui.mode = b.dataset.mode; openSheet("book"); });
  const qd = document.getElementById("q-drop");
  if (qp) qp.oninput = () => resultsFor("q-pick", "pickup");
  if (qd) {
    qd.oninput = () => resultsFor("q-drop", "dropoff");
    resultsFor("q-drop", "dropoff");
  }
  document.querySelectorAll("[data-tier]").forEach(b => b.onclick = () => { ui.tier = b.dataset.tier; openSheet("confirm"); });
  const promo = document.getElementById("promo");
  if (promo) promo.onchange = () => { ui.promo = promo.value; openSheet("confirm"); };
  const when = document.getElementById("when");
  if (when) when.onchange = () => { ui.when = when.value; };
  const go = document.getElementById("confirm-ride");
  if (go) go.onclick = placeOrder;
}

function placeOrder() {
  const pickup = state.pickup || PLACES[0];
  const drop = state.dropoff;
  if (!drop) return toast("Choose a dropoff.");
  let when = null;
  if (ui.mode === "scheduled") {
    const raw = (document.getElementById("when") || {}).value || ui.when;
    if (!raw) return toast("Pick a pickup time.");
    when = new Date(raw);
    if (when.getTime() < Date.now() + 20 * 60 * 1000) return toast("Schedule at least 20 minutes ahead.");
  }
  const q = quote(pickup, drop, ui.tier, ui.mode === "scheduled");
  const ride = {
    id: uid(),
    type: ui.mode,
    status: ui.mode === "scheduled" ? "scheduled" : "searching",
    pickup, dropoff: drop, tier: ui.tier,
    fare: q.fare, miles: q.miles, minutes: q.minutes, surge: q.surge,
    promoOff: q.promoOff,
    when: when ? when.toISOString() : null,
    createdAt: new Date().toISOString(),
    driver: null, rating: null
  };
  state.rides.unshift(ride);
  save();
  ui.sheet = null;
  if (ride.status === "scheduled") {
    ui.tab = "sched";
    renderApp();
    toast("Reserved " + ride.id + ". We’ll dispatch a Navigator before pickup.");
  } else {
    ui.tab = "home";
    renderApp();
    openTrip(ride.id, true);
    simulate(ride.id);
  }
}

function openTrip(id, live) {
  const ride = state.rides.find(r => r.id === id);
  if (!ride) return;
  const root = document.getElementById("overlay");
  const driver = ride.driver;
  const label = {
    searching: "Finding a nearby driver",
    accepted: "Driver accepted",
    arriving: "Driver is on the way",
    arrived: "Driver has arrived",
    onboard: "Heading to dropoff",
    completed: "Trip complete",
    canceled: "Canceled"
  }[ride.status] || ride.status;
  root.innerHTML = `<div class="overlay"><div class="panel">
    <p class="status-pill ${ride.status === "searching" ? "pulse" : ""}">${label}</p>
    <h2 style="margin-top:6px">${ride.id}</h2>
    <div class="card">
      <div><span class="route-dot"></span> ${ride.pickup.name}</div>
      <div style="margin-top:6px"><span class="pin-drop"></span> ${ride.dropoff.name}</div>
      <div class="row" style="margin-top:8px"><span class="fine">${ride.miles} mi · ${ride.minutes} min</span><b>${money(ride.fare)}</b></div>
    </div>
    ${driver ? `<div class="card"><b>${driver.name}</b><div class="fine">${driver.color} ${driver.car} · ${driver.plate} · ${driver.rating}★</div></div>` : `<div class="card fine">Matching against online Navigators in the Toledo metro…</div>`}
    ${ride.status === "completed" && !ride.rating ? `<div class="stars" id="stars">${[1,2,3,4,5].map(n => `<button data-star="${n}" class="${n <= ui.rating ? "on" : ""}">★</button>`).join("")}</div><button class="btn" id="rate">Submit rating</button>` : ""}
    ${ride.status === "completed" ? `<p class="fine">Receipt stored on this phone. Demo card was not charged.</p><button class="btn ghost" id="done-trip">Done</button>` : ""}
    ${["searching","accepted","arriving","arrived"].includes(ride.status) ? `<button class="btn danger" id="cancel-ride">Cancel ride</button>` : ""}
    ${ride.status === "onboard" ? `<button class="btn ghost" id="share">Share trip status</button>` : ""}
  </div></div>`;
  const cancel = document.getElementById("cancel-ride");
  if (cancel) cancel.onclick = () => cancelRide(id);
  const share = document.getElementById("share");
  if (share) share.onclick = () => {
    const text = `HopRide ${ride.id}: ${ride.pickup.name} → ${ride.dropoff.name}. Driver ${driver ? driver.name + " " + driver.plate : "assigning"}.`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else { navigator.clipboard && navigator.clipboard.writeText(text); toast("Trip status copied."); }
  };
  document.querySelectorAll("[data-star]").forEach(b => b.onclick = () => { ui.rating = +b.dataset.star; openTrip(id); });
  const rate = document.getElementById("rate");
  if (rate) rate.onclick = () => { ride.rating = ui.rating; save(); toast("Thanks — rating saved."); document.getElementById("overlay").innerHTML = ""; };
  const done = document.getElementById("done-trip");
  if (done) done.onclick = () => { document.getElementById("overlay").innerHTML = ""; };
  if (live) moveDriver(ride);
}

function cancelRide(id) {
  const ride = state.rides.find(r => r.id === id);
  if (!ride) return;
  ride.status = "canceled";
  clearInterval(sim);
  save();
  document.getElementById("overlay").innerHTML = "";
  toast("Ride canceled. No charge.");
  renderApp();
}

function simulate(id) {
  clearInterval(sim);
  const ride = state.rides.find(r => r.id === id);
  const pool = ride.tier === "xl" ? DRIVERS.filter(d => d.car.includes("Highlander") || d.car.includes("Y")) : DRIVERS;
  setTimeout(() => {
    if (ride.status === "canceled") return;
    ride.status = "accepted";
    ride.driver = pool[Math.floor(Math.random() * pool.length)];
    ride.driverPos = offset(ride.pickup, 0.03, -0.02);
    save(); openTrip(id, true);
    sim = setInterval(() => step(id), 900);
  }, 1800);
}

function offset(p, dLat, dLng) { return { lat: p.lat + dLat, lng: p.lng + dLng }; }
function lerp(a, b, t) { return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }; }

function step(id) {
  const ride = state.rides.find(r => r.id === id);
  if (!ride || ride.status === "canceled") { clearInterval(sim); return; }
  if (ride.status === "accepted" || ride.status === "arriving") {
    ride.status = "arriving";
    ride.driverPos = lerp(ride.driverPos, ride.pickup, 0.34);
    if (milesBetween(ride.driverPos, ride.pickup) < 0.15) ride.status = "arrived";
  } else if (ride.status === "arrived") {
    ride.status = "onboard";
    ride.progress = 0;
  } else if (ride.status === "onboard") {
    ride.progress = (ride.progress || 0) + 0.2;
    ride.driverPos = lerp(ride.pickup, ride.dropoff, Math.min(1, ride.progress));
    if (ride.progress >= 1) {
      ride.status = "completed";
      clearInterval(sim);
    }
  }
  save();
  openTrip(id, true);
}

function moveDriver(ride) {
  if (!map || !ride.driverPos) return;
  if (driverMarker) map.removeLayer(driverMarker);
  driverMarker = L.circleMarker([ride.driverPos.lat, ride.driverPos.lng], {
    radius: 7, color: "#fff", fillColor: "#111", fillOpacity: 1, weight: 3
  }).addTo(map);
  map.panTo([ride.driverPos.lat, ride.driverPos.lng], { animate: true });
}

function paintRides() {
  const list = state.rides.filter(r => r.status !== "scheduled");
  document.getElementById("rides-screen").innerHTML = `<h2>Trips</h2><p class="fine">Instant hops and finished rides stay on this phone.</p>`
    + (list.length ? list.map(rideCard).join("") : `<div class="card">No trips yet. Hop from Home.</div>`);
  bindRideCards();
}
function paintSched() {
  const list = state.rides.filter(r => r.status === "scheduled" || (r.type === "scheduled" && r.status !== "canceled"));
  const upcoming = state.rides.filter(r => r.status === "scheduled");
  document.getElementById("sched-screen").innerHTML = `
    <h2>Scheduled</h2>
    <p class="fine">Reserve airport, hospital, and shift rides at least 20 minutes ahead.</p>
    <button class="btn" id="new-sched">Schedule a pickup</button>
    <div style="height:12px"></div>
    ${upcoming.length ? upcoming.map(rideCard).join("") : `<div class="card">No upcoming reservations.</div>`}`;
  document.getElementById("new-sched").onclick = () => { ui.mode = "scheduled"; ui.tab = "home"; renderApp(); openSheet("book"); };
  bindRideCards();
}
function rideCard(r) {
  const when = r.when ? new Date(r.when).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Instant";
  return `<article class="card" data-open="${r.id}">
    <div class="row"><b>${r.pickup.name.split(",")[0]} → ${r.dropoff.name.split(",")[0]}</b><span class="gold">${money(r.fare)}</span></div>
    <div class="fine">${r.id} · ${when} · ${r.status}${r.rating ? " · " + r.rating + "★" : ""}</div>
    ${r.status === "scheduled" ? `<div class="split" style="margin-top:8px"><button class="btn" data-dispatch="${r.id}">Dispatch now</button><button class="btn ghost" data-cancel="${r.id}">Cancel</button></div>` : ""}
  </article>`;
}
function bindRideCards() {
  document.querySelectorAll("[data-open]").forEach(el => {
    if (el.querySelector("[data-dispatch]")) return;
    el.onclick = () => openTrip(el.dataset.open);
  });
  document.querySelectorAll("[data-dispatch]").forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const ride = state.rides.find(r => r.id === b.dataset.dispatch);
    ride.status = "searching"; ride.type = "instant"; save();
    ui.tab = "home"; renderApp(); openTrip(ride.id, true); simulate(ride.id);
  });
  document.querySelectorAll("[data-cancel]").forEach(b => b.onclick = (e) => {
    e.stopPropagation(); cancelRide(b.dataset.cancel); ui.tab = "sched"; renderApp();
  });
}
function paintAccount() {
  document.getElementById("account-screen").innerHTML = `
    <h2>${state.rider.name}</h2>
    <p class="fine">${state.rider.phone}</p>
    <div class="card"><div class="row"><div><b>${state.card.brand} •••• ${state.card.last4}</b><div class="fine">Demo wallet. Stripe connects before real charges.</div></div></div></div>
    <div class="card"><b>Saved places</b><div class="fine" style="margin-top:6px">${state.saved.map(id => PLACES.find(p => p.id === id).name).join(" · ")}</div></div>
    <div class="card"><b>Safety</b><div class="fine">Share trip, see plate and name before you get in, and rate every hop. Emergency calling stays with your phone dialer.</div><button class="btn ghost" id="share-safety" style="margin-top:8px">Copy safety card</button></div>
    <div class="card"><b>Service area</b><div class="fine">Toledo, Perrysburg, Maumee, Sylvania, Holland, Rossford, Bowling Green, Findlay, Fremont, Toledo Express.</div></div>
    <button class="btn ghost" id="loc">Set pickup to my location</button>
    <button class="btn danger" id="signout" style="margin-top:8px">Sign out on this phone</button>`;
  document.getElementById("share-safety").onclick = () => {
    const text = `HopRide safety: rider ${state.rider.name}. Plate and driver name show before pickup.`;
    navigator.clipboard && navigator.clipboard.writeText(text);
    toast("Safety card copied.");
  };
  document.getElementById("loc").onclick = () => {
    if (!navigator.geolocation) return toast("Location unavailable.");
    navigator.geolocation.getCurrentPosition(pos => {
      state.pickup = { id: "me", name: "Current location", sub: "GPS", lat: pos.coords.latitude, lng: pos.coords.longitude };
      save(); toast("Pickup set to your location."); ui.tab = "home"; renderApp();
    }, () => toast("Location permission denied. Using Downtown Toledo."));
  };
  document.getElementById("signout").onclick = () => { state.rider = null; save(); boot(); };
}

document.addEventListener("DOMContentLoaded", boot);
