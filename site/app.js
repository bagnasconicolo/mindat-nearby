/* global L */
import { checkToken, findNearby, localityUrl, MindatError } from './mindat.js';

const RADII = [5, 10, 25, 50];
const TOKEN_KEY = 'mindat_token';
const $ = (id) => document.getElementById(id);

let token = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {}
let radius = 10;
let center = null; // { lat, lon, fromGps }
let results = [];
let selected = null;
let searchId = 0;
let loading = false;

// --- Token ---------------------------------------------------------------

function showTokenForm() {
  $('app').hidden = true;
  $('token-form').hidden = false;
  $('token-input').value = token ?? '';
  $('token-input').focus();
}

function showApp() {
  $('token-form').hidden = true;
  $('app').hidden = false;
  map.invalidateSize();
}

$('token-link').onclick = showTokenForm;

$('token-form').onsubmit = async (e) => {
  e.preventDefault();
  const t = $('token-input').value.trim();
  const button = e.submitter;
  button.disabled = true;
  $('token-error').textContent = '';
  try {
    await checkToken(t);
    token = t;
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {}
    showApp();
    searchFromGps();
  } catch (err) {
    $('token-error').textContent = err instanceof MindatError ? err.message : 'Connessione non riuscita.';
  } finally {
    button.disabled = false;
  }
};

// --- Map -----------------------------------------------------------------

const map = L.map('map').setView([45.07, 7.68], 8);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap',
}).addTo(map);

const layer = L.layerGroup().addTo(map);
const markers = new Map();
const pinStyle = (isSelected) => ({
  radius: isSelected ? 9 : 7,
  color: '#fff',
  weight: 2,
  fillColor: isSelected ? '#1e5b8a' : '#b4521e',
  fillOpacity: 1,
});

map.on('click', (e) => {
  if (!loading) search({ lat: e.latlng.lat, lon: e.latlng.lng, fromGps: false });
});

// --- Search --------------------------------------------------------------

function setStatus(text, isError = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', isError);
}

function setLoading(on) {
  loading = on;
  document.querySelectorAll('#radii button, #gps').forEach((b) => (b.disabled = on));
}

async function search(c) {
  const id = ++searchId;
  center = c;
  selected = null;
  results = [];
  render();
  setLoading(true);
  setStatus('Ricerca in corso…');
  map.fitBounds(L.latLng(c.lat, c.lon).toBounds(radius * 2400));

  try {
    const res = await findNearby(token, c.lat, c.lon, radius, (p) => {
      if (id === searchId) setStatus(`Ricerca… ${p.found} trovate (${p.requests} richieste)`);
    });
    if (id !== searchId) return; // a newer search started
    results = res.localities;
    setStatus(
      `${results.length} località entro ${radius} km` +
        (res.complete ? '' : ' · risultati parziali, prova un raggio più piccolo'),
    );
  } catch (err) {
    if (id !== searchId) return;
    setStatus(err instanceof MindatError ? err.message : 'Connessione non riuscita.', true);
    if (err instanceof MindatError && err.message.startsWith('Token')) showTokenForm();
  } finally {
    if (id === searchId) {
      setLoading(false);
      render();
    }
  }
}

function searchFromGps() {
  if (!navigator.geolocation) {
    setStatus('Geolocalizzazione non disponibile. Clicca sulla mappa per scegliere un punto.', true);
    return;
  }
  setLoading(true);
  setStatus('Ricerca della posizione…');
  navigator.geolocation.getCurrentPosition(
    (pos) => search({ lat: pos.coords.latitude, lon: pos.coords.longitude, fromGps: true }),
    () => {
      setLoading(false);
      setStatus('Posizione non disponibile. Clicca sulla mappa per scegliere un punto.', true);
    },
    { timeout: 15000, maximumAge: 60000 },
  );
}

$('gps').onclick = searchFromGps;

for (const r of RADII) {
  const b = document.createElement('button');
  b.textContent = `${r} km`;
  b.onclick = () => {
    radius = r;
    renderRadii();
    if (center) search(center);
  };
  $('radii').append(b);
}

function renderRadii() {
  [...$('radii').children].forEach((b, i) => b.classList.toggle('active', RADII[i] === radius));
}

// --- Rendering -----------------------------------------------------------

function splitName(txt) {
  const parts = txt.split(', ');
  return { title: parts[0], place: parts.slice(1, 3).join(', ') };
}

function formatDistance(km) {
  if (km === null) return 'senza\ncoordinate';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function select(l, fromMap) {
  const prev = selected;
  selected = l.id;
  markers.get(prev)?.setStyle(pinStyle(false));
  markers.get(l.id)?.setStyle(pinStyle(true)).bringToFront();
  document.querySelectorAll('#list li').forEach((li) => {
    li.classList.toggle('selected', Number(li.dataset.id) === l.id);
  });
  if (fromMap) {
    document.querySelector(`#list li[data-id="${l.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else if (l.latitude !== null) {
    map.setView([l.latitude, l.longitude], Math.max(map.getZoom(), 14));
  }
}

function render() {
  layer.clearLayers();
  markers.clear();
  if (center) {
    L.circle([center.lat, center.lon], {
      radius: radius * 1000,
      color: '#8a3b12',
      opacity: 0.6,
      weight: 1.5,
      fillOpacity: 0.05,
      interactive: false,
    }).addTo(layer);
    if (!center.fromGps) L.marker([center.lat, center.lon], { title: 'Punto di ricerca' }).addTo(layer);
  }

  const list = $('list');
  list.replaceChildren();

  for (const l of results) {
    const { title, place } = splitName(l.txt);

    if (l.latitude !== null) {
      const m = L.circleMarker([l.latitude, l.longitude], pinStyle(false))
        .bindTooltip(title)
        .on('click', () => select(l, true))
        .addTo(layer);
      markers.set(l.id, m);
    }

    const li = el('li');
    li.dataset.id = l.id;
    const row = el('div', 'row');
    const text = el('div');
    text.append(el('div', 'title', title), el('div', 'place', [l.typeName, place].filter(Boolean).join(' · ')));
    row.append(text, el('div', 'distance', formatDistance(l.distanceKm)));
    li.append(row);
    if (l.elements.length) li.append(el('div', 'elements', l.elements.join(' · ')));

    const actions = el('div', 'actions');
    const mindat = el('a', null, 'Apri su Mindat');
    mindat.href = localityUrl(l.id);
    actions.append(mindat);
    if (l.latitude !== null) {
      const nav = el('a', null, 'Naviga');
      nav.href = `https://www.google.com/maps/dir/?api=1&destination=${l.latitude},${l.longitude}`;
      actions.append(nav);
    }
    actions.querySelectorAll('a').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener';
    });
    li.append(actions);
    li.onclick = (e) => {
      if (!e.target.closest('a')) select(l, false);
    };
    list.append(li);
  }

  if (!results.length && center && !loading && !$('status').classList.contains('error')) {
    list.append(el('li', 'empty', 'Nessuna località Mindat in questo raggio. Prova ad allargarlo.'));
  }
}

// --- Start ---------------------------------------------------------------

renderRadii();
if (token) {
  showApp();
  searchFromGps();
} else {
  showTokenForm();
}
