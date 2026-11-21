import { t, applyI18n, setLang, getLang, onLangChange, fmtNum, fmtArea } from './i18n.js';
import { createBoundaryEditor } from './geo-editor.js';

// ---------------------------------------------------------------------------
// Spremanje (za sada u pregledniku; zamijenit će se Supabaseom)
// ---------------------------------------------------------------------------
const STORE_KEY = 'hvj_orchards_v1';
const CURRENT_KEY = 'hvj_current_v1';

const store = {
  list() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch (e) { return []; }
  },
  saveAll(list) { localStorage.setItem(STORE_KEY, JSON.stringify(list)); },
  get(id) { return this.list().find((o) => o.id === id) || null; },
  upsert(orchard) {
    const list = this.list().filter((o) => o.id !== orchard.id);
    list.push(orchard);
    this.saveAll(list);
  },
  remove(id) { this.saveAll(this.list().filter((o) => o.id !== id)); },
  current() { try { return localStorage.getItem(CURRENT_KEY); } catch (e) { return null; } },
  setCurrent(id) { try { localStorage.setItem(CURRENT_KEY, id || ''); } catch (e) { /* ništa */ } }
};

// ---------------------------------------------------------------------------
// Karta
// ---------------------------------------------------------------------------
const DEFAULT_CENTER = [45.815, 15.982]; // Zagreb
const map = L.map('map', { zoomControl: false, maxZoom: 21 }).setView(DEFAULT_CENTER, 13);
L.control.zoom({ position: 'bottomright' }).addTo(map);
const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 21, maxNativeZoom: 19,
  attribution: 'Snimke &copy; Esri, Maxar, Earthstar Geographics'
}).addTo(map);
const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 21, maxNativeZoom: 19, opacity: 0.85
}).addTo(map);
const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 21, maxNativeZoom: 19,
  attribution: '&copy; OpenStreetMap'
});
let layersControl = null;
function buildLayersControl() {
  if (layersControl) layersControl.remove();
  const base = {};
  base[t('layers.satellite')] = satellite;
  base[t('layers.map')] = streets;
  layersControl = L.control.layers(base, null, { position: 'bottomright' }).addTo(map);
}
map.on('baselayerchange', (e) => {
  if (e.layer === satellite) labels.addTo(map); else map.removeLayer(labels);
});

const editor = createBoundaryEditor(map, onBoundaryChange);

// ---------------------------------------------------------------------------
// Stanje i pomoćne funkcije
// ---------------------------------------------------------------------------
let current = null; // trenutni voćnjak
let editing = false;
let editMethod = 'rect';
const $ = (id) => document.getElementById(id);

function uid() { return 'o-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

async function geocode(q) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q) + '&accept-language=' + getLang();
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  return data && data[0] ? { lat: Number(data[0].lat), lng: Number(data[0].lon) } : null;
}

async function goTo(q) {
  if (!q) return false;
  try {
    const hit = await geocode(q);
    if (!hit) { toast(t('search.notFound')); return false; }
    map.setView([hit.lat, hit.lng], 18);
    return true;
  } catch (e) {
    toast(t('search.error'));
    return false;
  }
}

// ---------------------------------------------------------------------------
// Prikaz
// ---------------------------------------------------------------------------
function renderTop() {
  const list = store.list().sort((a, b) => a.name.localeCompare(b.name, 'hr'));
  const sel = $('orchard-select');
  sel.innerHTML = list.map((o) => '<option value="' + o.id + '"' + (current && o.id === current.id ? ' selected' : '') + '>' + escapeHtml(o.name) + '</option>').join('');
  $('orchard-picker').classList.toggle('hidden', !list.length);
  $('btn-edit').classList.toggle('hidden', !current || editing);
  $('btn-delete').classList.toggle('hidden', !current || editing);
  $('lang-btn').textContent = t('lang.switch');
  const info = $('orchard-info');
  if (current && current.boundary && !editing) {
    info.textContent = '📐 ' + fmtArea(current.area || 0);
    info.classList.remove('hidden');
  } else {
    info.classList.add('hidden');
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderPanel() {
  if (!editing) { hide('edit-panel'); return; }
  show('edit-panel');
  document.querySelectorAll('.method-tab').forEach((b) => b.classList.toggle('active', b.dataset.method === editMethod));
  document.querySelectorAll('.method-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== editMethod));
  $('edit-area').textContent = fmtArea(editor.area());
  const r = editor.rect();
  if (r && editMethod === 'rect') {
    if (document.activeElement !== $('rect-w')) $('rect-w').value = fmtNum(r.w, 1).replace(/\s/g, '');
    if (document.activeElement !== $('rect-h')) $('rect-h').value = fmtNum(r.h, 1).replace(/\s/g, '');
    $('rect-rot').textContent = (r.rot || 0) + '°';
  }
  $('draw-count').textContent = String(editor.type() === 'draw' ? editor.pointCount() : 0);
  $('kml-count').textContent = editor.type() === 'kml' ? '✓ ' + editor.pointCount() + ' ' + t('edit.points').toLowerCase() : '';
}

function onBoundaryChange() { if (editing) renderPanel(); }

function showOrchard(o, fit = true) {
  current = o;
  store.setCurrent(o ? o.id : null);
  editor.load(o ? o.boundary : null);
  if (o && fit) {
    const b = editor.bounds();
    if (b) map.fitBounds(b, { padding: [40, 40], maxZoom: 20 });
    else if (o.center) map.setView(o.center, 18);
  }
  hide('welcome');
  renderTop();
}

// ---------------------------------------------------------------------------
// Uređivanje granice
// ---------------------------------------------------------------------------
function startEditing(firstTime) {
  editing = true;
  editor.setEditing(true);
  const type = editor.type();
  if (!type) {
    editor.startRect(map.getCenter());
    editMethod = 'rect';
  } else {
    editMethod = type === 'rect' ? 'rect' : type;
  }
  renderTop();
  renderPanel();
  if (firstTime) show('howto-modal');
}

function chooseMethod(m) {
  editMethod = m;
  if (m === 'rect' && editor.type() !== 'rect') editor.startRect(map.getCenter());
  if (m === 'draw' && editor.type() !== 'draw') editor.startDraw();
  if (m === 'kml') $('kml-file').click();
  renderPanel();
}

function finishEditing() {
  const b = editor.getBoundary();
  if (!b || b.points.length < 3) { toast(t('edit.finishNeed')); return; }
  current.boundary = b;
  current.area = editor.area();
  const bounds = L.latLngBounds(b.points);
  const c = bounds.getCenter();
  current.center = [c.lat, c.lng];
  current.updatedAt = new Date().toISOString();
  store.upsert(current);
  editing = false;
  editor.setEditing(false);
  renderPanel();
  renderTop();
  $('done-text').textContent = t('done.text', { area: fmtArea(current.area) });
  show('done-modal');
}

// ---------------------------------------------------------------------------
// Događaji
// ---------------------------------------------------------------------------
function openNewModal() {
  $('new-form').reset();
  hide('new-error');
  show('new-modal');
  $('new-name').focus();
}

$('welcome-create').addEventListener('click', openNewModal);
$('btn-new').addEventListener('click', openNewModal);
$('new-cancel').addEventListener('click', () => hide('new-modal'));
$('new-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('new-name').value.trim();
  const address = $('new-address').value.trim();
  if (!name) { $('new-error').textContent = t('new.nameRequired'); show('new-error'); return; }
  hide('new-modal');
  const o = { id: uid(), name, address, boundary: null, area: 0, createdAt: new Date().toISOString() };
  store.upsert(o);
  showOrchard(o, false);
  if (address) await goTo(address); else map.setView(map.getCenter(), Math.max(map.getZoom(), 17));
  startEditing(true);
});

$('orchard-select').addEventListener('change', (e) => {
  if (editing) { editing = false; editor.setEditing(false); renderPanel(); }
  showOrchard(store.get(e.target.value));
});
$('btn-edit').addEventListener('click', () => startEditing(false));
$('btn-delete').addEventListener('click', () => {
  if (!current || !confirm(t('top.deleteConfirm', { name: current.name }))) return;
  store.remove(current.id);
  const next = store.list()[0] || null;
  if (next) showOrchard(next); else { current = null; editor.load(null); renderTop(); show('welcome'); }
});
$('lang-btn').addEventListener('click', () => setLang(getLang() === 'hr' ? 'en' : 'hr'));

$('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  goTo($('search-input').value.trim());
});

document.querySelectorAll('[data-choose]').forEach((b) => b.addEventListener('click', () => {
  hide('howto-modal');
  chooseMethod(b.dataset.choose);
}));
$('howto-close').addEventListener('click', () => hide('howto-modal'));
$('btn-help').addEventListener('click', () => show('howto-modal'));
document.querySelectorAll('.method-tab').forEach((b) => b.addEventListener('click', () => chooseMethod(b.dataset.method)));

function readNum(el) { return Number(String(el.value).replace(',', '.')); }
['rect-w', 'rect-h'].forEach((id) => $(id).addEventListener('change', () => {
  const w = readNum($('rect-w'));
  const h = readNum($('rect-h'));
  if (w > 0 && h > 0) editor.setRectSize(w, h);
}));

$('draw-undo').addEventListener('click', () => editor.undoPoint());
$('draw-clear').addEventListener('click', () => editor.startDraw());
$('kml-pick').addEventListener('click', () => $('kml-file').click());
$('kml-file').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (/\.kmz$/i.test(file.name)) { toast(t('edit.kmlKmz')); return; }
  const { parseKmlPolygon } = await import('./geo.js');
  const pts = parseKmlPolygon(await file.text());
  if (!pts) { toast(t('edit.kmlError')); return; }
  editMethod = 'kml';
  editor.loadPoints(pts, 'kml');
  renderPanel();
});
$('btn-finish').addEventListener('click', finishEditing);
$('done-ok').addEventListener('click', () => hide('done-modal'));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') ['howto-modal', 'done-modal', 'new-modal'].forEach(hide);
});

onLangChange(() => { buildLayersControl(); renderTop(); renderPanel(); });

// ---------------------------------------------------------------------------
// Pokretanje
// ---------------------------------------------------------------------------
applyI18n();
buildLayersControl();
const list = store.list();
const saved = store.current();
const first = list.find((o) => o.id === saved) || list[0] || null;
if (first) {
  showOrchard(first);
  if (!first.boundary) startEditing(true);
} else {
  renderTop();
  show('welcome');
}
