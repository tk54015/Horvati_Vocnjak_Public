import { t, applyI18n, setLang, getLang, onLangChange, fmtNum, fmtArea } from './i18n.js';
import { createBoundaryEditor } from './geo-editor.js';
import { parseKmlPolygon } from './geo.js';
import { supabase, db } from './supabase.js';

const LEGACY_KEY = 'hvj_orchards_v1'; // voćnjaci iz probne verzije (samo preglednik)
const CURRENT_KEY = 'hvj_current_v1';

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
// Stanje
// ---------------------------------------------------------------------------
let user = null;
let orchards = [];
let current = null;
let editing = false;
let editMethod = 'rect';
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
  $('search-form').classList.toggle('hidden', !loggedIn);
  if (!loggedIn) {
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
  try { localStorage.setItem(CURRENT_KEY, o ? o.id : ''); } catch (e) { /* ništa */ }
  editor.load(o ? o.boundary : null);
  if (o && fit) {
    const b = editor.bounds();
    if (b) map.fitBounds(b, { padding: [40, 40], maxZoom: 20 });
    else if (o.center) map.setView(o.center, 18);
  }
  hide('welcome');
  renderTop();
}

function stopEditing() {
  editing = false;
  editor.setEditing(false);
  editor.load(current ? current.boundary : null);
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
    current = null;
    editor.load(null);
    renderTop();
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

async function finishEditing() {
  const b = editor.getBoundary();
  if (!b || b.points.length < 3) { toast(t('edit.finishNeed')); return; }
  if (busy) return;
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
  current = updated;
  orchards = orchards.map((o) => (o.id === current.id ? current : o));
  editing = false;
  editor.setEditing(false);
  editor.load(current.boundary);
  renderPanel();
  renderTop();
  $('done-text').textContent = t('done.text', { area: fmtArea(Number(current.area)) });
  show('done-modal');
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
    current = null;
    if (editing) { editing = false; editor.setEditing(false); renderPanel(); }
    editor.load(null);
    ['welcome', 'new-modal', 'howto-modal', 'done-modal'].forEach(hide);
    renderTop();
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
  const address = $('new-address').value.trim();
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
  if (address) await goTo(address); else map.setView(map.getCenter(), Math.max(map.getZoom(), 17));
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
  if (next) showOrchard(next); else { current = null; editor.load(null); renderTop(); show('welcome'); }
});
$('lang-btn').addEventListener('click', () => setLang(getLang() === 'hr' ? 'en' : 'hr'));
$('auth-lang').addEventListener('click', () => setLang(getLang() === 'hr' ? 'en' : 'hr'));

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

onLangChange(() => { buildLayersControl(); renderTop(); renderPanel(); setAuthMode(authMode); });

// ---------------------------------------------------------------------------
// Pokretanje
// ---------------------------------------------------------------------------
applyI18n();
buildLayersControl();
setAuthMode('login');
renderTop();
supabase.auth.onAuthStateChange((event, session) => {
  // izvan callbacka, da se ne blokira Supabase klijent
  setTimeout(() => onAuth(session, event), 0);
});
