// Nearby named places, via Photon (komoot's OpenStreetMap search).
//
// History: the browser first called Overpass directly. On a real phone in
// Takoradi every Overpass server failed; probing from this function showed
// overpass-api.de refusing work ("at capacity, request queue full") and both
// mirrors not answering even a trivial query. Photon's reverse lookup returns
// several named places around a point in ~0.5 s, so it replaced Overpass.
//
// Running here rather than in the browser gives a proper User-Agent, edge
// caching, and failures in the project's runtime logs.
//
// GET /api/places?lat=4.8849&lng=-1.7634
//   -> { places: [{ name, key, value, lat, lng, street, district, city }] }
// On failure: 502 { error }

const RADIUS_KM = 0.15;
const LIMIT = 20;
// Named things that aren't somewhere you'd be "at".
const SKIP_KEYS = new Set(["highway", "boundary", "place", "railway", "waterway", "route", "natural", "power"]);

function photonUrl(lat, lng) {
  return "https://photon.komoot.io/reverse?lat=" + lat + "&lon=" + lng +
    "&radius=" + RADIUS_KM + "&limit=" + LIMIT + "&lang=en";
}

function normalise(features) {
  return (features || [])
    .map(f => {
      const p = f.properties || {};
      const [lng, lat] = (f.geometry && f.geometry.coordinates) || [];
      if (!p.name || lat == null || SKIP_KEYS.has(p.osm_key)) return null;
      return {
        name: p.name, key: p.osm_key, value: p.osm_value, lat, lng,
        street: p.street || "", district: p.district || p.locality || "", city: p.city || "",
      };
    })
    .filter(Boolean);
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  res.setHeader("Content-Type", "application/json");
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "lat and lng required" }));
  }
  const target = photonUrl(lat.toFixed(5), lng.toFixed(5));
  let lastErr = "";
  // One retry: Photon is fast, so a second try costs little.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch(target, {
        headers: { "User-Agent": "logbook-journal/1.0 (personal journal app)", "Accept": "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      const text = await r.text();
      if (!r.ok) throw new Error("HTTP " + r.status + ": " + text.replace(/\s+/g, " ").slice(0, 200));
      const places = normalise(JSON.parse(text).features);
      res.setHeader("Cache-Control", "public, s-maxage=604800, stale-while-revalidate=86400");
      return res.end(JSON.stringify({ places }));
    } catch (err) {
      lastErr = err.name === "TimeoutError" ? "timed out after 8000 ms" : String(err.message || err);
      console.error("[places] photon attempt " + attempt + " failed for " + lat + "," + lng + ": " + lastErr);
    }
  }
  res.statusCode = 502;
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ error: "Photon failed: " + lastErr }));
};

module.exports.normalise = normalise;
