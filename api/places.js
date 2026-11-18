// Server-side proxy for Overpass (OpenStreetMap's query service).
//
// The browser calling public Overpass servers directly failed for every
// server on a real phone in Takoradi, with no way to see why. Running the
// request here sends a proper User-Agent, sidesteps browser and network
// blocking, caches answers at Vercel's edge, and logs each failure to the
// project's runtime logs.
//
// GET /api/places?lat=4.8977&lng=-1.7553  ->  { elements, server, ms }
// On total failure: 502 { error, attempts: [{ server, error }] }

const SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const VENUE_RADIUS = 120;
const AREA_RADIUS = 2000;
const PER_SERVER_MS = 12000;
const STAGGER_MS = 3000;

function buildQuery(lat, lng) {
  const at = lat + "," + lng;
  return "[out:json][timeout:10];" +
    "is_in(" + at + ")->.a;(" +
    "nwr(around:" + VENUE_RADIUS + "," + at + ")[\"name\"];" +
    "node(around:" + AREA_RADIUS + "," + at + ")[\"place\"~\"^(neighbourhood|quarter|suburb|hamlet|village)$\"][\"name\"];" +
    "area.a[\"place\"][\"name\"];" +
    "area.a[\"landuse\"=\"residential\"][\"name\"];" +
    ");out center tags;";
}

async function ask(server, query, signal) {
  const res = await fetch(server, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "logbook-journal/1.0 (personal journal app)",
      "Accept": "application/json",
    },
    body: "data=" + encodeURIComponent(query),
    signal,
  });
  const text = await res.text();
  if (!res.ok) throw new Error("HTTP " + res.status + ": " + text.replace(/\s+/g, " ").slice(0, 200));
  let json;
  try { json = JSON.parse(text); } catch { throw new Error("not JSON: " + text.slice(0, 200)); }
  if (!Array.isArray(json.elements)) throw new Error("no elements: " + text.slice(0, 200));
  if (json.remark && /runtime error|timed out/i.test(json.remark)) throw new Error("remark: " + json.remark);
  return json.elements;
}

// Main server first; each mirror joins STAGGER_MS later. First good answer wins.
function race(query) {
  const attempts = [];
  const ctrls = SERVERS.map(() => new AbortController());
  const started = Date.now();
  return new Promise((resolve, reject) => {
    let failed = 0, done = false;
    SERVERS.forEach((server, i) => {
      setTimeout(async () => {
        if (done) return;
        const timer = setTimeout(() => ctrls[i].abort(), PER_SERVER_MS);
        try {
          const elements = await ask(server, query, ctrls[i].signal);
          if (done) return;
          done = true;
          ctrls.forEach(c => c.abort());
          resolve({ elements, server: new URL(server).host, ms: Date.now() - started, attempts });
        } catch (err) {
          const msg = err.name === "AbortError" ? "timed out after " + PER_SERVER_MS + " ms" : String(err.message || err);
          attempts.push({ server: new URL(server).host, error: msg });
          if (!done) console.error("[places] " + new URL(server).host + " failed: " + msg);
          if (++failed === SERVERS.length && !done) { done = true; reject(attempts); }
        } finally { clearTimeout(timer); }
      }, i * STAGGER_MS);
    });
  });
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "lat and lng required" }));
  }
  // TEMP DIAGNOSTIC: ?probe=photon
  if (url.searchParams.get("probe")) {
    const at = "lat=" + lat + "&lon=" + lng;
    const urls = {
      photon_reverse: "https://photon.komoot.io/reverse?" + at + "&limit=20&radius=0.2&lang=en",
      photon_reverse_nohw: "https://photon.komoot.io/reverse?" + at + "&limit=20&radius=0.2&lang=en&osm_tag=!highway",
      nominatim: "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=en&" + at,
    };
    const report = {};
    await Promise.all(Object.entries(urls).map(async ([k, u]) => {
      const t0 = Date.now();
      try {
        const r = await fetch(u, { headers: { "User-Agent": "logbook-journal/1.0 (personal journal app)" }, signal: AbortSignal.timeout(15000) });
        const txt = await r.text();
        let j; try { j = JSON.parse(txt); } catch { j = txt.slice(0, 300); }
        if (j && j.features) j = j.features.map(f => ({ name: f.properties.name, key: f.properties.osm_key, val: f.properties.osm_value,
          street: f.properties.street, district: f.properties.district, locality: f.properties.locality, city: f.properties.city,
          lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }));
        report[k] = { status: r.status, ms: Date.now() - t0, data: j };
      } catch (e) { report[k] = { ms: Date.now() - t0, error: String(e.message || e) }; }
    }));
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    return res.end(JSON.stringify(report, null, 1));
  }
  // TEMP DIAGNOSTIC: ?debug=1 times each query part on each server.
  if (url.searchParams.get("debug")) {
    const at = lat.toFixed(5) + "," + lng.toFixed(5);
    const parts = {
      trivial: "[out:json][timeout:5];node(1);out ids;",
      venues: "[out:json][timeout:20];nwr(around:" + VENUE_RADIUS + "," + at + ")[\"name\"];out center tags;",
      places: "[out:json][timeout:20];node(around:" + AREA_RADIUS + "," + at + ")[\"place\"~\"^(neighbourhood|quarter|suburb|hamlet|village)$\"][\"name\"];out tags;",
      isin: "[out:json][timeout:20];is_in(" + at + ")->.a;(area.a[\"place\"][\"name\"];area.a[\"landuse\"=\"residential\"][\"name\"];);out tags;",
    };
    const only = url.searchParams.get("server");
    const servers = only ? SERVERS.filter(s => s.includes(only)) : SERVERS;
    const report = [];
    await Promise.all(servers.flatMap(server => Object.entries(parts).map(async ([name, q]) => {
      const t0 = Date.now();
      const c = new AbortController();
      const timer = setTimeout(() => c.abort(), 25000);
      try {
        const el = await ask(server, q, c.signal);
        report.push({ server: new URL(server).host, part: name, ms: Date.now() - t0, n: el.length,
          names: el.map(e => (e.tags && e.tags.name ? e.type + ":" + e.tags.name : null)).filter(Boolean).slice(0, 25) });
      } catch (err) {
        report.push({ server: new URL(server).host, part: name, ms: Date.now() - t0, error: String(err.message || err).slice(0, 200) });
      } finally { clearTimeout(timer); }
    })));
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    return res.end(JSON.stringify(report, null, 1));
  }
  // ~1 m precision is plenty and makes repeat lookups cacheable.
  const q = buildQuery(lat.toFixed(5), lng.toFixed(5));
  res.setHeader("Content-Type", "application/json");
  try {
    const out = await race(q);
    if (out.attempts.length) console.warn("[places] ok via " + out.server + " after failures", out.attempts);
    res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=86400");
    res.end(JSON.stringify(out));
  } catch (attempts) {
    console.error("[places] all servers failed for " + lat + "," + lng, attempts);
    res.statusCode = 502;
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: "all Overpass servers failed", attempts }));
  }
};

module.exports.buildQuery = buildQuery;
