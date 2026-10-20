// Place search (OpenStreetMap Nominatim) and coordinate parsing.

const NOMINATIM = 'https://nominatim.openstreetmap.org';

// Accepts "45.07, 7.68", "45.07 7.68", "45,07; 7,68", Google Maps links
// ("…/@45.07,7.68,12z") and degrees with N/S/E/W ("45.07N 7.68E").
export function parseCoords(text) {
  const s = text.trim();
  const at = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) return valid(Number(at[1]), Number(at[2]));
  const hemi = s.match(/^(\d+(?:[.,]\d+)?)\s*°?\s*([NS])[\s,;]+(\d+(?:[.,]\d+)?)\s*°?\s*([EWO])$/i);
  if (hemi) {
    const lat = num(hemi[1]) * (/s/i.test(hemi[2]) ? -1 : 1);
    const lon = num(hemi[3]) * (/w|o/i.test(hemi[4]) ? -1 : 1);
    return valid(lat, lon);
  }
  const plain = s.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/) ?? s.match(/^(-?\d+,\d+)\s*[;\s]\s*(-?\d+,\d+)$/);
  if (plain) return valid(num(plain[1]), num(plain[2]));
  return null;
}

const num = (x) => Number(String(x).replace(',', '.'));
const valid = (lat, lon) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;

export async function searchPlaces(query, signal) {
  const url = `${NOMINATIM}/search?format=jsonv2&limit=6&accept-language=it&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return (await res.json()).map((r) => ({
    lat: Number(r.lat),
    lon: Number(r.lon),
    name: r.name || r.display_name.split(',')[0],
    detail: r.display_name,
  }));
}

// Short human name for a point ("Ala di Stura"), or null.
export async function placeName(lat, lon) {
  try {
    const res = await fetch(`${NOMINATIM}/reverse?format=jsonv2&zoom=12&accept-language=it&lat=${lat}&lon=${lon}`);
    if (!res.ok) return null;
    const r = await res.json();
    const a = r.address ?? {};
    return a.village ?? a.town ?? a.city ?? a.municipality ?? a.county ?? r.name ?? null;
  } catch {
    return null;
  }
}

export const formatCoords = (lat, lon) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
