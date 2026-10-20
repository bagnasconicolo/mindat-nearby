/* global L */
import { checkToken, findNearby, hasProxy, localityDetail, localityUrl, mineralUrl, MindatError } from './mindat.js?v=20261020b';
import { icon } from './icons.js?v=20261020b';
import * as store from './store.js?v=20261020b';
import { formatCoords, parseCoords, placeName, searchPlaces } from './geo.js?v=20261020b';
import * as out from './export.js?v=20261020b';

const RADII = [5, 10, 25, 50];
const TOKEN_KEY = 'mindat_token';
const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const compact = matchMedia('(max-width: 899px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let token = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
} catch {}

const state = {
  view: 'nearby', // nearby | archive | drawers | drawer
  drawerId: null,
  detailId: null,
  radius: 10,
  center: null, // { lat, lon, name, fromGps }
  results: [],
  complete: true,
  loading: false,
  status: '',
  statusError: false,
  filter: '',
  ready: false, // token or proxy available
};
let searchId = 0;

// --- DOM helpers -------------------------------------------------------------

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) e.append(c);
  return e;
}

const button = (label, iconName, onclick, cls = 'btn') =>
  el('button', { type: 'button', class: cls, onclick }, iconName && icon(iconName), label && el('span', {}, label));

const link = (label, iconName, href, cls = 'btn') =>
  el('a', { class: cls, href, target: '_blank', rel: 'noopener' }, iconName && icon(iconName), el('span', {}, label));

const iconButton = (label, iconName, onclick, cls = 'icon-btn') =>
  el('button', { type: 'button', class: cls, 'aria-label': label, title: label, onclick }, icon(iconName));

let toastTimer;
function toast(text, isError = false) {
  const t = $('toast');
  t.textContent = text;
  t.classList.toggle('is-error', isError);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), isError ? 6000 : 3000);
}

const fail = (err) => toast(err?.message || 'Qualcosa non ha funzionato.', true);

function splitName(txt) {
  const parts = txt.split(', ');
  return { title: parts[0], place: parts.slice(1, 4).join(', ') };
}

const formatDistance = (km) => (km == null ? null : km < 1 ? `${Math.round(km * 1000)} m` : `${nf.format(km)} km`);

function distanceFrom(center, p) {
  if (!center || p.latitude == null) return null;
  const rad = Math.PI / 180;
  const a =
    Math.sin(((p.latitude - center.lat) * rad) / 2) ** 2 +
    Math.cos(center.lat * rad) * Math.cos(p.latitude * rad) * Math.sin(((p.longitude - center.lon) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

// Mindat formulas carry <sub>/<sup>; keep those and nothing else.
function formula(html) {
  const frag = document.createDocumentFragment();
  const parts = html.replace(/<(?!\/?(sub|sup)>)[^>]*>/g, '').split(/(<\/?(?:sub|sup)>)/);
  let wrap = null;
  for (const part of parts) {
    const m = part.match(/^<(\/?)(sub|sup)>$/);
    if (m) wrap = m[1] ? null : document.createElement(m[2]);
    else if (part) {
      // DOMParser decodes entities (&middot;, &#9723;) without running anything.
      const text = new DOMParser().parseFromString(part, 'text/html').documentElement.textContent;
      if (wrap) {
        wrap.textContent = text;
        frag.append(wrap);
      } else frag.append(text);
    }
  }
  return frag;
}

// --- Map ---------------------------------------------------------------------

const map = L.map('map', { zoomControl: false }).setView([45.07, 7.68], 8);
L.control.zoom({ position: 'bottomright' }).addTo(map);
const layers = {
  Mappa: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }),
  Topografica: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '&copy; OpenStreetMap, SRTM · OpenTopoMap (CC-BY-SA)',
  }),
  Satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Esri, Maxar, Earthstar Geographics',
  }),
};
let baseName = 'Mappa';
try {
  baseName = localStorage.getItem('mindat_base') in layers ? localStorage.getItem('mindat_base') : 'Mappa';
} catch {}
layers[baseName].addTo(map);
L.control.layers(layers, null, { position: 'topright' }).addTo(map);
map.on('baselayerchange', (e) => {
  try {
    localStorage.setItem('mindat_base', e.name);
  } catch {}
});

const overlay = L.layerGroup().addTo(map);
const markers = new Map();

function pinIcon(p, { index, selected, saved } = {}) {
  const cls = ['pin', selected && 'is-selected', saved && 'is-saved', index != null && 'is-numbered'].filter(Boolean).join(' ');
  return L.divIcon({
    className: '',
    html: `<span class="${cls}">${index != null ? index : ''}</span>`,
    iconSize: index != null ? [24, 24] : [16, 16],
    iconAnchor: index != null ? [12, 12] : [8, 8],
  });
}

map.on('click', (e) => {
  if (state.loading) return;
  const { lat, lng } = e.latlng;
  const go = el('button', { type: 'button', class: 'btn btn-ink btn-small' }, icon('search'), el('span', {}, 'Cerca qui intorno'));
  const popup = L.popup({ closeButton: false, className: 'here-popup' })
    .setLatLng(e.latlng)
    .setContent(go)
    .openOn(map);
  go.onclick = () => {
    map.closePopup(popup);
    search({ lat, lon: lng, fromGps: false });
  };
});

function placesForMap() {
  if (state.view === 'nearby') return state.results;
  if (state.view === 'archive') return store.allPlaces().map((p) => p.data);
  if (state.view === 'drawer') return drawerPlaces().map((e) => e.place);
  return [];
}

// On phones the label sheet covers the lower part of the map.
const mapPadding = (base) => {
  const sheetH = compact.matches ? $('panel').getBoundingClientRect().height : 0;
  return { paddingTopLeft: [base, base], paddingBottomRight: [base, base + sheetH] };
};

function renderMap({ fit = false } = {}) {
  overlay.clearLayers();
  markers.clear();
  const list = placesForMap();
  const numbered = state.view === 'drawer';

  if (state.view === 'nearby' && state.center) {
    L.circle([state.center.lat, state.center.lon], {
      radius: state.radius * 1000,
      color: '#16202a',
      opacity: 0.55,
      weight: 1,
      dashArray: '4 4',
      fillColor: '#16202a',
      fillOpacity: 0.04,
      interactive: false,
    }).addTo(overlay);
    L.marker([state.center.lat, state.center.lon], {
      icon: L.divIcon({ className: '', html: '<span class="center-mark"></span>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      interactive: false,
      keyboard: false,
    }).addTo(overlay);
  }

  if (numbered) {
    const line = list.filter((p) => p.latitude != null).map((p) => [p.latitude, p.longitude]);
    if (line.length > 1) L.polyline(line, { color: '#8a6614', weight: 2.5, opacity: 0.9, dashArray: '6 5' }).addTo(overlay);
  }

  list.forEach((p, i) => {
    if (p.latitude == null) return;
    const m = L.marker([p.latitude, p.longitude], {
      icon: pinIcon(p, { index: numbered ? i + 1 : null, selected: p.id === state.detailId, saved: store.isSaved(p.id) }),
      title: splitName(p.txt).title,
      riseOnHover: true,
      zIndexOffset: p.id === state.detailId ? 1000 : 0,
    })
      .on('click', () => openDetail(p.id))
      .addTo(overlay);
    markers.set(p.id, m);
  });

  if (fit) {
    const pts = list.filter((p) => p.latitude != null).map((p) => [p.latitude, p.longitude]);
    if (state.view === 'nearby' && state.center) {
      map.fitBounds(L.latLng(state.center.lat, state.center.lon).toBounds(state.radius * 2200), mapPadding(8));
    } else if (pts.length) {
      map.fitBounds(L.latLngBounds(pts), { ...mapPadding(40), maxZoom: 14 });
    }
  }
}

function highlight(id, on) {
  markers.get(id)?.getElement()?.querySelector('.pin')?.classList.toggle('is-hover', on);
}

// --- Search ------------------------------------------------------------------

async function search(center) {
  if (!state.ready) return;
  const id = ++searchId;
  state.center = { ...center };
  state.view = 'nearby';
  state.detailId = null;
  state.results = [];
  state.filter = '';
  state.loading = true;
  setStatus('Ricerca in corso…');
  writeHash();
  render();
  renderMap({ fit: true });

  if (!center.name) {
    placeName(center.lat, center.lon).then((name) => {
      if (id !== searchId || !name) return;
      state.center.name = name;
      if (state.view === 'nearby' && !state.detailId) renderPanel();
    });
  }

  try {
    const res = await findNearby(token, center.lat, center.lon, state.radius, (p) => {
      if (id === searchId) setStatus(`Ricerca… ${p.found} località (${p.requests} richieste)`);
    });
    if (id !== searchId) return;
    state.results = res.localities;
    state.complete = res.complete;
    setStatus('');
  } catch (err) {
    if (id !== searchId) return;
    setStatus(
      err instanceof MindatError ? err.message : 'Mindat non risponde. Riprova tra qualche istante.',
      true,
    );
  } finally {
    if (id === searchId) {
      state.loading = false;
      render();
      renderMap();
    }
  }
}

function setStatus(text, isError = false) {
  state.status = text;
  state.statusError = isError;
  const s = document.querySelector('.panel .status');
  if (s) {
    s.textContent = text;
    s.classList.toggle('is-error', isError);
  }
}

function searchFromGps() {
  if (!navigator.geolocation) return toast('Geolocalizzazione non disponibile: cerca un luogo o clicca sulla mappa.', true);
  $('gps').classList.add('is-busy');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      $('gps').classList.remove('is-busy');
      search({ lat: pos.coords.latitude, lon: pos.coords.longitude, fromGps: true, name: 'la tua posizione' });
    },
    () => {
      $('gps').classList.remove('is-busy');
      toast('Posizione non disponibile: cerca un luogo o clicca sulla mappa.', true);
      if (!state.center) render();
    },
    { timeout: 15000, maximumAge: 60000 },
  );
}

function writeHash() {
  if (!state.center) return;
  const h = `#@${state.center.lat.toFixed(5)},${state.center.lon.toFixed(5)},${state.radius}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}

function readHash() {
  const m = location.hash.match(/^#@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+))?/);
  if (!m) return null;
  const r = Number(m[3]);
  if (RADII.includes(r)) state.radius = r;
  return { lat: Number(m[1]), lon: Number(m[2]), fromGps: false };
}

// Place search box: Nominatim suggestions, or coordinates typed/pasted.
const placeInput = $('place-input');
const placeResults = $('place-results');
let suggestTimer;
let suggestAbort;
let suggestions = [];
let activeSuggestion = -1;

function showSuggestions(items) {
  suggestions = items;
  activeSuggestion = -1;
  placeResults.replaceChildren(
    ...items.map((s, i) =>
      el(
        'li',
        { role: 'option', id: `sugg-${i}`, onmousedown: (e) => e.preventDefault(), onclick: () => pickSuggestion(i) },
        el('span', { class: 'sugg-name' }, s.name),
        el('span', { class: 'sugg-detail' }, s.detail),
      ),
    ),
  );
  placeResults.hidden = !items.length;
  placeInput.setAttribute('aria-expanded', String(Boolean(items.length)));
}

function pickSuggestion(i) {
  const s = suggestions[i];
  if (!s) return;
  placeInput.value = s.name;
  showSuggestions([]);
  placeInput.blur();
  search({ lat: s.lat, lon: s.lon, name: s.name, fromGps: false });
}

placeInput.addEventListener('input', () => {
  clearTimeout(suggestTimer);
  suggestAbort?.abort();
  const q = placeInput.value.trim();
  const coords = parseCoords(q);
  if (coords) return showSuggestions([{ ...coords, name: formatCoords(coords.lat, coords.lon), detail: 'Coordinate' }]);
  if (q.length < 3) return showSuggestions([]);
  suggestTimer = setTimeout(async () => {
    suggestAbort = new AbortController();
    try {
      showSuggestions(await searchPlaces(q, suggestAbort.signal));
    } catch (err) {
      if (err.name !== 'AbortError') showSuggestions([]);
    }
  }, 350);
});

placeInput.addEventListener('keydown', (e) => {
  if (placeResults.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = suggestions.length;
    activeSuggestion = (activeSuggestion + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    [...placeResults.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === activeSuggestion)));
    placeInput.setAttribute('aria-activedescendant', `sugg-${activeSuggestion}`);
  } else if (e.key === 'Escape') showSuggestions([]);
});
placeInput.addEventListener('blur', () => setTimeout(() => showSuggestions([]), 150));

$('place-search').onsubmit = async (e) => {
  e.preventDefault();
  if (suggestions.length) return pickSuggestion(Math.max(activeSuggestion, 0));
  const q = placeInput.value.trim();
  if (!q) return;
  try {
    const found = await searchPlaces(q);
    if (found.length) {
      suggestions = found;
      pickSuggestion(0);
    } else toast(`Nessun luogo trovato per “${q}”.`, true);
  } catch {
    toast('Ricerca dei luoghi non disponibile.', true);
  }
};

$('gps').prepend(icon('locate'));
$('gps').onclick = searchFromGps;

for (const r of RADII) {
  $('radii').append(
    el(
      'button',
      {
        type: 'button',
        dataset: { r },
        onclick: () => {
          state.radius = r;
          renderRadii();
          if (state.center) search(state.center);
        },
      },
      `${r} km`,
    ),
  );
}

function renderRadii() {
  for (const b of $('radii').children) b.setAttribute('aria-pressed', String(Number(b.dataset.r) === state.radius));
}

// --- Rail (the cabinet) ----------------------------------------------------

function railButton(view, label, iconName, count) {
  const b = document.querySelector(`.rail-main [data-view="${view}"]`);
  b.replaceChildren(icon(iconName), el('span', { class: 'drawer-name' }, label), count != null ? el('span', { class: 'count num' }, String(count)) : '');
  const active = state.view === view || (view === 'drawers' && state.view === 'drawer');
  b.setAttribute('aria-current', active ? 'page' : 'false');
  b.onclick = () => go(view);
}

function renderRail() {
  railButton('nearby', 'Intorno', 'nearby', state.view === 'nearby' && !state.loading && state.center ? state.results.length : null);
  railButton('archive', 'Archivio', 'archive', store.isAvailable() ? store.allPlaces().length : null);
  railButton('drawers', 'Cassetti', 'drawer', store.isAvailable() ? store.getLists().length : null);

  const ul = $('drawer-list');
  ul.replaceChildren(
    ...store.getLists().map((l) =>
      el(
        'li',
        {},
        el(
          'button',
          {
            type: 'button',
            class: 'drawer drawer-sub',
            dataset: { list: l.id },
            'aria-current': state.view === 'drawer' && state.drawerId === l.id ? 'page' : 'false',
            onclick: () => go('drawer', l.id),
          },
          el('span', { class: 'holder' }, el('span', { class: 'drawer-name' }, l.name)),
          el('span', { class: 'count num' }, String(l.items.length)),
        ),
      ),
    ),
  );
  if (!store.getLists().length && store.isAvailable()) {
    ul.append(el('li', { class: 'rail-empty' }, 'Crea un cassetto per ogni uscita o zona.'));
  }
  $('new-drawer').hidden = !store.isAvailable();
  $('user-email').textContent = store.userEmail() ?? '';
}

$('new-drawer').querySelector('button').append(icon('plus'));
$('new-drawer').onsubmit = async (e) => {
  e.preventDefault();
  const input = e.target.elements.name;
  const name = input.value.trim();
  if (!name) return input.focus();
  try {
    const l = await store.createList(name);
    input.value = '';
    go('drawer', l.id);
  } catch (err) {
    fail(err);
  }
};

function go(view, drawerId = null) {
  state.view = view;
  state.drawerId = drawerId;
  state.detailId = null;
  render();
  renderMap({ fit: view !== 'nearby' || !state.center });
  $('panel').scrollTop = 0;
}

// The signature moment: the label slides into its drawer.
function fileInto(sourceEl, target) {
  if (!sourceEl || !target || reducedMotion.matches) {
    target?.classList.add('bump');
    setTimeout(() => target?.classList.remove('bump'), 400);
    return;
  }
  const a = sourceEl.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  if (!b.width) return;
  const ghost = sourceEl.cloneNode(true);
  ghost.classList.add('ghost');
  Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  document.body.append(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  ghost
    .animate(
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 12}px) scale(0.7) rotate(-2deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.08)`, opacity: 0.2 },
      ],
      { duration: 520, easing: 'cubic-bezier(.3,.7,.2,1)' },
    )
    .finished.then(() => {
      ghost.remove();
      target.classList.add('bump');
      setTimeout(() => target.classList.remove('bump'), 400);
    });
}

const railTarget = (listId) =>
  (listId != null && !compact.matches && document.querySelector(`.drawer-sub[data-list="${listId}"]`)) ||
  document.querySelector(`.rail-main [data-view="${listId != null ? 'drawers' : 'archive'}"]`);

// --- Details (minerals, description) ----------------------------------------

const details = new Map(); // id -> Promise

const partials = new Map(); // id -> locality info without minerals, while loading

function getDetail(id) {
  if (!details.has(id)) {
    const p = localityDetail(token, id, (base) => {
      partials.set(id, base);
      if (state.detailId === id) redrawDetail?.(true);
    });
    details.set(id, p);
    p.then(
      (d) => {
        // Keep archived snapshots complete for printing and exports.
        const saved = store.getPlace(id);
        if (saved && !saved.data.minerals) store.savePlace(d).catch(() => {});
      },
      () => details.delete(id),
    );
  }
  return details.get(id);
}

async function ensureDetails(entries) {
  const missing = entries.filter((e) => !e.place.minerals);
  for (let i = 0; i < missing.length; i++) {
    toast(`Preparo i dati… ${i + 1}/${missing.length}`);
    try {
      const d = await getDetail(missing[i].place.id);
      Object.assign(missing[i].place, d);
    } catch {}
  }
  return entries;
}

function findPlace(id) {
  return (
    state.results.find((r) => r.id === id) ?? store.getPlace(id)?.data ?? null
  );
}

// --- Filing ------------------------------------------------------------------

async function archive(p, sourceEl) {
  try {
    const { distanceKm, ...data } = p;
    const pending = store.savePlace(data);
    fileInto(sourceEl, railTarget(null));
    await pending;
    getDetail(p.id); // fills minerals into the snapshot
  } catch (err) {
    fail(err);
  }
}

async function unarchive(p) {
  const lists = store.listsWith(p.id);
  if (lists.length && !confirm(`Togliere “${splitName(p.txt).title}” dall’archivio e da ${lists.length} cassett${lists.length === 1 ? 'o' : 'i'}?`)) return;
  try {
    await store.removePlace(p.id);
    toast('Tolto dall’archivio.');
  } catch (err) {
    fail(err);
  }
}

async function toggleDrawer(p, listId, sourceEl) {
  try {
    if (!store.isSaved(p.id)) {
      const { distanceKm, ...data } = p;
      await store.savePlace(data);
      getDetail(p.id);
    }
    const wasIn = store.getList(listId).items.includes(p.id);
    await store.toggleInList(listId, p.id);
    if (!wasIn) fileInto(sourceEl, railTarget(listId));
  } catch (err) {
    fail(err);
  }
}

// A small menu that escapes the scrolling panel (popover API).
function openMenu(anchor, build) {
  const menu = $('menu');
  if (menu.matches(':popover-open')) menu.hidePopover();
  menu.replaceChildren(...build(() => menu.hidePopover()));
  menu.showPopover();
  const r = anchor.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.right - m.width), innerWidth - m.width - 8);
  const top = r.bottom + m.height + 8 > innerHeight ? Math.max(8, r.top - m.height - 4) : r.bottom + 4;
  Object.assign(menu.style, { left: `${left}px`, top: `${top}px` });
  menu.querySelector('button, input, a')?.focus();
}

function drawerMenu(p, anchor, sourceEl) {
  openMenu(anchor, (close) => {
    const items = store.getLists().map((l) => {
      const inIt = l.items.includes(p.id);
      return el(
        'button',
        {
          type: 'button',
          class: 'menu-item',
          role: 'menuitemcheckbox',
          'aria-checked': String(inIt),
          onclick: async () => {
            close();
            await toggleDrawer(p, l.id, sourceEl);
          },
        },
        el('span', { class: 'check' }, inIt ? icon('check') : ''),
        el('span', {}, l.name),
        el('span', { class: 'num muted' }, String(l.items.length)),
      );
    });
    const form = el(
      'form',
      {
        class: 'menu-new',
        onsubmit: async (e) => {
          e.preventDefault();
          const name = e.target.elements.name.value.trim();
          if (!name) return;
          close();
          try {
            const l = await store.createList(name);
            await toggleDrawer(p, l.id, sourceEl);
          } catch (err) {
            fail(err);
          }
        },
      },
      el('input', { name: 'name', placeholder: 'Nuovo cassetto…', 'aria-label': 'Nome del nuovo cassetto', maxlength: 80, autocomplete: 'off' }),
      el('button', { type: 'submit', class: 'icon-btn', 'aria-label': 'Crea e aggiungi' }, icon('plus')),
    );
    return [el('p', { class: 'menu-caption' }, 'Metti nel cassetto'), ...items, form];
  });
}

// --- Labels ------------------------------------------------------------------

// Element symbols set inline, like the chemistry line on a printed label.
// In the results stack each symbol filters the list.
function elementLine(elements, max = 24) {
  const shown = elements.slice(0, max);
  return el(
    'span',
    { class: 'elements' },
    shown.map((s) =>
      state.view === 'nearby' && state.detailId == null
        ? el(
            'button',
            {
              type: 'button',
              title: `Mostra solo le località con ${s}`,
              onclick: (e) => {
                e.stopPropagation();
                state.filter = s;
                renderPanel();
              },
            },
            s,
          )
        : el('span', {}, s),
    ),
    elements.length > max && el('span', { class: 'more' }, `+${elements.length - max}`),
  );
}

// Compact label for stacks. `order` adds reorder controls inside a drawer.
function label(p, { order, index, note } = {}) {
  const { title, place } = splitName(p.txt);
  const saved = store.isSaved(p.id);
  const dist = formatDistance(p.distanceKm ?? distanceFrom(state.view === 'nearby' ? state.center : null, p));
  const lists = store.listsWith(p.id);
  const isType = p.minerals?.some((m) => m.typeLocality);
  const card = el(
    'article',
    {
      class: `label${saved ? ' is-saved' : ''}${isType ? ' is-type' : ''}`,
      dataset: { id: p.id },
      tabindex: 0,
      onclick: (e) => {
        if (!e.target.closest('button, a')) openDetail(p.id);
      },
      onkeydown: (e) => {
        if (e.key === 'Enter' && e.target === card) openDetail(p.id);
      },
      onmouseenter: () => highlight(p.id, true),
      onmouseleave: () => highlight(p.id, false),
    },
    el(
      'header',
      { class: 'label-head' },
      index != null && el('span', { class: 'stop num' }, String(index)),
      el('h3', { class: 'label-name' }, title),
      el('span', { class: 'cat num', title: 'Numero della località su Mindat' }, `N. ${p.id}`),
    ),
    place && el('p', { class: 'label-place' }, place),
    el(
      'dl',
      { class: 'fields' },
      p.typeName && el('div', {}, el('dt', {}, 'Tipo'), el('dd', {}, p.typeName)),
      (dist || p.latitude == null) &&
        el('div', {}, el('dt', {}, 'Distanza'), el('dd', { class: 'num' }, dist ?? 'senza coordinate')),
      p.minerals?.length > 0 &&
        el(
          'div',
          {},
          el('dt', {}, 'Minerali'),
          el(
            'dd',
            {},
            p.minerals.slice(0, 6).map((m, i) => [i ? ', ' : '', m.typeLocality ? el('b', { class: 'tl' }, m.name) : m.name]),
            p.minerals.length > 6 ? ` e altri ${p.minerals.length - 6}` : '',
          ),
        ),
      p.elements?.length > 0 &&
        !p.minerals?.length &&
        el('div', {}, el('dt', {}, 'Elementi'), el('dd', {}, elementLine(p.elements))),
      note && el('div', {}, el('dt', {}, 'Note'), el('dd', { class: 'note-line' }, note)),
    ),
    el(
      'footer',
      { class: 'label-actions' },
      store.isAvailable() &&
        (saved
          ? el(
              'button',
              {
                type: 'button',
                class: 'btn btn-small btn-filed',
                onclick: (e) => drawerMenu(p, e.currentTarget, card),
              },
              icon('drawer'),
              el('span', {}, lists.length ? lists.map((l) => l.name).join(', ') : 'Archiviato'),
            )
          : button('Archivia', 'archive', () => archive(p, card), 'btn btn-small btn-archive')),
      p.latitude != null && link('Naviga', 'navigation', out.mapsDirectionsUrl(p), 'btn btn-small btn-quiet'),
      order &&
        el(
          'span',
          { class: 'reorder' },
          iconButton('Sposta su', 'up', () => order.move(-1)),
          iconButton('Sposta giù', 'down', () => order.move(1)),
          iconButton('Togli dal cassetto', 'close', () => order.remove()),
        ),
    ),
  );
  return card;
}

// --- Panel -------------------------------------------------------------------

function render() {
  renderRail();
  renderRadii();
  renderPanel();
  $('gps').disabled = state.loading || !state.ready;
  $('radii').querySelectorAll('button').forEach((b) => (b.disabled = state.loading));
}

function renderPanel() {
  const panel = $('panel-body');
  let content;
  if (!state.ready) content = tokenForm();
  else if (state.detailId != null) content = detailView(state.detailId);
  else if (state.view === 'archive') content = archiveView();
  else if (state.view === 'drawers') content = drawersView();
  else if (state.view === 'drawer') content = drawerView();
  else content = nearbyView();
  panel.replaceChildren(content);
}

function stackHead(titleNodes, sub, tools) {
  return el(
    'header',
    { class: 'stack-head' },
    el('h2', {}, titleNodes),
    sub && el('p', { class: 'stack-sub' }, sub),
    tools && el('div', { class: 'toolbar' }, tools),
  );
}

function nearbyView() {
  const wrap = el('div', { class: 'stack' });
  const c = state.center;
  if (!c) {
    wrap.append(
      stackHead('Cosa c’è qui intorno?'),
      el(
        'div',
        { class: 'empty' },
        el('p', {}, 'Cerca un luogo, incolla delle coordinate, usa la tua posizione oppure clicca un punto sulla mappa.'),
        el('p', {}, 'Le località Mindat nel raggio scelto compaiono qui come cartellini: aprili per leggere minerali e descrizione, archiviali e mettili nei cassetti per le uscite.'),
        button('Usa la mia posizione', 'locate', searchFromGps, 'btn btn-ink'),
      ),
    );
    return wrap;
  }
  const where = c.name ?? formatCoords(c.lat, c.lon);
  const filtered = state.filter
    ? state.results.filter((r) => r.elements.includes(state.filter) || r.txt.toLowerCase().includes(state.filter.toLowerCase()))
    : state.results;

  wrap.append(
    stackHead(
      state.loading ? `Intorno a ${where}` : [`${state.results.length} località`, el('span', { class: 'head-light' }, ` entro ${state.radius} km da ${where}`)],
      null,
      !state.loading &&
        state.results.length > 0 && [
          el(
            'label',
            { class: 'filter' },
            icon('search'),
            el('input', {
              type: 'search',
              placeholder: 'Filtra per nome o elemento (es. Cu)',
              value: state.filter,
              'aria-label': 'Filtra i risultati',
              oninput: (e) => {
                state.filter = e.target.value.trim();
                const list = document.querySelector('.labels');
                const res = state.filter
                  ? state.results.filter(
                      (r) =>
                        r.elements.includes(state.filter) || r.txt.toLowerCase().includes(state.filter.toLowerCase()),
                    )
                  : state.results;
                list?.replaceChildren(...res.map((r) => label(r)));
              },
            }),
          ),
        ],
    ),
  );
  wrap.append(el('p', { class: `status${state.statusError ? ' is-error' : ''}` }, state.status));
  if (!state.loading && !state.complete) {
    wrap.append(el('p', { class: 'notice' }, 'Risultati parziali: la zona è molto ricca. Prova un raggio più piccolo.'));
  }
  if (state.loading) {
    wrap.append(el('div', { class: 'labels' }, [0, 1, 2].map(() => el('div', { class: 'label skeleton', 'aria-hidden': 'true' }))));
  } else if (!state.results.length && !state.statusError) {
    wrap.append(el('div', { class: 'empty' }, el('p', {}, `Nessuna località Mindat entro ${state.radius} km. Prova ad allargare il raggio.`)));
  } else {
    wrap.append(el('div', { class: 'labels' }, filtered.map((r) => label(r))));
  }
  return wrap;
}

function unavailable() {
  return el('div', { class: 'empty' }, el('p', {}, 'L’archivio non è disponibile su questa installazione: serve il server di mindat.chicubo.it.'));
}

const entryOf = (p) => ({ place: { ...p.data }, note: p.note });

function collectionTools(name, getEntries, extra = []) {
  const entries = () => getEntries();
  return [
    el(
      'button',
      {
        type: 'button',
        class: 'btn btn-small btn-ink',
        onclick: (e) => {
          const legs = out.mapsRouteLegs(entries().map((x) => x.place));
          if (!legs.length) return toast('Nessun luogo con coordinate.', true);
          if (legs.length === 1) return window.open(legs[0].url, '_blank', 'noopener');
          openMenu(e.currentTarget, (close) => [
            el('p', { class: 'menu-caption' }, 'Google Maps accetta 9 tappe per volta'),
            ...legs.map((l, i) =>
              el('a', { class: 'menu-item', href: l.url, target: '_blank', rel: 'noopener', onclick: close }, el('span', {}, `Tratto ${i + 1}: tappe ${l.from}–${l.to}`)),
            ),
          ]);
        },
      },
      icon('route'),
      el('span', {}, 'Percorso su Google Maps'),
    ),
    el(
      'button',
      {
        type: 'button',
        class: 'btn btn-small',
        onclick: (e) =>
          openMenu(e.currentTarget, (close) => {
            const act = (label, fn) =>
              el('button', { type: 'button', class: 'menu-item', onclick: async () => { close(); await fn(); } }, el('span', {}, label));
            return [
              el('p', { class: 'menu-caption' }, 'PDF (stampa → Salva come PDF)'),
              act('Cartellini da ritagliare', async () => out.printLabels(await ensureDetails(entries()))),
              act('Catalogo con minerali e descrizioni', async () => out.printCatalogue(name, await ensureDetails(entries()))),
              el('p', { class: 'menu-caption' }, 'File'),
              act('KML · Google My Maps, Google Earth', async () => out.downloadKml(name, await ensureDetails(entries()))),
              act('GPX · navigatori e app GPS', async () => out.downloadGpx(name, await ensureDetails(entries()))),
              act('CSV · foglio di calcolo', async () => out.downloadCsv(name, await ensureDetails(entries()))),
            ];
          }),
      },
      icon('download'),
      el('span', {}, 'Esporta'),
    ),
    ...extra,
  ];
}

function archiveView() {
  const wrap = el('div', { class: 'stack' });
  if (!store.isAvailable()) return wrap.appendChild(unavailable()).parentNode;
  const all = store.allPlaces();
  wrap.append(
    stackHead(
      ['Archivio', el('span', { class: 'head-light num' }, ` · ${all.length}`)],
      'Tutti i luoghi che hai archiviato, dal più recente.',
      all.length > 0 && collectionTools('Archivio Mindat', () => all.map(entryOf)),
    ),
  );
  if (!all.length) {
    wrap.append(
      el(
        'div',
        { class: 'empty' },
        el('p', {}, 'L’archivio è vuoto.'),
        el('p', {}, 'Premi “Archivia” su un cartellino per conservarlo qui, con minerali e descrizione, su tutti i tuoi dispositivi.'),
      ),
    );
  } else {
    wrap.append(el('div', { class: 'labels' }, all.map((p) => label({ ...p.data, distanceKm: null }, { note: p.note }))));
  }
  return wrap;
}

function drawersView() {
  const wrap = el('div', { class: 'stack' });
  if (!store.isAvailable()) return wrap.appendChild(unavailable()).parentNode;
  wrap.append(stackHead('Cassetti', 'Un cassetto per ogni uscita, zona o tema.'));
  const ul = el(
    'ul',
    { class: 'drawer-cards' },
    store.getLists().map((l) =>
      el(
        'li',
        {},
        el(
          'button',
          { type: 'button', class: 'drawer-card', onclick: () => go('drawer', l.id) },
          el('span', { class: 'holder' }, el('span', { class: 'drawer-name' }, l.name)),
          el('span', { class: 'count num' }, `${l.items.length} luogh${l.items.length === 1 ? 'o' : 'i'}`),
        ),
      ),
    ),
  );
  const form = el(
    'form',
    {
      class: 'new-drawer new-drawer-wide',
      onsubmit: async (e) => {
        e.preventDefault();
        const name = e.target.elements.name.value.trim();
        if (!name) return;
        try {
          const l = await store.createList(name);
          go('drawer', l.id);
        } catch (err) {
          fail(err);
        }
      },
    },
    el('input', { name: 'name', placeholder: 'Nome del nuovo cassetto', 'aria-label': 'Nome del nuovo cassetto', maxlength: 80, autocomplete: 'off' }),
    el('button', { type: 'submit', class: 'btn btn-brass' }, icon('plus'), el('span', {}, 'Crea')),
  );
  wrap.append(ul, form);
  return wrap;
}

function drawerPlaces() {
  const l = store.getList(state.drawerId);
  if (!l) return [];
  return l.items.map((id) => store.getPlace(id)).filter(Boolean).map(entryOf);
}

// Nearest-neighbour ordering from the first stop: a decent route for a day out.
function optimizeOrder(entries) {
  const withC = entries.filter((e) => e.place.latitude != null);
  const without = entries.filter((e) => e.place.latitude == null);
  if (withC.length < 3) return entries;
  const route = [withC.shift()];
  while (withC.length) {
    const last = route[route.length - 1].place;
    let best = 0;
    let bestD = Infinity;
    withC.forEach((e, i) => {
      const d = distanceFrom({ lat: last.latitude, lon: last.longitude }, e.place);
      if (d < bestD) [best, bestD] = [i, d];
    });
    route.push(withC.splice(best, 1)[0]);
  }
  return [...route, ...without];
}

function drawerView() {
  const l = store.getList(state.drawerId);
  const wrap = el('div', { class: 'stack' });
  if (!l) {
    wrap.append(el('div', { class: 'empty' }, el('p', {}, 'Questo cassetto non esiste più.')));
    return wrap;
  }
  const entries = drawerPlaces();
  const ids = entries.map((e) => e.place.id);

  const rename = iconButton('Rinomina', 'pencil', async () => {
    const name = prompt('Nuovo nome del cassetto', l.name);
    if (name && name.trim() && name.trim() !== l.name) {
      try {
        await store.renameList(l.id, name.trim());
      } catch (err) {
        fail(err);
      }
    }
  });

  const head = el(
    'header',
    { class: 'stack-head drawer-head' },
    compact.matches && button('Cassetti', 'back', () => go('drawers'), 'btn btn-small btn-quiet back'),
    el('div', { class: 'drawer-plate' }, el('h2', {}, l.name), rename),
    el('p', { class: 'stack-sub num' }, `${entries.length} luogh${entries.length === 1 ? 'o' : 'i'} · in ordine di percorso`),
    entries.length > 0 &&
      el(
        'div',
        { class: 'toolbar' },
        collectionTools(l.name, drawerPlaces, [
          entries.length > 2 &&
            button('Ordina per percorso', 'route', async () => {
              try {
                await store.setItems(l.id, optimizeOrder(entries).map((e) => e.place.id));
                renderMap({ fit: true });
                toast('Ordinati dal primo luogo, sempre verso il più vicino.');
              } catch (err) {
                fail(err);
              }
            }, 'btn btn-small btn-quiet'),
        ]),
      ),
  );
  wrap.append(head);

  if (!entries.length) {
    wrap.append(
      el(
        'div',
        { class: 'empty' },
        el('p', {}, 'Il cassetto è vuoto.'),
        el('p', {}, 'Dai cartellini, usa il pulsante dell’archivio per mettere un luogo in questo cassetto.'),
        button('Cerca località', 'search', () => go('nearby'), 'btn btn-ink'),
      ),
    );
  } else {
    wrap.append(
      el(
        'div',
        { class: 'labels' },
        entries.map((e, i) =>
          label(e.place, {
            index: i + 1,
            note: e.note,
            order: {
              move: async (d) => {
                const j = i + d;
                if (j < 0 || j >= ids.length) return;
                const next = [...ids];
                [next[i], next[j]] = [next[j], next[i]];
                try {
                  await store.setItems(l.id, next);
                  renderMap();
                } catch (err) {
                  fail(err);
                }
              },
              remove: async () => {
                try {
                  await store.setItems(l.id, ids.filter((x) => x !== e.place.id));
                  renderMap();
                } catch (err) {
                  fail(err);
                }
              },
            },
          }),
        ),
      ),
    );
  }

  wrap.append(
    el(
      'div',
      { class: 'danger-zone' },
      button('Elimina cassetto', 'trash', async () => {
        if (!confirm(`Eliminare il cassetto “${l.name}”? I luoghi restano nell’archivio.`)) return;
        try {
          await store.deleteList(l.id);
          go(compact.matches ? 'drawers' : 'archive');
        } catch (err) {
          fail(err);
        }
      }, 'btn btn-small btn-danger'),
    ),
  );
  return wrap;
}

// Full specimen label.
function openDetail(id) {
  state.detailId = id;
  raiseSheet();
  renderPanel();
  renderMap();
  const p = findPlace(id);
  if (p?.latitude != null) {
    const target = L.latLng(p.latitude, p.longitude);
    if (!map.getBounds().pad(-0.15).contains(target)) map.panTo(target);
  }
  $('panel').scrollTop = 0;
}

function closeDetail() {
  state.detailId = null;
  renderPanel();
  renderMap();
}

function detailView(id) {
  const base = findPlace(id);
  const back = el(
    'div',
    { class: 'detail-nav' },
    button({ nearby: 'Risultati', archive: 'Archivio', drawer: store.getList(state.drawerId)?.name ?? 'Cassetto', drawers: 'Cassetti' }[state.view], 'back', closeDetail, 'btn btn-small btn-quiet back'),
  );
  const wrap = el('div', { class: 'detail' }, back);
  if (!base) {
    wrap.append(el('div', { class: 'empty' }, el('p', {}, 'Luogo non disponibile.')));
    return wrap;
  }
  const card = el('article', { class: 'label label-full' });
  wrap.append(card);

  let lastD = null;
  let lastState = 'loading';
  let showAllMinerals = false;
  redrawDetail = (partial) => {
    // Don't yank the note field from under the user's fingers.
    if (document.activeElement?.id === 'note-input') return;
    if (partial && !lastD) draw(base, partials.get(id), 'loading');
    else draw(base, lastD, lastState);
  };
  const draw = (p, d, loadState) => {
    lastD = d;
    lastState = loadState;
    const { title } = splitName(p.txt);
    const hierarchy = p.txt.split(', ').slice(1).join(', ');
    const saved = store.isSaved(p.id);
    const savedRec = store.getPlace(p.id);
    const dist = formatDistance(distanceFrom(state.center, p));
    const minerals = d?.minerals ?? p.minerals;
    const description = d?.description ?? p.description;
    const hasTL = minerals?.some((m) => m.typeLocality);

    card.classList.toggle('is-saved', saved);
    card.classList.toggle('is-type', Boolean(hasTL));
    const MINERALS_SHOWN = 16;
    const shownMinerals = minerals && !showAllMinerals ? minerals.slice(0, MINERALS_SHOWN) : minerals;

    card.replaceChildren(
      el(
        'header',
        { class: 'label-head' },
        el('h2', { class: 'label-name' }, title),
        el('span', { class: 'cat num', title: 'Numero della località su Mindat' }, `Mindat N. ${p.id}`),
      ),
      hierarchy && el('p', { class: 'label-place' }, hierarchy),
      (hasTL || saved) &&
        el(
          'p',
          { class: 'marks' },
          hasTL && el('span', { class: 'type-mark' }, 'Località tipo'),
          saved && el('span', { class: 'filed-mark' }, icon('check'), 'Archiviato'),
        ),
      el(
        'dl',
        { class: 'fields fields-ruled' },
        el('div', {}, el('dt', {}, 'Tipo'), el('dd', {}, p.typeName ?? '—')),
        el(
          'div',
          {},
          el('dt', {}, 'Coordinate'),
          el(
            'dd',
            { class: 'num coords' },
            p.latitude != null
              ? [
                  formatCoords(p.latitude, p.longitude),
                  iconButton('Copia coordinate', 'copy', async () => {
                    try {
                      await navigator.clipboard.writeText(formatCoords(p.latitude, p.longitude));
                      toast('Coordinate copiate.');
                    } catch {
                      toast('Copia non riuscita.', true);
                    }
                  }, 'icon-btn icon-btn-small'),
                ]
              : 'non indicate su Mindat',
          ),
        ),
        dist && el('div', {}, el('dt', {}, 'Distanza'), el('dd', { class: 'num' }, `${dist} da ${state.center?.name ?? 'centro ricerca'}`)),
        p.elements?.length > 0 && el('div', {}, el('dt', {}, 'Elementi'), el('dd', {}, elementLine(p.elements, 99))),
      ),
      el(
        'footer',
        { class: 'label-actions detail-actions' },
        store.isAvailable() &&
          (saved
            ? button('Metti in un cassetto', 'drawer', (e) => drawerMenu(d ?? p, e.currentTarget, card), 'btn btn-brass')
            : button('Archivia', 'archive', () => archive(d ?? p, card), 'btn btn-brass')),
        p.latitude != null && link('Naviga', 'navigation', out.mapsDirectionsUrl(p), 'btn btn-ink'),
        p.latitude != null && link('Google Maps', 'map', out.mapsPlaceUrl(p), 'btn'),
        p.latitude != null &&
          button('Cerca qui intorno', 'search', () => search({ lat: p.latitude, lon: p.longitude, name: title }), 'btn'),
        button('Stampa cartellino', 'printer', async () => {
          const full = d ?? (await getDetail(p.id).catch(() => p));
          out.printLabels([{ place: { ...p, ...full }, note: store.getPlace(p.id)?.note }]);
        }, 'btn'),
      ),
      el(
        'section',
        { class: 'description' },
        el('h3', { class: 'field-caption' }, 'Descrizione'),
        description
          ? el('p', { class: 'desc' }, description)
          : el('p', { class: 'muted' }, loadState === 'loading' ? 'Caricamento…' : 'Nessuna descrizione su Mindat.'),
        el('a', { class: 'more-link', href: localityUrl(p.id), target: '_blank', rel: 'noopener' }, 'Scheda completa, foto e bibliografia su Mindat', icon('external')),
      ),
      el(
        'section',
        { class: 'minerals' },
        el(
          'h3',
          { class: 'field-caption' },
          'Minerali',
          minerals && el('span', { class: 'num muted' }, ` · ${minerals.length}`),
          hasTL && el('span', { class: 'legend' }, el('b', { class: 'tl' }, 'rosso'), ' = località tipo'),
        ),
        minerals
          ? minerals.length
            ? [
                el(
                  'ul',
                  { class: 'mineral-list' },
                  shownMinerals.map((m) =>
                    el(
                      'li',
                      { class: m.typeLocality ? 'is-tl' : '' },
                      el('a', { href: mineralUrl(m.id), target: '_blank', rel: 'noopener' }, m.name),
                      m.questioned && el('span', { class: 'q', title: 'Presenza dubbia' }, '?'),
                      m.formula && el('span', { class: 'formula' }, formula(m.formula)),
                    ),
                  ),
                ),
                minerals.length > MINERALS_SHOWN &&
                  button(
                    showAllMinerals ? 'Mostra meno minerali' : `Tutti i ${minerals.length} minerali`,
                    showAllMinerals ? 'up' : 'down',
                    () => {
                      showAllMinerals = !showAllMinerals;
                      draw(p, d, loadState);
                    },
                    'btn btn-small btn-quiet more-minerals',
                  ),
              ]
            : el('p', { class: 'muted' }, 'Nessun minerale registrato su Mindat.')
          : loadState === 'error'
            ? el('p', { class: 'is-error' }, 'Mindat non ha risposto. ', button('Riprova', null, () => load(), 'btn btn-small btn-quiet'))
            : el('div', { class: 'mineral-skeleton', 'aria-label': 'Caricamento minerali' }, [0, 1, 2, 3, 4, 5].map(() => el('span'))),
      ),
      saved &&
        el(
          'section',
          { class: 'notes' },
          el('h3', { class: 'field-caption' }, el('label', { for: 'note-input' }, 'Note')),
          el('textarea', {
            id: 'note-input',
            rows: 3,
            maxlength: 4000,
            placeholder: 'Accesso, parcheggio, cosa hai trovato…',
            oninput: (e) => saveNote(p.id, e.target.value),
          }),
        ),
      saved &&
        store.getLists().length > 0 &&
        el(
          'section',
          {},
          el('h3', { class: 'field-caption' }, 'Cassetti'),
          el(
            'div',
            { class: 'chips' },
            store.getLists().map((l) =>
              el(
                'button',
                {
                  type: 'button',
                  class: 'chip',
                  'aria-pressed': String(l.items.includes(p.id)),
                  onclick: () => toggleDrawer(d ?? p, l.id, card),
                },
                l.items.includes(p.id) ? icon('check') : icon('plus'),
                l.name,
              ),
            ),
          ),
        ),
      saved && el('div', { class: 'danger-zone' }, button('Togli dall’archivio', 'trash', () => unarchive(p), 'btn btn-small btn-danger')),
    );
    const ta = card.querySelector('#note-input');
    if (ta) ta.value = savedRec?.note ?? '';
  };

  const load = () => {
    draw(base, partials.get(id) ?? null, 'loading');
    getDetail(id).then(
      (d) => state.detailId === id && draw(base, d, 'done'),
      () => state.detailId === id && draw(base, null, 'error'),
    );
  };
  load();
  return wrap;
}

let redrawDetail = null;
let noteTimer;
function saveNote(id, text) {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => store.setNote(id, text).catch(fail), 600);
}

// --- Personal token (only without the server proxy) ------------------------

function tokenForm() {
  const form = el(
    'form',
    { class: 'stack token-form' },
    stackHead('Token Mindat'),
    el('p', {}, 'Su questa installazione serve il tuo token API Mindat. Lo trovi nelle impostazioni del tuo account su mindat.org; resta salvato solo in questo browser.'),
    el('input', { name: 'token', placeholder: 'Token API', autocomplete: 'off', spellcheck: 'false', required: true, value: token ?? '' }),
    el('p', { class: 'status is-error' }),
    el('button', { type: 'submit', class: 'btn btn-ink' }, 'Salva e continua'),
    el('a', { href: 'https://www.mindat.org/a/how_to_get_my_mindat_api_key', target: '_blank', rel: 'noopener' }, 'Come ottengo il token?'),
  );
  form.onsubmit = async (e) => {
    e.preventDefault();
    const t = form.elements.token.value.trim();
    try {
      await checkToken(t);
      token = t;
      try {
        localStorage.setItem(TOKEN_KEY, t);
      } catch {}
      state.ready = true;
      render();
      searchFromGps();
    } catch (err) {
      form.querySelector('.status').textContent = err instanceof MindatError ? err.message : 'Connessione non riuscita.';
    }
  };
  return form;
}

// --- Phone sheet ------------------------------------------------------------------
// Peek, half and full heights, as fractions of the area under the search bar.

const SNAPS = [0.24, 0.66, 1];
let snap = 1;

function setSheet(frac, animate = true) {
  const panel = $('panel');
  panel.style.transition = animate ? '' : 'none';
  panel.style.setProperty('--sheet', String(frac));
}

function snapSheet(i) {
  snap = Math.max(0, Math.min(SNAPS.length - 1, i));
  setSheet(SNAPS[snap]);
}

// Show at least half the sheet when there is something new to read.
function raiseSheet() {
  if (compact.matches && snap === 0) snapSheet(1);
}

{
  const handle = $('sheet-handle');
  let startY = 0;
  let startFrac = 0;
  let moved = false;
  const area = () => $('panel').parentElement.querySelector('.map-wrap').getBoundingClientRect().height;
  handle.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    startFrac = SNAPS[snap];
    moved = false;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 4) moved = true;
    setSheet(Math.max(0.12, Math.min(1, startFrac - dy / area())), false);
  });
  handle.addEventListener('pointerup', (e) => {
    handle.releasePointerCapture(e.pointerId);
    if (!moved) return snapSheet(snap === SNAPS.length - 1 ? 0 : snap + 1);
    const frac = Number($('panel').style.getPropertyValue('--sheet'));
    let best = 0;
    SNAPS.forEach((s, i) => Math.abs(s - frac) < Math.abs(SNAPS[best] - frac) && (best = i));
    snapSheet(best);
  });
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') snapSheet(snap + 1);
    else if (e.key === 'ArrowDown') snapSheet(snap - 1);
    else if (e.key === 'Enter' || e.key === ' ') snapSheet(snap === SNAPS.length - 1 ? 0 : snap + 1);
    else return;
    e.preventDefault();
  });
  snapSheet(1);
}

// --- Start ---------------------------------------------------------------------

store.subscribe(() => {
  renderRail();
  if (state.detailId == null) renderPanel();
  else redrawDetail?.();
  renderMap();
});
compact.addEventListener('change', () => {
  render();
  map.invalidateSize();
});
new ResizeObserver(() => map.invalidateSize()).observe($('map'));

render();
const fromHash = readHash();
const proxy = token ? false : await hasProxy();
state.ready = Boolean(token) || proxy;
if (proxy) {
  await store.load();
  $('logout').hidden = false;
} else {
  $('logout').hidden = true;
}
render();
if (state.ready) {
  if (fromHash) search(fromHash);
  else searchFromGps();
}
