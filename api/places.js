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
