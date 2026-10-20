// The user's archive (saved places) and drawers (lists), kept on the server
// (data/ on this site) and mirrored here. Every change notifies subscribers.

const BASE = 'data';

let available = false;
let email = null;
const places = new Map(); // id -> { id, data, note, savedAt }
let lists = []; // [{ id, name, items: [placeId] }]
const listeners = new Set();

export class StoreError extends Error {}

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new StoreError('Connessione non riuscita.');
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new StoreError(json.error ?? `Errore (${res.status}).`);
  return json;
}

const notify = () => listeners.forEach((fn) => fn());

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function load() {
  try {
    const s = await call('GET', 'state');
    email = s.email;
    places.clear();
    s.places.forEach((p) => places.set(p.id, p));
    lists = s.lists;
    available = true;
  } catch {
    available = false;
  }
  notify();
  return available;
}

export const isAvailable = () => available;
export const userEmail = () => email;
export const isSaved = (id) => places.has(id);
export const getPlace = (id) => places.get(id);
export const allPlaces = () => [...places.values()];
export const getLists = () => lists;
export const getList = (id) => lists.find((l) => l.id === id);
export const listsWith = (placeId) => lists.filter((l) => l.items.includes(placeId));

// `data` is a snapshot of the locality, so exports work without Mindat.
export async function savePlace(data) {
  const prev = places.get(data.id);
  const merged = { ...prev?.data, ...data };
  places.set(data.id, { id: data.id, data: merged, note: prev?.note ?? '', savedAt: prev?.savedAt ?? Date.now() });
  notify();
  try {
    await call('PUT', `places/${data.id}`, { data: merged });
  } catch (err) {
    if (prev) places.set(data.id, prev);
    else places.delete(data.id);
    notify();
    throw err;
  }
}

export async function removePlace(id) {
  const prev = places.get(id);
  const prevLists = lists;
  places.delete(id);
  lists = lists.map((l) => ({ ...l, items: l.items.filter((x) => x !== id) }));
  notify();
  try {
    await call('DELETE', `places/${id}`);
  } catch (err) {
    if (prev) places.set(id, prev);
    lists = prevLists;
    notify();
    throw err;
  }
}

export async function setNote(id, note) {
  const p = places.get(id);
  if (!p) return;
  p.note = note;
  await call('PATCH', `places/${id}`, { note });
}

export async function createList(name) {
  const list = await call('POST', 'lists', { name });
  lists = [...lists, list];
  notify();
  return list;
}

export async function renameList(id, name) {
  const list = await call('PATCH', `lists/${id}`, { name });
  lists = lists.map((l) => (l.id === id ? list : l));
  notify();
}

export async function setItems(id, items) {
  const prev = lists;
  lists = lists.map((l) => (l.id === id ? { ...l, items } : l));
  notify();
  try {
    await call('PATCH', `lists/${id}`, { items });
  } catch (err) {
    lists = prev;
    notify();
    throw err;
  }
}

export async function toggleInList(listId, placeId) {
  const list = getList(listId);
  const items = list.items.includes(placeId) ? list.items.filter((x) => x !== placeId) : [...list.items, placeId];
  await setItems(listId, items);
}

export async function deleteList(id) {
  await call('DELETE', `lists/${id}`);
  lists = lists.filter((l) => l.id !== id);
  notify();
}
