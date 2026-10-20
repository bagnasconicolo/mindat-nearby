// Per-user data for the web app: saved places ("archivio") and lists
// ("cassetti"). Runs behind nginx on mindat.chicubo.it, which sits behind
// Cloudflare Access; the user is the email in Access's signed JWT.
//
//   PORT          default 8651
//   DB            SQLite file, default ./data/mindat.db
//   ACCESS_TEAM   Access team domain, e.g. chicubo.cloudflareaccess.com
//   ACCESS_AUD    Access application audience tag
//   DEV_USER      skip JWT checks and act as this email (local testing only)

import { createServer } from 'node:http';
import { createPublicKey, verify } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const PORT = Number(process.env.PORT ?? 8651);
const DB_PATH = process.env.DB ?? new URL('../data/mindat.db', import.meta.url).pathname;
const TEAM = process.env.ACCESS_TEAM;
const AUD = process.env.ACCESS_AUD;
const DEV_USER = process.env.DEV_USER;
const MAX_BODY = 512 * 1024;
const MAX_PLACES = 5000;
const MAX_LISTS = 200;

if (!DEV_USER && (!TEAM || !AUD)) {
  console.error('ACCESS_TEAM and ACCESS_AUD are required (or DEV_USER for local testing)');
  process.exit(1);
}

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS places (
    user     TEXT NOT NULL,
    id       INTEGER NOT NULL,
    data     TEXT NOT NULL,
    note     TEXT NOT NULL DEFAULT '',
    saved_at INTEGER NOT NULL,
    PRIMARY KEY (user, id)
  );
  CREATE TABLE IF NOT EXISTS lists (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user       TEXT NOT NULL,
    name       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS list_items (
    list_id  INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    place_id INTEGER NOT NULL,
    pos      INTEGER NOT NULL,
    PRIMARY KEY (list_id, place_id)
  );
  CREATE INDEX IF NOT EXISTS lists_user ON lists(user);
`);

const q = {
  places: db.prepare('SELECT id, data, note, saved_at FROM places WHERE user = ? ORDER BY saved_at DESC'),
  placeCount: db.prepare('SELECT count(*) AS n FROM places WHERE user = ?'),
  placeExists: db.prepare('SELECT 1 FROM places WHERE user = ? AND id = ?'),
  upsertPlace: db.prepare(`
    INSERT INTO places (user, id, data, note, saved_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user, id) DO UPDATE SET data = excluded.data`),
  setNote: db.prepare('UPDATE places SET note = ? WHERE user = ? AND id = ?'),
  deletePlace: db.prepare('DELETE FROM places WHERE user = ? AND id = ?'),
  unlistPlace: db.prepare(
    'DELETE FROM list_items WHERE place_id = ? AND list_id IN (SELECT id FROM lists WHERE user = ?)',
  ),
  lists: db.prepare('SELECT id, name, updated_at FROM lists WHERE user = ? ORDER BY created_at'),
  listCount: db.prepare('SELECT count(*) AS n FROM lists WHERE user = ?'),
  items: db.prepare(
    'SELECT i.list_id, i.place_id FROM list_items i JOIN lists l ON l.id = i.list_id WHERE l.user = ? ORDER BY i.pos',
  ),
  list: db.prepare('SELECT id, name, updated_at FROM lists WHERE id = ? AND user = ?'),
  insertList: db.prepare('INSERT INTO lists (user, name, created_at, updated_at) VALUES (?, ?, ?, ?)'),
  renameList: db.prepare('UPDATE lists SET name = ?, updated_at = ? WHERE id = ? AND user = ?'),
  touchList: db.prepare('UPDATE lists SET updated_at = ? WHERE id = ? AND user = ?'),
  deleteList: db.prepare('DELETE FROM lists WHERE id = ? AND user = ?'),
  clearItems: db.prepare('DELETE FROM list_items WHERE list_id = ?'),
  insertItem: db.prepare('INSERT INTO list_items (list_id, place_id, pos) VALUES (?, ?, ?)'),
};

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// --- Cloudflare Access JWT -------------------------------------------------

let keys = new Map();
let keysFetched = 0;

async function accessKey(kid) {
  if (!keys.has(kid) && Date.now() - keysFetched > 60_000) {
    const res = await fetch(`https://${TEAM}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error(`certs ${res.status}`);
    const { keys: jwks } = await res.json();
    keys = new Map(jwks.map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })]));
    keysFetched = Date.now();
  }
  return keys.get(kid);
}

const b64 = (s) => Buffer.from(s, 'base64url');

async function userFrom(req) {
  if (DEV_USER) return DEV_USER;
  const token = req.headers['cf-access-jwt-assertion'];
  if (!token) return null;
  const [h, p, s] = token.split('.');
  if (!s) return null;
  let header, payload;
  try {
    header = JSON.parse(b64(h));
    payload = JSON.parse(b64(p));
  } catch {
    return null;
  }
  if (header.alg !== 'RS256') return null;
  const key = await accessKey(header.kid);
  if (!key || !verify('sha256', Buffer.from(`${h}.${p}`), key, b64(s))) return null;
  const aud = [payload.aud].flat();
  const now = Date.now() / 1000;
  if (!aud.includes(AUD) || payload.exp < now || (payload.nbf ?? 0) > now + 60) return null;
  return typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
}

// --- HTTP ------------------------------------------------------------------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body) {
  const json = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(json);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Richiesta troppo grande.');
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || '{}');
  } catch {
    throw new HttpError(400, 'JSON non valido.');
  }
}

const listName = (name) => {
  const n = String(name ?? '').trim().slice(0, 80);
  if (!n) throw new HttpError(400, 'Il cassetto ha bisogno di un nome.');
  return n;
};

function state(user) {
  const items = new Map();
  for (const { list_id, place_id } of q.items.all(user)) {
    if (!items.has(list_id)) items.set(list_id, []);
    items.get(list_id).push(place_id);
  }
  return {
    email: user,
    places: q.places.all(user).map((r) => ({
      id: r.id,
      data: JSON.parse(r.data),
      note: r.note,
      savedAt: r.saved_at,
    })),
    lists: q.lists.all(user).map((l) => ({
      id: l.id,
      name: l.name,
      updatedAt: l.updated_at,
      items: items.get(l.id) ?? [],
    })),
  };
}

function listOut(user, id) {
  const l = q.list.get(id, user);
  if (!l) throw new HttpError(404, 'Cassetto non trovato.');
  const items = q.items.all(user).filter((i) => i.list_id === id).map((i) => i.place_id);
  return { id: l.id, name: l.name, updatedAt: l.updated_at, items };
}

async function route(req, res, user) {
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.replace(/^\/data\/?/, '').split('/').filter(Boolean);
  const [kind, rawId] = parts;
  const id = rawId === undefined ? undefined : Number(rawId);
  if (rawId !== undefined && !Number.isSafeInteger(id)) throw new HttpError(404, 'Non trovato.');
  const m = req.method;

  if (kind === 'state' && m === 'GET') return send(res, 200, state(user));

  if (kind === 'places' && id !== undefined) {
    if (m === 'PUT') {
      const body = await readJson(req);
      if (!body.data || typeof body.data !== 'object') throw new HttpError(400, 'Dati del luogo mancanti.');
      if (!q.placeExists.get(user, id) && q.placeCount.get(user).n >= MAX_PLACES) {
        throw new HttpError(409, `Puoi archiviare al massimo ${MAX_PLACES} luoghi.`);
      }
      q.upsertPlace.run(user, id, JSON.stringify({ ...body.data, id }), '', Date.now());
      return send(res, 204);
    }
    if (m === 'PATCH') {
      const body = await readJson(req);
      const r = q.setNote.run(String(body.note ?? '').slice(0, 4000), user, id);
      if (!r.changes) throw new HttpError(404, 'Luogo non archiviato.');
      return send(res, 204);
    }
    if (m === 'DELETE') {
      transaction(() => {
        q.unlistPlace.run(id, user);
        q.deletePlace.run(user, id);
      });
      return send(res, 204);
    }
  }

  if (kind === 'lists' && id === undefined && m === 'POST') {
    const body = await readJson(req);
    if (q.listCount.get(user).n >= MAX_LISTS) throw new HttpError(409, 'Hai raggiunto il numero massimo di cassetti.');
    const now = Date.now();
    const r = q.insertList.run(user, listName(body.name), now, now);
    return send(res, 201, listOut(user, Number(r.lastInsertRowid)));
  }

  if (kind === 'lists' && id !== undefined) {
    if (!q.list.get(id, user)) throw new HttpError(404, 'Cassetto non trovato.');
    if (m === 'PATCH') {
      const body = await readJson(req);
      const now = Date.now();
      transaction(() => {
        if (body.name !== undefined) q.renameList.run(listName(body.name), now, id, user);
        if (body.items !== undefined) {
          if (!Array.isArray(body.items)) throw new HttpError(400, 'Elenco luoghi non valido.');
          const ids = [...new Set(body.items.map(Number))];
          for (const pid of ids) {
            if (!q.placeExists.get(user, pid)) throw new HttpError(400, 'Archivia il luogo prima di metterlo in un cassetto.');
          }
          q.clearItems.run(id);
          ids.forEach((pid, pos) => q.insertItem.run(id, pid, pos));
          q.touchList.run(now, id, user);
        }
      });
      return send(res, 200, listOut(user, id));
    }
    if (m === 'DELETE') {
      q.deleteList.run(id, user);
      return send(res, 204);
    }
  }

  throw new HttpError(404, 'Non trovato.');
}

createServer(async (req, res) => {
  try {
    const user = await userFrom(req);
    if (!user) throw new HttpError(401, 'Accesso non valido: ricarica la pagina.');
    await route(req, res, user);
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err);
    send(res, err.status ?? 500, { error: err.status ? err.message : 'Errore del server.' });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`mindat-nearby data on 127.0.0.1:${PORT}`));
