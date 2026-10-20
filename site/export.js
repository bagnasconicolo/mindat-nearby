// Getting places out of the app: Google Maps links and routes, KML/GPX/CSV
// files, and print layouts (specimen labels, catalogue) for "Salva come PDF".

import { localityUrl } from './mindat.js?v=20261020b';
import { formatCoords } from './geo.js?v=20261020b';

const hasCoords = (p) => p.latitude != null && p.longitude != null;

export const mapsPlaceUrl = (p) =>
  `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`;

export const mapsDirectionsUrl = (p) =>
  `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`;

// Google Maps takes up to 9 waypoints per route, so long lists become legs:
// the first starts from the current position, each next one where the
// previous ended.
const STOPS_PER_LEG = 9;

export function mapsRouteLegs(places) {
  const stops = places.filter(hasCoords);
  const legs = [];
  for (let i = 0; i < stops.length; i += STOPS_PER_LEG) {
    const leg = stops.slice(i, i + STOPS_PER_LEG);
    const origin = i === 0 ? null : stops[i - 1];
    const dest = leg[leg.length - 1];
    const params = new URLSearchParams({ api: '1', destination: `${dest.latitude},${dest.longitude}`, travelmode: 'driving' });
    if (origin) params.set('origin', `${origin.latitude},${origin.longitude}`);
    const via = leg.slice(0, -1).map((p) => `${p.latitude},${p.longitude}`);
    if (via.length) params.set('waypoints', via.join('|'));
    legs.push({ from: i + 1, to: i + leg.length, url: `https://www.google.com/maps/dir/?${params}` });
  }
  return legs;
}

// --- Files -------------------------------------------------------------------

const xml = (s) =>
  String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);

const title = (p) => p.txt.split(', ')[0];
const placeLine = (p) => p.txt.split(', ').slice(1).join(', ');
const mineralLine = (p) =>
  (p.minerals ?? []).map((m) => m.name + (m.typeLocality ? ' (TL)' : '') + (m.questioned ? ' (?)' : '')).join(', ');

function describe(p, note) {
  return [
    placeLine(p),
    p.typeName && `Tipo: ${p.typeName}`,
    p.minerals?.length && `Minerali: ${mineralLine(p)}`,
    !p.minerals?.length && p.elements?.length && `Elementi: ${p.elements.join(' ')}`,
    note && `Note: ${note}`,
    localityUrl(p.id),
  ]
    .filter(Boolean)
    .join('\n');
}

function download(name, type, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const fileName = (name, ext) =>
  `${name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'luoghi'}.${ext}`;

// entries: [{ place, note }]
export function downloadKml(name, entries) {
  const marks = entries
    .filter((e) => hasCoords(e.place))
    .map(
      ({ place: p, note }) => `    <Placemark>
      <name>${xml(title(p))}</name>
      <description>${xml(describe(p, note))}</description>
      <Point><coordinates>${p.longitude},${p.latitude},0</coordinates></Point>
    </Placemark>`,
    )
    .join('\n');
  download(
    fileName(name, 'kml'),
    'application/vnd.google-earth.kml+xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${xml(name)}</name>
${marks}
  </Document>
</kml>
`,
  );
}

export function downloadGpx(name, entries) {
  const wpts = entries
    .filter((e) => hasCoords(e.place))
    .map(
      ({ place: p, note }) => `  <wpt lat="${p.latitude}" lon="${p.longitude}">
    <name>${xml(title(p))}</name>
    <desc>${xml(describe(p, note))}</desc>
    <link href="${localityUrl(p.id)}"><text>Mindat</text></link>
  </wpt>`,
    )
    .join('\n');
  download(
    fileName(name, 'gpx'),
    'application/gpx+xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Mindat Nearby" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${xml(name)}</name></metadata>
${wpts}
</gpx>
`,
  );
}

export function downloadCsv(name, entries) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [
    ['Mindat', 'Nome', 'Luogo', 'Tipo', 'Latitudine', 'Longitudine', 'Minerali', 'Elementi', 'Note', 'Link'],
    ...entries.map(({ place: p, note }) => [
      p.id,
      title(p),
      placeLine(p),
      p.typeName,
      p.latitude,
      p.longitude,
      mineralLine(p),
      (p.elements ?? []).join(' '),
      note,
      localityUrl(p.id),
    ]),
  ];
  download(fileName(name, 'csv'), 'text/csv', '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n'));
}

// --- Print ------------------------------------------------------------------

const root = () => document.getElementById('print-root');

function h(tag, className, ...children) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  for (const c of children) if (c != null && c !== false) e.append(c);
  return e;
}

function printNow(kind) {
  document.body.dataset.print = kind;
  const done = () => {
    root().replaceChildren();
    delete document.body.dataset.print;
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  // Give the browser a frame to lay out the print tree.
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

function mineralsInline(p, max) {
  const list = p.minerals ?? [];
  const shown = max ? list.slice(0, max) : list;
  const frag = document.createDocumentFragment();
  shown.forEach((m, i) => {
    if (i) frag.append(', ');
    frag.append(m.typeLocality ? h('b', 'tl', m.name, ' TL') : m.name + (m.questioned ? ' ?' : ''));
  });
  if (list.length > shown.length) frag.append(` e altri ${list.length - shown.length}`);
  return frag;
}

// Specimen labels, eight per A4 sheet, with cut lines.
export function printLabels(entries) {
  const sheet = h('div', 'print-labels');
  for (const { place: p, note } of entries) {
    sheet.append(
      h(
        'article',
        'print-label' + (p.minerals?.some((m) => m.typeLocality) ? ' is-type' : ''),
        h('header', null, h('span', null, 'Mindat'), h('span', 'num', `N. ${p.id}`)),
        h('h2', null, title(p)),
        h('p', 'place', placeLine(p)),
        h(
          'dl',
          null,
          p.typeName && h('div', null, h('dt', null, 'Tipo'), h('dd', null, p.typeName)),
          h(
            'div',
            null,
            h('dt', null, p.minerals?.length ? 'Minerali' : 'Elementi'),
            h('dd', null, p.minerals?.length ? mineralsInline(p, 14) : (p.elements ?? []).join(' ') || '—'),
          ),
          hasCoords(p) && h('div', null, h('dt', null, 'Coord.'), h('dd', 'num', formatCoords(p.latitude, p.longitude))),
          note && h('div', null, h('dt', null, 'Note'), h('dd', null, note)),
        ),
      ),
    );
  }
  root().replaceChildren(sheet);
  printNow('labels');
}

// A catalogue: one entry per place with everything we know.
export function printCatalogue(name, entries) {
  const date = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  const doc = h(
    'div',
    'print-catalogue',
    h('header', null, h('h1', null, name), h('p', null, `${entries.length} località · ${date} · dati Mindat.org`)),
  );
  entries.forEach(({ place: p, note }, i) => {
    doc.append(
      h(
        'article',
        null,
        h('div', 'idx num', String(i + 1)),
        h(
          'div',
          null,
          h('h2', null, title(p), h('span', 'num', ` · Mindat N. ${p.id}`)),
          h('p', 'place', placeLine(p)),
          h(
            'p',
            'meta num',
            [p.typeName, hasCoords(p) ? formatCoords(p.latitude, p.longitude) : 'senza coordinate'].filter(Boolean).join(' · '),
          ),
          p.minerals?.length
            ? h('p', null, h('b', null, `Minerali (${p.minerals.length}): `), mineralsInline(p))
            : p.elements?.length && h('p', null, h('b', null, 'Elementi: '), p.elements.join(' ')),
          p.description && h('p', 'desc', p.description),
          note && h('p', null, h('b', null, 'Note: '), note),
          h('p', 'link', localityUrl(p.id)),
        ),
      ),
    );
  });
  root().replaceChildren(doc);
  printNow('catalogue');
}
