// Client for the Mindat API (https://api.mindat.org/v1/schema/redoc/).
//
// The geo endpoint (/geoloc-poly/) returns at most 10 locality IDs per
// request. To get *all* localities within a radius we search the bounding box
// with a quadtree: any cell that comes back full is split into four.

// With a token we call Mindat directly; without one we go through the
// server's proxy (api/v1 on this site), which adds its own token.
const UPSTREAM = 'https://api.mindat.org/v1';
const PROXY = 'api/v1';
const GEO_CAP = 10;
const MAX_DEPTH = 7;
const MAX_REQUESTS = 250;
const CONCURRENCY = 6;
const PAGE = 10; // the API caps pages at 10 results

export class MindatError extends Error {}

async function request(token, path, init = {}, retries = 2) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = `Token ${token}`;
  const res = await fetch((token ? UPSTREAM : PROXY) + path, { ...init, headers });
  if (res.status === 401 || res.status === 403) throw new MindatError('Token Mindat non valido.');
  // The API occasionally times out at the Cloudflare edge; those are worth retrying.
  if (res.status >= 502 && retries > 0) {
    await new Promise((r) => setTimeout(r, 1000));
    return request(token, path, init, retries - 1);
  }
  if (!res.ok) throw new MindatError(`Errore Mindat (${res.status}).`);
  return res.json();
}

// Runs fn over items, CONCURRENCY at a time.
async function inChunks(items, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    out.push(...(await Promise.all(items.slice(i, i + CONCURRENCY).map(fn))));
  }
  return out;
}

async function searchBox(token, b) {
  const ring = [
    [b.west, b.south],
    [b.east, b.south],
    [b.east, b.north],
    [b.west, b.north],
    [b.west, b.south],
  ];
  const ids = await request(token, '/geoloc-poly/', {
    method: 'POST',
    body: JSON.stringify({ polygon: { type: 'Polygon', coordinates: [ring] } }),
  });
  return ids.map(Number);
}

function splitBox(b) {
  const lat = (b.south + b.north) / 2;
  const lon = (b.west + b.east) / 2;
  return [
    { south: b.south, west: b.west, north: lat, east: lon },
    { south: b.south, west: lon, north: lat, east: b.east },
    { south: lat, west: b.west, north: b.north, east: lon },
    { south: lat, west: lon, north: b.north, east: b.east },
  ];
}

export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function boxAround(lat, lon, km) {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.max(Math.cos(lat * (Math.PI / 180)), 0.01));
  return { south: lat - dLat, north: lat + dLat, west: lon - dLon, east: lon + dLon };
}

// Returns false if the request budget ran out before every dense cell was split.
async function collectIds(token, root, ids, onProgress) {
  let queue = [{ box: root, depth: 0 }];
  let requests = 0;
  let complete = true;

  while (queue.length) {
    if (requests >= MAX_REQUESTS) return false;
    const batch = queue.splice(0, Math.min(CONCURRENCY, MAX_REQUESTS - requests));
    const results = await Promise.all(batch.map(({ box }) => searchBox(token, box)));
    requests += batch.length;

    results.forEach((found, i) => {
      found.forEach((id) => ids.add(id));
      if (found.length < GEO_CAP) return;
      const { box, depth } = batch[i];
      if (depth < MAX_DEPTH) splitBox(box).forEach((b) => queue.push({ box: b, depth: depth + 1 }));
      else complete = false;
    });
    onProgress({ requests, found: ids.size });
  }
  return complete;
}

async function allPages(token, path) {
  const results = [];
  let page = await request(token, path);
  results.push(...page.results);
  while (page.next) {
    const next = new URL(page.next);
    page = await request(token, next.pathname.replace(/^\/v1/, '') + next.search);
    results.push(...page.results);
  }
  return results;
}

async function fetchDetails(token, ids) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += PAGE) chunks.push(ids.slice(i, i + PAGE));
  const pages = await inChunks(chunks, (c) =>
    allPages(
      token,
      `/localities/?id_in=${c.join(',')}&fields=id,txt,latitude,longitude,elements,locality_type&page_size=${PAGE}`,
    ),
  );
  return pages.flat();
}

const typeCache = new Map();

async function fetchTypes(token, ids) {
  const missing = [...new Set(ids)].filter((id) => id != null && !typeCache.has(id));
  await inChunks(missing, async (id) => {
    try {
      const t = await request(token, `/locality-type/${id}/`);
      typeCache.set(id, { name: t.lt_text, isArea: t.lt_area === 1 });
    } catch {
      typeCache.set(id, null); // e.g. type 0 doesn't exist
    }
  });
}

export async function findNearby(token, lat, lon, radiusKm, onProgress = () => {}) {
  const ids = new Set();
  const complete = await collectIds(token, boxAround(lat, lon, radiusKm), ids, onProgress);
  const raw = await fetchDetails(token, [...ids]);
  await fetchTypes(token, raw.map((r) => r.locality_type));

  const localities = [];
  for (const r of raw) {
    const type = typeCache.get(r.locality_type) ?? null;
    // Mindat uses 0,0 for "no coordinates": keep real sites, drop admin areas.
    const hasCoords = r.latitude !== 0 || r.longitude !== 0;
    if (!hasCoords && type?.isArea) continue;
    const d = hasCoords ? distanceKm(lat, lon, r.latitude, r.longitude) : null;
    if (d !== null && d > radiusKm) continue;
    localities.push({
      id: r.id,
      txt: r.txt,
      latitude: hasCoords ? r.latitude : null,
      longitude: hasCoords ? r.longitude : null,
      elements: (r.elements ?? '').split('-').filter(Boolean),
      typeName: type?.name ?? null,
      distanceKm: d,
    });
  }
  localities.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  return { localities, complete };
}

// Pass null to check whether this site has a working proxy.
export async function checkToken(token) {
  await request(token, '/localities/?page_size=1&fields=id');
}

export const localityUrl = (id) => `https://www.mindat.org/loc-${id}.html`;
