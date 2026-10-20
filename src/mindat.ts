// Client for the Mindat API (https://api.mindat.org/v1/schema/redoc/).
//
// The geo endpoints (/geoloc-point/, /geoloc-poly/) return at most 10 locality
// IDs per request, in no particular order. To get *all* localities within a
// radius we search the bounding box with a quadtree: any cell that comes back
// full (10 results) is split into four and searched again.

const BASE = 'https://api.mindat.org/v1';
const GEO_CAP = 10;
const MAX_DEPTH = 7; // 25 km box → ~400 m cells at the deepest level
const MAX_REQUESTS = 250;
const CONCURRENCY = 6;
const DETAIL_BATCH = 10; // matches the API's page size cap

export type Locality = {
  id: number;
  txt: string;
  latitude: number | null; // null when Mindat has no coordinates for it
  longitude: number | null;
  elements: string[];
  typeName: string | null; // e.g. "Mine", "Quarry", "Commune"
  isArea: boolean; // administrative area rather than a single site
  distanceKm: number | null;
};

export type SearchProgress = { requests: number; found: number };

type Box = { south: number; west: number; north: number; east: number };

export class MindatError extends Error {}

async function request(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new MindatError('Token Mindat non valido.');
  }
  if (!res.ok) {
    throw new MindatError(`Errore Mindat (${res.status}).`);
  }
  return res.json();
}

async function searchBox(token: string, b: Box): Promise<number[]> {
  const ring = [
    [b.west, b.south],
    [b.east, b.south],
    [b.east, b.north],
    [b.west, b.north],
    [b.west, b.south],
  ];
  const ids: (string | number)[] = await request(token, '/geoloc-poly/', {
    method: 'POST',
    body: JSON.stringify({ polygon: { type: 'Polygon', coordinates: [ring] } }),
  });
  return ids.map(Number);
}

function splitBox(b: Box): Box[] {
  const midLat = (b.south + b.north) / 2;
  const midLon = (b.west + b.east) / 2;
  return [
    { south: b.south, west: b.west, north: midLat, east: midLon },
    { south: b.south, west: midLon, north: midLat, east: b.east },
    { south: midLat, west: b.west, north: b.north, east: midLon },
    { south: midLat, west: midLon, north: b.north, east: b.east },
  ];
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function boxAround(lat: number, lon: number, radiusKm: number): Box {
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return { south: lat - dLat, north: lat + dLat, west: lon - dLon, east: lon + dLon };
}

// Returns whether the result is complete (false if the request budget ran out
// before every dense cell could be subdivided).
async function collectIds(
  token: string,
  root: Box,
  ids: Set<number>,
  onProgress: (p: SearchProgress) => void,
): Promise<boolean> {
  let queue: { box: Box; depth: number }[] = [{ box: root, depth: 0 }];
  let requests = 0;
  let complete = true;

  while (queue.length > 0) {
    if (requests >= MAX_REQUESTS) {
      complete = false;
      break;
    }
    const batch = queue.slice(0, Math.min(CONCURRENCY, MAX_REQUESTS - requests));
    queue = queue.slice(batch.length);
    const results = await Promise.all(batch.map(({ box }) => searchBox(token, box)));
    requests += batch.length;

    results.forEach((found, i) => {
      found.forEach((id) => ids.add(id));
      if (found.length >= GEO_CAP) {
        if (batch[i].depth < MAX_DEPTH) {
          splitBox(batch[i].box).forEach((box) =>
            queue.push({ box, depth: batch[i].depth + 1 }),
          );
        } else {
          complete = false;
        }
      }
    });
    onProgress({ requests, found: ids.size });
  }
  return complete;
}

async function fetchDetails(token: string, ids: number[]) {
  const out: any[] = [];
  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += DETAIL_BATCH) batches.push(ids.slice(i, i + DETAIL_BATCH));

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const pages = await Promise.all(
      batches.slice(i, i + CONCURRENCY).map((chunk) =>
        requestAllPages(
          token,
          `/localities/?id_in=${chunk.join(',')}` +
            `&fields=id,txt,latitude,longitude,elements,locality_type&page_size=${chunk.length}`,
        ),
      ),
    );
    pages.forEach((results) => out.push(...results));
  }
  return out;
}

// The API caps pages at 10 results regardless of page_size, so follow `next`.
async function requestAllPages(token: string, path: string) {
  const results: any[] = [];
  let page = await request(token, path);
  results.push(...page.results);
  while (page.next) {
    page = await request(token, page.next.slice(BASE.length));
    results.push(...page.results);
  }
  return results;
}

export async function findNearby(
  token: string,
  lat: number,
  lon: number,
  radiusKm: number,
  onProgress: (p: SearchProgress) => void = () => {},
): Promise<{ localities: Locality[]; complete: boolean }> {
  const ids = new Set<number>();
  const complete = await collectIds(token, boxAround(lat, lon, radiusKm), ids, onProgress);
  const raw = await fetchDetails(token, [...ids]);
  const types = await fetchTypes(token, raw.map((r) => r.locality_type));

  const localities: Locality[] = [];
  for (const r of raw) {
    const type = types.get(r.locality_type);
    // Mindat uses 0,0 for "no coordinates". Such entries are still matched by
    // the geo search (via their geometry); keep real sites, drop admin areas.
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
      isArea: type?.isArea ?? false,
      distanceKm: d,
    });
  }
  localities.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

  return { localities, complete };
}

type LocalityType = { name: string; isArea: boolean };
const typeCache = new Map<number, LocalityType | null>();

async function fetchTypes(token: string, ids: (number | null)[]) {
  const missing = [...new Set(ids)].filter(
    (id): id is number => id != null && !typeCache.has(id),
  );
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    await Promise.all(
      missing.slice(i, i + CONCURRENCY).map(async (id) => {
        try {
          const t = await request(token, `/locality-type/${id}/`);
          typeCache.set(id, { name: t.lt_text, isArea: t.lt_area === 1 });
        } catch {
          typeCache.set(id, null); // e.g. type 0 doesn't exist
        }
      }),
    );
  }
  return new Map(ids.map((id) => [id, id == null ? null : typeCache.get(id) ?? null]));
}

export async function checkToken(token: string) {
  await request(token, '/localities/?page_size=1&fields=id');
}

export function localityUrl(id: number) {
  return `https://www.mindat.org/loc-${id}.html`;
}
