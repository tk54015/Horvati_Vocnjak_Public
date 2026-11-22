import { t, applyI18n, setLang, getLang, onLangChange, fmtNum, fmtArea } from './i18n.js';
import { createBoundaryEditor } from './geo-editor.js';
import { parseKmlPolygon, toLocal, fromLocal } from './geo.js';
import { supabase, db, treesDb } from './supabase.js';
import { createOrchardView } from './orchard-view.js';
import { createTrees } from './trees.js';
import { initEncyclopedia, openEncyclopedia, rerenderEncyclopedia } from './encyclopedia.js';
import { initTasks, openTasks, rerenderTasks } from './tasks.js';
import { state, loadItems, setErrorHandler, counts, reconcile, setItem } from './state.js';
import { createRuler, initFilter } from './tools.js';
import { createBeds } from './beds.js';
import { initExtras, openWallet, openReport, openYield, openWeather, rerenderExtras, closeExtras } from './extras.js';

const LEGACY_KEY = 'hvj_orchards_v1'; // voćnjaci iz probne verzije (samo preglednik)
const CURRENT_KEY = 'hvj_current_v1';

// ---------------------------------------------------------------------------
// Karta
// ---------------------------------------------------------------------------
const PICK_CENTER = [45.1, 16.4]; // pogled na Hrvatsku pri odabiru lokacije
// Voćnjak bez lokacije crta se oko ove (izmišljene) točke na bijeloj podlozi – stvarna lokacija se nigdje ne sprema.
const VIRTUAL_ORIGIN = L.latLng(0, 0);
const MAX_ZOOM = 25;
const map = L.map('map', { zoomControl: false, maxZoom: MAX_ZOOM, minZoom: 3, scrollWheelZoom: false }).setView(VIRTUAL_ORIGIN, 19);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 140 }).addTo(map);

// Kotačić: jedan korak zuma po pomaku (kao u Horvatima), oko pokazivača
let wheelAcc = 0;
let wheelAt = 0;
map.getContainer().addEventListener('wheel', (e) => {
  e.preventDefault();
  wheelAcc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
  const now = Date.now();
  if (Math.abs(wheelAcc) < 40 || now - wheelAt < 90) return;
  const step = wheelAcc > 0 ? -1 : 1;
  wheelAcc = 0;
  wheelAt = now;
  const target = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + step));
  if (target !== map.getZoom()) map.setZoomAround(map.mouseEventToContainerPoint(e), target);
}, { passive: false });

const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: MAX_ZOOM, maxNativeZoom: 19,
  attribution: 'Snimke &copy; Esri, Maxar, Earthstar Geographics'
});
const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: MAX_ZOOM, maxNativeZoom: 19, opacity: 0.85
});
const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: MAX_ZOOM, maxNativeZoom: 19,
  attribution: '&copy; OpenStreetMap'
});
let baseLayer = satellite;
let layersControl = null;
function buildLayersControl() {
  if (layersControl) { layersControl.remove(); layersControl = null; }
  if (mapMode !== 'real') return;
  const base = {};
  base[t('layers.satellite')] = satellite;
  base[t('layers.map')] = streets;
  layersControl = L.control.layers(base, null, { position: 'bottomright' }).addTo(map);
}
map.on('baselayerchange', (e) => {
  baseLayer = e.layer;
  if (e.layer === satellite) labels.addTo(map); else map.removeLayer(labels);
});

// Mreža u metrima na praznoj podlozi (svakih 5 m, jače svakih 25 m)
const grid = L.layerGroup();
(function buildGrid() {
  const R = 300;
  const minor = [];
  const major = [];
  for (let d = -R; d <= R; d += 5) {
    const list = d % 25 === 0 ? major : minor;
    list.push([fromLocal({ x: d, y: -R }, VIRTUAL_ORIGIN), fromLocal({ x: d, y: R }, VIRTUAL_ORIGIN)]);
    list.push([fromLocal({ x: -R, y: d }, VIRTUAL_ORIGIN), fromLocal({ x: R, y: d }, VIRTUAL_ORIGIN)]);
  }
  L.polyline(minor, { color: '#e6e6e6', weight: 1, interactive: false }).addTo(grid);
  L.polyline(major, { color: '#cfcfcf', weight: 1, interactive: false }).addTo(grid);
})();

// 'blank' = bijela podloga bez lokacije (s mrežom),
// 'real'  = cijela karta (samo dok se bira lokacija / uređuje granica),
// 'cut'   = gotovo zemljište s lokacijom: okolica bijela ("izrezano"), satelit samo ispod zemljišta po želji
let mapMode = null;
let satClip = null;
function setMapMode(mode) {
  if (mode === mapMode) return;
  mapMode = mode;
  const real = mode === 'real';
  [satellite, labels, streets].forEach((l) => map.removeLayer(l));
  if (real) {
    baseLayer.addTo(map);
    if (baseLayer === satellite) labels.addTo(map);
  }
  if (mode === 'blank') grid.addTo(map); else map.removeLayer(grid);
  buildLayersControl();
  document.body.classList.toggle('blank-map', !real);
  orchardView.setBlank(!real);
  updateSatClip();
  renderTop();
}

// Satelitska snimka samo u okviru zemljišta (ostale pločice se ni ne učitavaju), okolica je prekrivena bijelim
function updateSatClip() {
  if (satClip) { map.removeLayer(satClip); satClip = null; }
  const b = orchardView.bounds();
  const on = mapMode === 'cut' && orchardView.satellite() && b;
  document.body.classList.toggle('sat-under', !!on);
  if (!on) return;
  satClip = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: MAX_ZOOM, maxNativeZoom: 19, bounds: b.pad(0.02),
    attribution: 'Snimke &copy; Esri, Maxar, Earthstar Geographics'
  }).addTo(map);
}
const isLocated = (o) => !!(o && o.boundary && o.boundary.located !== false);

const editor = createBoundaryEditor(map, onBoundaryChange);
const orchardView = createOrchardView(map);

// ---------------------------------------------------------------------------
// Stanje
// ---------------------------------------------------------------------------
let user = null;
let orchards = [];
let current = null;
let editing = false;
let editMethod = 'rect';
let editLocated = false;
let relocations = []; // [{from, to}] – premještanje oblika (i stabala) pri promjeni lokacije
let picking = null; // odabir lokacije na karti: { boundary }
let busy = false;
const $ = (id) => document.getElementById(id);

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4500);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function canEdit(o) { return !!o && (o.role === 'owner' || o.role === 'editor'); }

function friendlyDbError(e) {
  const m = (e && e.message) || String(e);
  if (/orchard_items/.test(m) && /(does not exist|schema cache|not find)/i.test(m)) return t('items.missing');
  return t('db.error', { msg: m });
}
setErrorHandler((e) => { console.error(e); toast(friendlyDbError(e)); });

const ruler = createRuler(map);
let beds = null;
const isBusy = () => ruler.isActive() || (beds && beds.isPlacing());
const trees = createTrees(map, {
  contains: (ll) => orchardView.contains(ll),
  toast: (m) => toast(m),
  isBusy,
  onOpen: () => { if (beds) beds.closePanel(); }
});
beds = createBeds(map, {
  contains: (ll) => orchardView.contains(ll),
  toast: (m) => toast(m),
  isBusy,
  closeOthers: () => trees.closePanel()
});
const filter = initFilter(trees);
initEncyclopedia(() => counts());
initTasks();
initExtras({ toast: (m) => toast(m) });

function setMenuOpen(open) {
  $('side-menu').classList.toggle('hidden', !open);
  $('menu-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
}

function updateMenu() {
  const ready = !!(user && current && current.boundary && !editing);
  $('menu-btn').classList.toggle('hidden', !ready);
  if (!ready) setMenuOpen(false);
  document.body.classList.toggle('viewer', !!current && !canEdit(current));
  document.body.classList.toggle('not-owner', !current || current.role !== 'owner');
  $('menu-sat').textContent = orchardView.satellite() ? t('menu.satelliteOff') : t('menu.satellite');
  $('menu-sat').classList.toggle('hidden', mapMode !== 'cut');
}

// ---------------------------------------------------------------------------
// Pretraga mjesta
// ---------------------------------------------------------------------------
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
  const loggedIn = !!user;
  $('topbar').classList.toggle('hidden', !loggedIn);
  $('search-form').classList.toggle('hidden', !loggedIn || mapMode !== 'real' || !(picking || editing));
  if (!loggedIn) {
    updateMenu();
    $('orchard-info').textContent = '';
    $('orchard-select').innerHTML = '';
    return;
  }
  const sel = $('orchard-select');
  sel.innerHTML = orchards.map((o) => '<option value="' + o.id + '"' + (current && o.id === current.id ? ' selected' : '') + '>' + escapeHtml(o.name) + '</option>').join('');
  $('orchard-picker').classList.toggle('hidden', !orchards.length);
  $('btn-edit').classList.toggle('hidden', !current || editing || !canEdit(current));
  $('btn-delete').classList.toggle('hidden', !current || editing || current.role !== 'owner');
  $('lang-btn').textContent = t('lang.switch');
  $('user-email').textContent = user.email || '';
  updateMenu();
  const info = $('orchard-info');
  if (current && current.boundary && !editing) {
    info.textContent = '📐 ' + fmtArea(Number(current.area) || 0) + (current.role === 'viewer' ? ' · 👁️ ' + t('role.viewer') : '');
    info.classList.remove('hidden');
  } else {
    info.classList.add('hidden');
  }
}

function renderPanel() {
  if (!editing) { hide('edit-panel'); return; }
  show('edit-panel');
  document.querySelectorAll('.method-tab').forEach((b) => b.classList.toggle('active', b.dataset.method === editMethod));
  document.querySelectorAll('.method-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== editMethod));
  $('edit-area').textContent = fmtArea(editor.area());
  $('loc-text').textContent = editLocated ? t('loc.on') : t('loc.off');
  $('loc-btn').textContent = editLocated ? t('loc.remove') : t('loc.pick');
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

let loadSeq = 0;
async function loadOrchardData(o) {
  const seq = ++loadSeq;
  ruler.stop();
  beds.hideAll();
  closeExtras();
  filter.close();
  await loadItems(o);
  if (seq !== loadSeq) return;
  await trees.load(o);
  if (seq !== loadSeq) return;
  if (o && o.boundary) await beds.refresh();
  filter.reset();
  reconcile();
}

function setCurrent(o) {
  current = o;
  state.orchard = o;
  state.canEdit = canEdit(o);
  state.isOwner = !!o && o.role === 'owner';
}

function showOrchard(o, fit = true) {
  setCurrent(o);
  try { localStorage.setItem(CURRENT_KEY, o ? o.id : ''); } catch (e) { /* ništa */ }
  editor.load(null);
  setMapMode(isLocated(o) ? 'cut' : 'blank');
  if (o && o.boundary) orchardView.show(o.boundary.points); else orchardView.hide();
  updateSatClip();
  loadOrchardData(o);
  if (o && fit) {
    const b = orchardView.bounds();
    if (b) map.fitBounds(b, { padding: [40, 40], maxZoom: 21 });
    else map.setView(VIRTUAL_ORIGIN, 19);
  }
  hide('welcome');
  renderTop();
}

function clearOrchard() {
  loadSeq++;
  setCurrent(null);
  editor.load(null);
  orchardView.hide();
  trees.hideAll();
  beds.hideAll();
  ruler.stop();
  filter.close();
  closeExtras();
  renderTop();
}

function stopEditing() {
  cancelPick(true);
  editing = false;
  editor.setEditing(false);
  editor.load(null);
  renderPanel();
}

// ---------------------------------------------------------------------------
// Učitavanje voćnjaka
// ---------------------------------------------------------------------------
async function loadOrchards(preferId) {
  try {
    orchards = await db.list(user.id);
  } catch (e) {
    toast(t('db.loadError', { msg: e.message }));
    orchards = [];
  }
  let saved = preferId;
  if (!saved) { try { saved = localStorage.getItem(CURRENT_KEY); } catch (e) { /* ništa */ } }
  const first = orchards.find((o) => o.id === saved) || orchards[0] || null;
  if (first) {
    showOrchard(first);
    if (!first.boundary && canEdit(first)) startEditing(true);
  } else {
    clearOrchard();
    show('welcome');
  }
}

// Voćnjaci iz probne verzije (spremljeni samo u pregledniku) -> na račun
async function offerLegacyImport() {
  let legacy = [];
  try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]'); } catch (e) { legacy = []; }
  if (!legacy.length) return null;
  if (!confirm(t('import.confirm', { n: legacy.length }))) return null;
  let lastId = null;
  for (const o of legacy) {
    try {
      const created = await db.create(o, user.id);
      lastId = created.id;
    } catch (e) {
      toast(t('db.error', { msg: e.message }));
      return null;
    }
  }
  localStorage.removeItem(LEGACY_KEY);
  toast(t('import.done', { n: legacy.length }));
  return lastId;
}

// ---------------------------------------------------------------------------
// Uređivanje granice
// ---------------------------------------------------------------------------
function startEditing(firstTime) {
  if (!canEdit(current)) return;
  editing = true;
  setMenuOpen(false);
  orchardView.hide();
  trees.hideAll();
  beds.hideAll();
  ruler.stop();
  filter.close();
  editLocated = isLocated(current);
  relocations = [];
  setMapMode(editLocated ? 'real' : 'blank');
  editor.load(current.boundary || null);
  editor.setEditing(true);
  const type = editor.type();
  if (!type) {
    if (!editLocated) map.setView(VIRTUAL_ORIGIN, 21);
    editor.startRect(map.getCenter(), 20, 20);
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
  if (m === 'rect' && editor.type() !== 'rect') editor.startRect(map.getCenter(), 20, 20);
  if (m === 'draw' && editor.type() !== 'draw') editor.startDraw();
  if (m === 'kml') $('kml-file').click();
  renderPanel();
}

async function finishEditing() {
  const b = editor.getBoundary();
  if (!b || b.points.length < 3) { toast(t('edit.finishNeed')); return; }
  if (busy) return;
  b.located = editLocated;
  const c = L.latLngBounds(b.points).getCenter();
  const updated = Object.assign({}, current, { boundary: b, area: Math.round(editor.area() * 10) / 10, center: [c.lat, c.lng] });
  busy = true;
  $('btn-finish').disabled = true;
  try {
    await db.update(updated);
  } catch (e) {
    toast(t('db.error', { msg: e.message }));
    return;
  } finally {
    busy = false;
    $('btn-finish').disabled = false;
  }
  setCurrent(updated);
  orchards = orchards.map((o) => (o.id === current.id ? current : o));
  if (relocations.length) await applyRelocations(updated);
  relocations = [];
  editing = false;
  editor.setEditing(false);
  editor.load(null);
  orchardView.show(current.boundary.points);
  setMapMode(isLocated(current) ? 'cut' : 'blank');
  updateSatClip();
  loadOrchardData(current);
  map.fitBounds(orchardView.bounds(), { padding: [40, 40], maxZoom: 21 });
  renderPanel();
  renderTop();
  $('done-text').textContent = t('done.text', { area: fmtArea(Number(current.area)) });
  show('done-modal');
}

// ---------------------------------------------------------------------------
// Lokacija: odabir na karti / uklanjanje (oblik, stabla i gredice zadržavaju razmake u metrima)
// ---------------------------------------------------------------------------
function moveLL(ll, from, to) { return fromLocal(toLocal(L.latLng(ll), from), to); }
function moveBoundary(b, from, to) {
  const pts = b.points.map((p) => { const q = moveLL(p, from, to); return [q.lat, q.lng]; });
  if (b.type === 'rect') { const c = moveLL(b.rect.center, from, to); return Object.assign({}, b, { rect: Object.assign({}, b.rect, { center: [c.lat, c.lng] }), points: pts }); }
  return Object.assign({}, b, { points: pts });
}
function shapeCenter(b) { return b && b.points.length ? L.latLngBounds(b.points).getCenter() : null; }

function startPick() {
  if (!editing) return;
  const b = editor.getBoundary();
  picking = { boundary: b };
  editor.setEditing(false);
  editor.load(null);
  setMapMode('real');
  map.setView(PICK_CENTER, 7);
  hide('edit-panel');
  $('place-text').textContent = '📍 ' + t('loc.pickHint');
  show('place-bar');
  renderTop();
  setTimeout(() => $('search-input').focus(), 50);
}

function cancelPick(silent) {
  if (!picking) return;
  const b = picking.boundary;
  picking = null;
  hide('place-bar');
  if (silent) return;
  setMapMode(editLocated ? 'real' : 'blank');
  editor.load(b);
  editor.setEditing(true);
  const bb = editor.bounds();
  if (bb) map.fitBounds(bb, { padding: [60, 60], maxZoom: 21 }); else map.setView(VIRTUAL_ORIGIN, 19);
  renderPanel();
  renderTop();
}

map.on('click', (e) => {
  if (!picking) return;
  const b = picking.boundary;
  picking = null;
  hide('place-bar');
  const to = e.latlng;
  const from = shapeCenter(b);
  editLocated = true;
  editor.setEditing(true);
  map.setView(to, 19);
  if (current.boundary && from && b.points.length >= 3) {
    // već postojeće zemljište (možda sa stablima): premjesti ga na odabrano mjesto
    relocations.push({ from, to });
    editor.load(moveBoundary(b, from, to));
  } else {
    // prvo označavanje: odmah klikanje kutova na satelitskoj snimci
    editor.startDraw();
    editMethod = 'draw';
  }
  renderPanel();
  renderTop();
});
$('place-cancel').addEventListener('click', () => cancelPick(false));

function removeLocation() {
  if (!confirm(t('loc.removeConfirm'))) return;
  const b = editor.getBoundary();
  const from = shapeCenter(b);
  editLocated = false;
  setMapMode('blank');
  if (from && b.points.length) {
    relocations.push({ from, to: VIRTUAL_ORIGIN });
    editor.load(moveBoundary(b, from, VIRTUAL_ORIGIN));
  } else {
    editor.startRect(VIRTUAL_ORIGIN, 20, 20);
  }
  const bb = editor.bounds();
  if (bb) map.fitBounds(bb, { padding: [60, 60], maxZoom: 21 });
  renderPanel();
  renderTop();
}
$('loc-btn').addEventListener('click', () => (editLocated ? removeLocation() : startPick()));

// Stabla i gredice prate oblik kad se promijeni lokacija
async function applyRelocations(o) {
  const move = (ll) => relocations.reduce((p, r) => moveLL(p, r.from, r.to), L.latLng(ll));
  try {
    const list = await treesDb.list(o.id);
    await Promise.all(list.map((tr) => { const p = move([tr.lat, tr.lng]); return treesDb.update(tr.id, { lat: p.lat, lng: p.lng }); }));
    await loadItems(o);
    for (const id of Object.keys(state.items.bed)) {
      const bed = state.items.bed[id];
      const c = move(bed.center);
      await setItem('bed', id, Object.assign({}, bed, { center: [c.lat, c.lng] }));
    }
  } catch (e) { toast(t('db.error', { msg: e.message })); }
}

// ---------------------------------------------------------------------------
// Prijava
// ---------------------------------------------------------------------------
let authMode = 'login';

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll('.auth-tab').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('auth-submit').textContent = t(mode === 'login' ? 'auth.login' : 'auth.register');
  $('auth-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('auth-forgot').classList.toggle('hidden', mode !== 'login');
  authMessage('');
}

function authMessage(msg, kind) {
  const el = $('auth-msg');
  el.textContent = msg || '';
  el.className = 'auth-msg' + (kind ? ' ' + kind : '');
  el.classList.toggle('hidden', !msg);
}

function friendlyAuthError(e) {
  const m = (e && e.message) || '';
  if (/invalid login credentials/i.test(m)) return t('auth.badLogin');
  if (/already registered|already exists/i.test(m)) return t('auth.exists');
  if (/provider is not enabled|unsupported provider/i.test(m)) return t('auth.googleOff');
  return t('auth.error', { msg: m });
}

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  if (!email || password.length < 6) { authMessage(t('auth.needEmail'), 'error'); return; }
  $('auth-submit').disabled = true;
  try {
    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
      if (error) throw error;
      if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        authMessage(t('auth.exists'), 'error');
      } else if (!data.session) {
        authMessage(t('auth.checkEmail'), 'info');
        setAuthMode('login');
        authMessage(t('auth.checkEmail'), 'info');
      }
    }
  } catch (err) {
    authMessage(friendlyAuthError(err), 'error');
  } finally {
    $('auth-submit').disabled = false;
  }
});

document.querySelectorAll('.auth-tab').forEach((b) => b.addEventListener('click', () => setAuthMode(b.dataset.mode)));

$('auth-google').addEventListener('click', async () => {
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
  if (error) authMessage(friendlyAuthError(error), 'error');
});

$('auth-forgot').addEventListener('click', async () => {
  const email = $('auth-email').value.trim();
  if (!email) { authMessage(t('auth.needEmail'), 'error'); return; }
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  authMessage(error ? friendlyAuthError(error) : t('auth.forgotSent'), error ? 'error' : 'info');
});

$('btn-logout').addEventListener('click', async () => {
  await supabase.auth.signOut();
});

async function onAuth(session, event) {
  if (event === 'PASSWORD_RECOVERY') {
    const pw = prompt(t('auth.newPassword'));
    if (pw && pw.length >= 6) {
      const { error } = await supabase.auth.updateUser({ password: pw });
      toast(error ? friendlyAuthError(error) : t('auth.passwordChanged'));
    }
  }
  const nextUser = session ? session.user : null;
  // isti korisnik (npr. osvježen token ili povratak na karticu): ne učitavaj ponovno
  if (nextUser && user && nextUser.id === user.id) return;
  user = nextUser;
  if (!user) {
    orchards = [];
    if (editing) { editing = false; editor.setEditing(false); renderPanel(); }
    clearOrchard();
    ['welcome', 'new-modal', 'howto-modal', 'done-modal', 'enc-modal', 'tasks-modal', 'tree-modal', 'bed-modal'].forEach(hide);
    setAuthMode('login');
    show('auth-modal');
    return;
  }
  hide('auth-modal');
  const importedId = await offerLegacyImport();
  await loadOrchards(importedId);
}

// ---------------------------------------------------------------------------
// Ostali događaji
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
  const address = '';
  if (!name) { $('new-error').textContent = t('new.nameRequired'); show('new-error'); return; }
  if (busy) return;
  busy = true;
  let created;
  try {
    created = await db.create({ name, address }, user.id);
  } catch (err) {
    $('new-error').textContent = t('db.error', { msg: err.message });
    show('new-error');
    return;
  } finally {
    busy = false;
  }
  hide('new-modal');
  if (editing) stopEditing();
  orchards = orchards.concat([created]).sort((a, b) => a.name.localeCompare(b.name, 'hr'));
  showOrchard(created, false);
  startEditing(true);
});

$('orchard-select').addEventListener('change', (e) => {
  if (editing) stopEditing();
  showOrchard(orchards.find((o) => o.id === e.target.value));
});
$('btn-edit').addEventListener('click', () => startEditing(false));
$('btn-delete').addEventListener('click', async () => {
  if (!current || !confirm(t('top.deleteConfirm', { name: current.name }))) return;
  try {
    await db.remove(current.id);
  } catch (e) {
    toast(t('db.error', { msg: e.message }));
    return;
  }
  orchards = orchards.filter((o) => o.id !== current.id);
  const next = orchards[0] || null;
  if (next) showOrchard(next); else { clearOrchard(); show('welcome'); }
});
$('lang-btn').addEventListener('click', () => setLang(getLang() === 'hr' ? 'en' : 'hr'));
$('auth-lang').addEventListener('click', () => setLang(getLang() === 'hr' ? 'en' : 'hr'));

$('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  goTo($('search-input').value.trim());
});

document.querySelectorAll('[data-choose]').forEach((b) => b.addEventListener('click', () => {
  hide('howto-modal');
  const c = b.dataset.choose;
  if (c === 'locate') { if (!editLocated) startPick(); }
  else if (c === 'kml') chooseMethod('kml');
  else renderPanel(); // oblik: pravokutnik je već tu, a "Iscrtano" je u panelu
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
  const pts = parseKmlPolygon(await file.text());
  if (!pts) { toast(t('edit.kmlError')); return; }
  const before = editor.getBoundary();
  const from = shapeCenter(before);
  if (!editLocated) {
    editLocated = true;
    setMapMode('real');
    const to = L.latLngBounds(pts).getCenter();
    if (from) relocations.push({ from, to });
  }
  editMethod = 'kml';
  editor.loadPoints(pts, 'kml');
  renderPanel();
  renderTop();
});
$('btn-finish').addEventListener('click', finishEditing);
$('done-ok').addEventListener('click', () => hide('done-modal'));
$('done-add').addEventListener('click', () => { hide('done-modal'); trees.openAddModal(); });

$('menu-btn').addEventListener('click', () => setMenuOpen($('side-menu').classList.contains('hidden')));
$('menu-add').addEventListener('click', () => { setMenuOpen(false); trees.openAddModal(); });
$('menu-move').addEventListener('click', () => trees.toggleMove());
$('menu-enc').addEventListener('click', () => { setMenuOpen(false); openEncyclopedia(); });
$('menu-tasks').addEventListener('click', () => { setMenuOpen(false); openTasks(); });
$('menu-sat').addEventListener('click', () => { orchardView.setSatellite(!orchardView.satellite()); updateSatClip(); updateMenu(); });
$('menu-bed').addEventListener('click', () => { setMenuOpen(false); ruler.stop(); beds.openAdd(); });
$('menu-filter').addEventListener('click', () => { setMenuOpen(false); filter.open(); });
$('menu-ruler').addEventListener('click', () => { setMenuOpen(false); trees.setMove(false); trees.closePanel(); beds.closePanel(); ruler.start(); });
$('menu-weather').addEventListener('click', () => { setMenuOpen(false); openWeather(); });
$('menu-yield').addEventListener('click', () => { setMenuOpen(false); openYield(); });
$('menu-report').addEventListener('click', () => { setMenuOpen(false); openReport(); });
$('menu-wallet').addEventListener('click', () => { setMenuOpen(false); openWallet(); });
$('menu-edit').addEventListener('click', () => startEditing(false));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { cancelPick(false); ['howto-modal', 'done-modal', 'new-modal', 'enc-modal', 'tasks-modal'].forEach(hide); closeExtras(); }
});

onLangChange(() => { buildLayersControl(); if (picking) $('place-text').textContent = '📍 ' + t('loc.pickHint'); renderTop(); renderPanel(); setAuthMode(authMode); rerenderEncyclopedia(); rerenderTasks(); trees.rerenderPanel(); beds.rerender(); rerenderExtras(); if (!$('filter-panel').classList.contains('hidden')) filter.refresh(); });

// ---------------------------------------------------------------------------
// Pokretanje
// ---------------------------------------------------------------------------
applyI18n();
setMapMode('blank');
setAuthMode('login');
renderTop();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
supabase.auth.onAuthStateChange((event, session) => {
  // izvan callbacka, da se ne blokira Supabase klijent
  setTimeout(() => onAuth(session, event), 0);
});
