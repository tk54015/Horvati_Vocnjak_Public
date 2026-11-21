// Zajedničko stanje otvorenog voćnjaka + logika zadataka i procjene uroda (preneseno iz Horvata).
import { itemsDb, treesDb } from './supabase.js';

export const state = {
  orchard: null,
  trees: [],
  items: { task: {}, ttask: {}, ctask: {}, bed: {}, wallet: {} },
  canEdit: false,
  isOwner: false,
  raspored: null // data/raspored.json
};

const listeners = [];
export function onChange(fn) { listeners.push(fn); }
export function changed(what) { listeners.forEach((fn) => { try { fn(what); } catch (e) { console.error(e); } }); }

let errorHandler = (e) => console.error(e);
export function setErrorHandler(fn) { errorHandler = fn; }

export async function loadItems(orchard) {
  state.items = { task: {}, ttask: {}, ctask: {}, bed: {}, wallet: {} };
  if (!orchard) return;
  try {
    (await itemsDb.list(orchard.id)).forEach((r) => { if (state.items[r.kind]) state.items[r.kind][r.id] = r.data; });
  } catch (e) { errorHandler(e); }
}

export async function setItem(kind, id, value) {
  const prev = state.items[kind][id];
  if (value === null || value === undefined) delete state.items[kind][id]; else state.items[kind][id] = value;
  changed(kind);
  try {
    if (value === null || value === undefined) await itemsDb.remove(state.orchard.id, kind, id);
    else await itemsDb.upsert(state.orchard.id, kind, id, value);
  } catch (e) {
    if (prev === undefined) delete state.items[kind][id]; else state.items[kind][id] = prev;
    changed(kind);
    errorHandler(e);
  }
}

export async function saveTreeData(tree) {
  try { await treesDb.update(tree.id, { data: tree.data || {} }); } catch (e) { errorHandler(e); }
  changed('tree');
}

export function uid(prefix) { return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
export function todayIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function fmtDate(iso) {
  const p = String(iso || '').split('-');
  return p.length === 3 ? Number(p[2]) + '.' + Number(p[1]) + '.' + p[0] + '.' : (iso || '');
}

export function counts() {
  const c = {};
  state.trees.forEach((t) => { c[t.species] = (c[t.species] || 0) + 1; });
  return c;
}

// ---------------------------------------------------------------------------
// Procjena uroda (kg po stablu)
// ---------------------------------------------------------------------------
const REF = {
  jabuka: [4.0, 30, 80], kruska: [4.5, 30, 100], sljiva: [4.0, 20, 60], breskva: [3.2, 15, 40], tresnja: [5.0, 30, 80],
  visnja: [5.0, 20, 50], smokva: [4.0, 20, 60], glog: [4.0, 5, 20], drenak: [4.0, 10, 30], ribizl: [1.5, 3, 4], kupina: [2.0, 2, 6],
  vinova_loza: [2.0, 2, 8], kivi: [2.5, 20, 50], borovnica: [1.6, 2, 5], dud2: [6.0, 10, 20], orah: [8.0, 20, 60]
};
const STAGE_F = { mlado: 0.2, odraslo: 1.0 };
const CANOPY_F = { mala: 0.3, srednja: 0.7, velika: 1.0 };

export function yieldRange(tree) {
  const r = REF[tree.species];
  if (!r) return null;
  const stage = STAGE_F[tree.stage] !== undefined ? STAGE_F[tree.stage] : 1;
  const canopy = CANOPY_F[tree.canopy] !== undefined ? CANOPY_F[tree.canopy] : 1;
  let hf = 1;
  if (tree.height_m > 0) hf = Math.min(1.35, Math.max(0.4, Math.pow(tree.height_m / r[0], 0.6)));
  if (tree.species === 'ribizl') {
    const base = tree.canopy === 'mala' ? [0.5, 1] : tree.canopy === 'srednja' ? [1.5, 2.5] : [3, 4];
    return { min: base[0] * stage * hf, max: base[1] * stage * hf };
  }
  return { min: r[1] * stage * canopy * hf, max: r[2] * stage * canopy * hf };
}

// ---------------------------------------------------------------------------
// Zadaci (raspored + vlastiti), stanja po vrsti i po stablu
// ---------------------------------------------------------------------------
export const LOG_TYPES = {
  orezivanje: '✂️', prskanje: '🧴', gnojidba: '🌱', zalijevanje: '💧', pregled: '🔍', bolest: '🦠', ostalo: '📝'
};
const CAT_TO_LOG = { orezivanje: 'orezivanje', 'zaštita': 'prskanje', gnojidba: 'gnojidba', voda: 'zalijevanje' };
export function logTypeForCategory(cat) { return CAT_TO_LOG[cat] || 'ostalo'; }

export function allTasks() {
  const base = state.raspored ? state.raspored.zadaci : [];
  const custom = Object.keys(state.items.ctask).map((id) => Object.assign({ kategorija: 'vlastito', vrste: [], prioritet: 2 }, state.items.ctask[id], { id, custom: true }));
  return base.concat(custom);
}

// Zadatak preko Nove godine (npr. stu–ožu) pripada sezoni sljedeće godine
export function taskKey(task, year, month) {
  const m = task.mjeseci || [];
  const wraps = m.includes(12) && m.includes(1);
  return (wraps && month >= 9 ? year + 1 : year) + ':' + task.id;
}
export function taskIdFromKey(key) { return String(key).slice(String(key).indexOf(':') + 1); }
export const sameMonth = (to, y, m) => !!to && to.year === y && to.month === m;

export function taskState(key) {
  const s = state.items.task[key];
  return s || null;
}
export function treeTaskState(treeId, key) { return state.items.ttask[treeId + '|' + key] || null; }

function windowStartIso(task, now = new Date()) {
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  for (let i = 0; i < 11; i++) {
    const prev = m === 1 ? 12 : m - 1;
    if (!(task.mjeseci || []).includes(prev)) break;
    m = prev;
    if (m === 12) y -= 1;
  }
  return y + '-' + String(m).padStart(2, '0') + '-01';
}

export function treeHandledEntry(tree, task, key) {
  const logType = CAT_TO_LOG[task.kategorija];
  const since = windowStartIso(task);
  const logs = (tree.data && tree.data.logs) || [];
  return logs.find((e) => e.taskKey === key || (logType && e.type === logType && String(e.date) >= since)) || null;
}

// Retci zadataka za mjesec: { task, key, species (na karti), done, state, movedHere, isLast, isFirst }
export function monthRows(year, month) {
  const c = counts();
  const active = [];
  const away = [];
  const seen = {};
  const make = (task, key, moved) => {
    const species = (task.vrste || []).filter((v) => c[v]);
    if ((task.vrste || []).length && !species.length) return null;
    const st = taskState(key);
    const m = task.mjeseci || [];
    return {
      task, key, species, state: st, done: !!st && st.status === 'done', movedHere: !!moved,
      isLast: !moved && m.length > 1 && m[m.length - 1] === month, isFirst: !moved && m.length > 1 && m[0] === month
    };
  };
  allTasks().forEach((task) => {
    if (!(task.mjeseci || []).includes(month)) return;
    if (task.godina && task.godina !== year) return;
    const key = taskKey(task, year, month);
    const row = make(task, key, false);
    if (!row) return;
    seen[key] = true;
    const s = row.state;
    if (s && s.status === 'skipped') away.push(row);
    else if (s && s.to && !sameMonth(s.to, year, month)) away.push(row);
    else { if (s && s.to) row.movedHere = true; active.push(row); }
  });
  Object.keys(state.items.task).forEach((key) => {
    if (seen[key]) return;
    const s = state.items.task[key];
    if (!s || !sameMonth(s.to, year, month)) return;
    const task = allTasks().find((t) => t.id === taskIdFromKey(key));
    if (!task) return;
    const row = make(task, key, true);
    if (row) active.push(row);
  });
  return { active, away };
}

export function currentRows() {
  const n = new Date();
  return monthRows(n.getFullYear(), n.getMonth() + 1).active;
}

// Zadaci jednog stabla ovaj mjesec, s njegovim stanjem
export function treeTasks(tree) {
  const n = new Date();
  const y = n.getFullYear();
  const m = n.getMonth() + 1;
  const list = currentRows().filter((r) => (r.task.vrste || []).includes(tree.species)).map((row) => ({ row }));
  Object.keys(state.items.ttask).forEach((k) => {
    if (!k.startsWith(tree.id + '|')) return;
    const key = k.slice(tree.id.length + 1);
    const st = state.items.ttask[k];
    if (!st || st.status !== 'postponed' || !sameMonth(st.to, y, m)) return;
    if (list.some((x) => x.row.key === key)) return;
    const task = allTasks().find((t) => t.id === taskIdFromKey(key));
    if (!task) return;
    const sp = taskState(key);
    list.push({ row: { task, key, done: !!sp && sp.status === 'done' }, movedIn: true });
  });
  list.forEach((x) => {
    x.handled = treeHandledEntry(tree, x.row.task, x.row.key);
    const st = treeTaskState(tree.id, x.row.key);
    x.treeState = st;
    x.skipped = !!st && st.status === 'skipped';
    x.postponedAway = !!st && st.status === 'postponed' && !sameMonth(st.to, y, m);
    x.open = !x.handled && !x.skipped && !x.postponedAway && !x.row.done;
  });
  return list.sort((a, b) => (a.open ? 0 : 1) - (b.open ? 0 : 1) || a.row.task.prioritet - b.row.task.prioritet);
}

export function treeAlertLevel(tree) {
  let level = 0;
  treeTasks(tree).forEach((x) => {
    if (!x.open) return;
    const p = x.row.task.prioritet;
    if (p <= 2 && (!level || p < level)) level = p;
  });
  return level;
}

export function speciesProgress(row) {
  const species = row.species && row.species.length ? row.species : (row.task.vrste || []);
  const n = new Date();
  const res = { total: 0, handled: 0, skipped: 0, postponed: 0 };
  state.trees.forEach((tree) => {
    if (!species.includes(tree.species)) return;
    res.total++;
    const st = treeTaskState(tree.id, row.key);
    if (treeHandledEntry(tree, row.task, row.key)) res.handled++;
    else if (st && st.status === 'skipped') res.skipped++;
    else if (st && st.status === 'postponed' && !sameMonth(st.to, n.getFullYear(), n.getMonth() + 1)) res.postponed++;
  });
  return res;
}

// Zadatak vrste se sam zatvori kad su sva stabla napravljena ili preskočena (i otvori ako se poništi)
let reconciling = false;
export async function reconcile() {
  if (reconciling || !state.canEdit) return;
  reconciling = true;
  try {
    for (const r of currentRows()) {
      if (!(r.task.vrste || []).length) continue;
      const p = speciesProgress(r);
      if (!p.total) continue;
      const all = p.handled + p.skipped === p.total;
      const st = taskState(r.key);
      if (all && !(st && st.status === 'done')) {
        const v = { status: 'done', auto: true, at: new Date().toISOString() };
        if (st && st.to) { v.to = st.to; v.from = st.from; }
        await setItem('task', r.key, v);
      } else if (!all && st && st.status === 'done' && st.auto) {
        await setItem('task', r.key, st.to ? { status: 'postponed', to: st.to, from: st.from } : null);
      }
    }
  } finally { reconciling = false; }
}

export function upcoming(speciesId, count = 4) {
  const n = new Date();
  const now = n.getMonth() + 1;
  const out = [];
  for (let i = 1; i <= 12 && out.length < count; i++) {
    const m = ((now - 1 + i) % 12) + 1;
    const y = n.getFullYear() + Math.floor((now - 1 + i) / 12);
    const prev = m === 1 ? 12 : m - 1;
    const list = allTasks().filter((z) => (z.vrste || []).includes(speciesId) && z.mjeseci.includes(m) && !z.mjeseci.includes(prev) && (!z.godina || z.godina === y));
    if (list.length) out.push({ month: m, tasks: list });
  }
  return out;
}
