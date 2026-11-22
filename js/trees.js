// Stabla: prikaz, dodavanje, premještanje, panel (Pregled / Dnevnik / Berba), oznake zadataka, filter.
import { t, fmtNum } from './i18n.js';
import { treesDb } from './supabase.js';
import { species, speciesName, speciesLabel, sortedSpecies, markerIcon, speciesIconHtml, waterDrops } from './species.js';
import { loadTasks, monthName, catIcon } from './tasks.js';
import { openEncyclopedia } from './encyclopedia.js';
import {
  state, counts, changed, onChange, setItem, saveTreeData, uid, todayIso, fmtDate, yieldRange,
  LOG_TYPES, logTypeForCategory, treeTasks, treeAlertLevel, upcoming, reconcile
} from './state.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createTrees(map, deps) {
  const layer = L.layerGroup().addTo(map);
  const badgeLayer = L.layerGroup().addTo(map);
  let markers = {};
  let pending = null;
  let moveMode = false;
  let selectedId = null;
  let tab = 'pregled';
  let postponingKey = null;
  let filter = { species: {}, state: 'all', search: '', badges: 'important' };

  const canEdit = () => state.canEdit;
  const byId = (id) => state.trees.find((x) => x.id === id);

  // ---------------- karta
  function drawMarker(tr) {
    if (markers[tr.id]) layer.removeLayer(markers[tr.id]);
    const m = L.marker([tr.lat, tr.lng], { icon: markerIcon(tr.species), draggable: moveMode && canEdit(), title: tr.name });
    m.on('click', () => { if (!pending && !deps.isBusy()) openPanel(tr.id); });
    m.on('dragend', async () => {
      const p = m.getLatLng();
      if (!deps.contains(p)) { deps.toast(t('tree.outside')); m.setLatLng([tr.lat, tr.lng]); return; }
      try { await treesDb.update(tr.id, { lat: p.lat, lng: p.lng }); tr.lat = p.lat; tr.lng = p.lng; refreshBadges(); }
      catch (e) { deps.toast(t('db.error', { msg: e.message })); m.setLatLng([tr.lat, tr.lng]); }
    });
    m.addTo(layer);
    markers[tr.id] = m;
  }

  function matches(tr) {
    if (Object.keys(filter.species).length && !filter.species[tr.species]) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      const hay = [tr.name, speciesName(tr.species), tr.notes].concat(((tr.data && tr.data.logs) || []).map((e) => e.text)).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const logs = (tr.data && tr.data.logs) || [];
    if (filter.state === 'tasks' && !treeAlertLevel(tr)) return false;
    if (filter.state === 'notpruned' && logs.some((e) => e.type === 'orezivanje' && String(e.date).slice(0, 4) === String(new Date().getFullYear()))) return false;
    if (filter.state === 'nolog' && logs.length) return false;
    return true;
  }

  function filterActive() { return Object.keys(filter.species).length || filter.state !== 'all' || !!filter.search; }

  function applyFilter() {
    let shown = 0;
    state.trees.forEach((tr) => {
      const ok = !filterActive() || matches(tr);
      if (ok) shown++;
      if (markers[tr.id]) markers[tr.id].setOpacity(ok ? 1 : 0.15);
      tr._shown = ok;
    });
    refreshBadges();
    highlight();
    return { shown, total: state.trees.length };
  }

  function refreshBadges() {
    badgeLayer.clearLayers();
    if (filter.badges === 'off' || !state.raspored) return;
    state.trees.forEach((tr) => {
      if (tr._shown === false) return;
      const level = treeAlertLevel(tr);
      if (!level || (filter.badges === 'important' && level !== 1)) return;
      L.marker([tr.lat, tr.lng], {
        icon: L.divIcon({ className: 'flag-wrap', html: '<span class="flag p' + level + '">!</span>', iconSize: [16, 16], iconAnchor: [-4, 36] }),
        interactive: false, keyboard: false, zIndexOffset: 3000
      }).addTo(badgeLayer);
    });
  }

  function highlight() {
    Object.keys(markers).forEach((id) => {
      const el = markers[id].getElement();
      if (el) el.classList.toggle('tree-selected', id === selectedId);
      markers[id].setZIndexOffset(id === selectedId ? 1000 : 0);
    });
  }

  function redrawAll() {
    layer.clearLayers();
    markers = {};
    state.trees.forEach(drawMarker);
    applyFilter();
  }

  async function load(o) {
    state.trees = [];
    closePanel();
    redrawAll();
    if (!o || !o.boundary) return;
    try { state.trees = await treesDb.list(o.id); } catch (e) { deps.toast(t('db.loadError', { msg: e.message })); }
    state.trees.forEach((tr) => { tr.data = tr.data || {}; });
    await loadTasks().catch(() => {});
    redrawAll();
    changed('trees');
  }

  // ---------------- dodavanje
  function openAddModal() {
    if (!canEdit()) return;
    setMove(false);
    $('tree-form').reset();
    $('tree-species').innerHTML = '<option value="">' + t('tree.choose') + '</option>' + sortedSpecies().map((s) => '<option value="' + s.id + '">' + esc(speciesLabel(s.id)) + '</option>').join('');
    $('tree-error').classList.add('hidden');
    $('tree-modal').classList.remove('hidden');
    $('tree-species').focus();
  }

  function startPlacement(tree) {
    pending = tree;
    const s = species(tree.species);
    $('cursor-tree').innerHTML = s.icon ? '<img src="' + s.icon + '" alt="">' : '<span>' + s.emoji + '</span>';
    $('place-text').textContent = t('tree.placeHint', { name: tree.name });
    $('place-bar').classList.remove('hidden');
    document.body.classList.add('placing');
  }

  function stopPlacement() {
    pending = null;
    $('place-bar').classList.add('hidden');
    $('cursor-tree').classList.add('hidden');
    document.body.classList.remove('placing');
  }

  document.addEventListener('mousemove', (e) => {
    if (!pending) return;
    const c = $('cursor-tree');
    c.style.left = e.clientX + 'px';
    c.style.top = e.clientY + 'px';
    c.classList.remove('hidden');
  });

  map.on('click', async (e) => {
    if (deps.isBusy()) return;
    if (!pending) { if (selectedId) closePanel(); return; }
    if (!deps.contains(e.latlng)) { deps.toast(t('tree.outside')); return; }
    const tree = Object.assign({}, pending, { orchard_id: state.orchard.id, lat: e.latlng.lat, lng: e.latlng.lng });
    stopPlacement();
    try {
      const created = await treesDb.create(tree);
      created.data = created.data || {};
      state.trees.push(created);
      drawMarker(created);
      applyFilter();
      openPanel(created.id);
      changed('trees');
    } catch (err) { deps.toast(t('db.error', { msg: err.message })); }
  });

  $('tree-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const sp = $('tree-species').value;
    if (!sp) { $('tree-error').textContent = t('tree.needSpecies'); $('tree-error').classList.remove('hidden'); return; }
    const name = $('tree-name').value.trim() || speciesName(sp);
    const h = Number(String($('tree-height').value).replace(',', '.'));
    $('tree-modal').classList.add('hidden');
    startPlacement({ species: sp, name, height_m: h > 0 ? h : null, stage: $('tree-stage').value || null, canopy: $('tree-canopy').value || null, notes: $('tree-notes').value.trim() || null, data: {} });
  });
  $('tree-cancel').addEventListener('click', () => $('tree-modal').classList.add('hidden'));
  $('place-cancel').addEventListener('click', stopPlacement);

  function setMove(on) {
    moveMode = !!on && canEdit();
    Object.values(markers).forEach((m) => { if (m.dragging) { if (moveMode) m.dragging.enable(); else m.dragging.disable(); } });
    const b = $('menu-move');
    b.classList.toggle('active', moveMode);
    b.textContent = moveMode ? t('menu.moveOn') : t('menu.move');
  }

  // ---------------- panel stabla
  function closePanel() {
    selectedId = null;
    $('tree-panel').classList.add('hidden');
    highlight();
  }

  function addLog(tr, entry) {
    tr.data = tr.data || {};
    tr.data.logs = (tr.data.logs || []).concat([Object.assign({ id: uid('l'), at: new Date().toISOString() }, entry)]);
    return saveTreeData(tr).then(() => reconcile());
  }

  function tasksHtml(tr) {
    const list = treeTasks(tr);
    const editable = canEdit();
    let h = '<h4>📋 ' + t('tree.tasksNow', { month: monthName(new Date().getMonth() + 1).toLowerCase() }) + '</h4>';
    if (!list.length) return h + '<p class="muted">' + t('tree.noTasks') + '</p>';
    return h + list.map((x) => {
      const z = x.row.task;
      const key = esc(x.row.key);
      const undo = (act, extra) => (editable ? ' <button type="button" class="undo" data-act="' + act + '" data-key="' + key + '"' + (extra || '') + '>↩</button>' : '');
      let status = '';
      if (x.handled) status = '<span class="st ok">✓ ' + t('tree.doneOn', { date: fmtDate(x.handled.date) }) + '</span>' + (x.handled.taskKey === x.row.key ? undo('undo-log', ' data-log="' + esc(x.handled.id) + '"') : '');
      else if (x.skipped) status = '<span class="st skip">⊘ ' + t('tasks.skipped') + '</span>' + undo('undo-state');
      else if (x.postponedAway) status = '<span class="st post">⇄ ' + t('tasks.postponedTo') + ' ' + monthName(x.treeState.to.month) + '</span>' + undo('undo-state');
      else if (x.row.done) status = '<span class="st ok">✓ ' + t('tree.doneSpecies') + '</span>';
      else if (editable && postponingKey === x.row.key) {
        const n = new Date();
        let opts = '';
        for (let i = 1; i <= 6; i++) { let m = n.getMonth() + 1 + i; let y = n.getFullYear(); while (m > 12) { m -= 12; y++; } opts += '<option value="' + y + '-' + m + '">' + monthName(m) + ' ' + y + '</option>'; }
        status = '<select class="pp-m">' + opts + '</select><button type="button" class="t-act primary" data-act="pp-ok" data-key="' + key + '">' + t('tasks.postpone') + '</button><button type="button" class="undo" data-act="pp-cancel">✕</button>';
      } else if (editable) {
        status = '<span class="tri"><button type="button" class="tri-btn ok" data-act="done" data-key="' + key + '" title="' + esc(t('tree.doneHere')) + '">✓</button>' +
          '<button type="button" class="tri-btn post" data-act="postpone" data-key="' + key + '" title="' + esc(t('tasks.postpone')) + '">⇄</button>' +
          '<button type="button" class="tri-btn skip" data-act="skip" data-key="' + key + '" title="' + esc(t('tasks.skip')) + '">⊘</button></span>';
      }
      let badges = z.poPotrebi ? ' <span class="badge cond">🔎</span>' : '';
      if (x.movedIn) badges += ' <span class="badge moved">↪</span>';
      return '<div class="pp-task prio-' + z.prioritet + (x.open ? '' : ' done') + '"><div class="pp-task-head"><b>' + catIcon(z.kategorija) + ' ' + esc(z.naslov) + badges + '</b><span class="pp-status">' + status + '</span></div>' +
        (z.opis ? '<div class="muted">' + esc(z.opis) + '</div>' : '') + '</div>';
    }).join('');
  }

  function renderPanel() {
    const tr = byId(selectedId);
    if (!tr) { closePanel(); return; }
    const editable = canEdit();
    const logs = ((tr.data && tr.data.logs) || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const chips = [];
    if (tr.height_m) chips.push('📏 ' + fmtNum(tr.height_m, 1) + ' m');
    chips.push(waterDrops(tr.species));
    if (tr.stage) chips.push(t('stage.' + tr.stage));
    if (tr.canopy) chips.push(t('canopy.' + tr.canopy));

    let body = '';
    if (tab === 'pregled') {
      body += tasksHtml(tr);
      const next = upcoming(tr.species, 4);
      if (next.length) body += '<h4>📅 ' + t('tree.nextTasks') + '</h4><ul class="pp-next">' + next.map((g) => '<li><b>' + monthName(g.month) + '</b><span>' + g.tasks.map((z) => catIcon(z.kategorija) + ' ' + esc(z.naslov)).join('<br>') + '</span></li>').join('') + '</ul>';
      body += '<h4>🕘 ' + t('tree.lastWork') + '</h4><div class="pp-last">' + ['orezivanje', 'prskanje', 'gnojidba'].map((type) => {
        const e = logs.find((x) => x.type === type);
        return '<div><span>' + LOG_TYPES[type] + ' ' + t('log.' + type) + '</span>' + (e ? '<b>' + fmtDate(e.date) + '</b>' : '<span class="muted">' + t('tree.notLogged') + '</span>') + '</div>';
      }).join('') + '</div>';
      body += '<h4>📝 ' + t('tree.notes') + '</h4><textarea id="tree-notes-edit" rows="3"' + (editable ? '' : ' readonly') + '>' + esc(tr.notes || '') + '</textarea>';
    } else if (tab === 'dnevnik') {
      if (editable) {
        body += '<form id="log-form" class="pp-form"><div class="row"><select id="log-type">' + Object.keys(LOG_TYPES).map((k) => '<option value="' + k + '">' + LOG_TYPES[k] + ' ' + t('log.' + k) + '</option>').join('') + '</select>' +
          '<input id="log-date" type="date" value="' + todayIso() + '"></div><div class="row"><input id="log-text" type="text" maxlength="200" placeholder="' + esc(t('log.textPh')) + '"><button type="submit" class="btn-primary">' + t('log.add') + '</button></div></form>';
      }
      body += logs.length ? '<ul class="pp-log">' + logs.map((e) => '<li><span class="li-icon">' + (LOG_TYPES[e.type] || '📝') + '</span><div><b>' + t('log.' + (LOG_TYPES[e.type] ? e.type : 'ostalo')) + '</b> <small>' + fmtDate(e.date) + '</small>' +
        (e.text ? '<div class="muted">' + esc(e.text) + '</div>' : '') + '</div>' + (editable ? '<button type="button" class="x-mini" data-act="log-del" data-id="' + esc(e.id) + '">✕</button>' : '') + '</li>').join('') + '</ul>' : '<p class="muted">' + t('log.empty') + '</p>';
    } else {
      const est = yieldRange(tr);
      const harvest = (tr.data && tr.data.harvest) || {};
      const years = Object.keys(harvest).sort().reverse();
      body += est ? '<p>📊 ' + t('harvest.estimate') + ': <b>' + Math.round(est.min) + '–' + Math.round(est.max) + ' kg</b></p>' : '<p class="muted">' + t('harvest.noEstimate') + '</p>';
      if (years.length) {
        const total = years.reduce((s, y) => s + Number(harvest[y].kg || 0), 0);
        body += '<p>🧺 ' + t('harvest.total', { kg: fmtNum(total, 1), n: years.length, avg: fmtNum(total / years.length, 1) }) + '</p>';
      }
      if (editable) {
        body += '<form id="harvest-form" class="pp-form"><div class="row"><input id="harvest-year" type="number" min="2000" max="2100" value="' + new Date().getFullYear() + '"><input id="harvest-kg" type="number" min="0" step="0.1" placeholder="kg"><button type="submit" class="btn-primary">' + t('harvest.save') + '</button></div>' +
          '<input id="harvest-note" type="text" maxlength="200" placeholder="' + esc(t('harvest.notePh')) + '"></form>';
      }
      body += years.length ? '<ul class="pp-log">' + years.map((y) => {
        const kg = Number(harvest[y].kg || 0);
        let cmp = '';
        if (est) cmp = kg < est.min ? '<span class="cmp low">' + t('harvest.below') + '</span>' : kg > est.max ? '<span class="cmp high">' + t('harvest.above') + '</span>' : '<span class="cmp ok">' + t('harvest.within') + '</span>';
        return '<li><b>' + y + '</b><div><b>' + fmtNum(kg, 1) + ' kg</b> ' + cmp + (harvest[y].note ? '<div class="muted">' + esc(harvest[y].note) + '</div>' : '') + '</div>' + (editable ? '<button type="button" class="x-mini" data-act="harvest-del" data-year="' + y + '">✕</button>' : '') + '</li>';
      }).join('') + '</ul>' : '<p class="muted">' + t('harvest.empty') + '</p>';
    }

    $('tree-panel-body').innerHTML =
      '<header class="pp-head"><div class="pp-icon">' + speciesIconHtml(tr.species, 40) + '</div><div><h2>' + esc(tr.name) + '</h2>' +
      '<button type="button" class="link-btn sp-link" data-sp="' + tr.species + '">' + esc(speciesName(tr.species)) + '</button></div></header>' +
      '<div class="pp-chips">' + chips.map((c) => '<span class="pp-chip">' + c + '</span>').join('') + '</div>' +
      '<div class="pp-tabs">' + ['pregled', 'dnevnik', 'berba'].map((k) => '<button type="button" class="pp-tab' + (k === tab ? ' active' : '') + '" data-tab="' + k + '">' + t('tab.' + k) + (k === 'dnevnik' && logs.length ? ' <span class="cnt">' + logs.length + '</span>' : '') + '</button>').join('') + '</div>' +
      '<div class="pp-body">' + body + '</div>' +
      (editable ? '<div class="pp-foot"><button type="button" id="tree-delete" class="btn-danger-outline">🗑️ ' + t('tree.delete') + '</button></div>' : '');
    $('tree-panel').classList.remove('hidden');

    const notesEl = $('tree-notes-edit');
    if (notesEl && editable) {
      notesEl.addEventListener('change', async () => {
        const v = notesEl.value.trim();
        try { await treesDb.update(tr.id, { notes: v || null }); tr.notes = v; deps.toast(t('saved.cloud')); } catch (e) { deps.toast(t('db.error', { msg: e.message })); }
      });
    }
  }

  async function openPanel(id) {
    if (deps.onOpen) deps.onOpen();
    selectedId = id;
    tab = 'pregled';
    postponingKey = null;
    highlight();
    await loadTasks().catch(() => {});
    renderPanel();
  }

  $('tree-panel-close').addEventListener('click', closePanel);
  $('tree-panel-body').addEventListener('click', async (e) => {
    const sp = e.target.closest('.sp-link');
    if (sp) { openEncyclopedia(sp.dataset.sp); return; }
    const tb = e.target.closest('.pp-tab');
    if (tb) { tab = tb.dataset.tab; renderPanel(); return; }
    const tr = byId(selectedId);
    if (!tr) return;
    if (e.target.id === 'tree-delete') {
      if (!confirm(t('tree.deleteConfirm', { name: tr.name }))) return;
      try {
        await treesDb.remove(tr.id);
        state.trees = state.trees.filter((x) => x.id !== tr.id);
        layer.removeLayer(markers[tr.id]);
        delete markers[tr.id];
        closePanel();
        applyFilter();
        changed('trees');
      } catch (err) { deps.toast(t('db.error', { msg: err.message })); }
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b || !canEdit()) return;
    const act = b.dataset.act;
    const key = b.dataset.key;
    const ttKey = tr.id + '|' + key;
    if (act === 'done') {
      const x = treeTasks(tr).find((y) => y.row.key === key);
      if (x) await addLog(tr, { date: todayIso(), type: logTypeForCategory(x.row.task.kategorija), text: x.row.task.naslov, taskKey: key });
    } else if (act === 'postpone') { postponingKey = key; renderPanel(); }
    else if (act === 'pp-cancel') { postponingKey = null; renderPanel(); }
    else if (act === 'pp-ok') {
      const [y, m] = b.parentElement.querySelector('.pp-m').value.split('-').map(Number);
      const n = new Date();
      postponingKey = null;
      await setItem('ttask', ttKey, { status: 'postponed', to: { year: y, month: m }, from: { year: n.getFullYear(), month: n.getMonth() + 1 } });
      await reconcile();
    } else if (act === 'skip') { await setItem('ttask', ttKey, { status: 'skipped' }); await reconcile(); }
    else if (act === 'undo-state') { await setItem('ttask', ttKey, null); await reconcile(); }
    else if (act === 'undo-log' || act === 'log-del') {
      const logId = b.dataset.log || b.dataset.id;
      if (act === 'log-del' && !confirm(t('log.deleteConfirm'))) return;
      tr.data.logs = (tr.data.logs || []).filter((l) => l.id !== logId);
      await saveTreeData(tr);
      await reconcile();
    } else if (act === 'harvest-del') {
      if (!confirm(t('harvest.deleteConfirm', { year: b.dataset.year }))) return;
      delete tr.data.harvest[b.dataset.year];
      await saveTreeData(tr);
    }
  });
  $('tree-panel-body').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tr = byId(selectedId);
    if (!tr || !canEdit()) return;
    if (e.target.id === 'log-form') {
      await addLog(tr, { date: $('log-date').value || todayIso(), type: $('log-type').value, text: $('log-text').value.trim() });
    } else if (e.target.id === 'harvest-form') {
      const kg = Number(String($('harvest-kg').value).replace(',', '.'));
      if (!(kg >= 0) || $('harvest-kg').value === '') { deps.toast(t('harvest.needKg')); return; }
      tr.data.harvest = Object.assign({}, tr.data.harvest || {});
      tr.data.harvest[String(parseInt($('harvest-year').value, 10) || new Date().getFullYear())] = { kg, note: $('harvest-note').value.trim() };
      await saveTreeData(tr);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { stopPlacement(); $('tree-modal').classList.add('hidden'); }
  });

  onChange(() => { if (selectedId) renderPanel(); refreshBadges(); });

  return {
    load,
    openAddModal,
    toggleMove: () => setMove(!moveMode),
    setMove,
    openPanel,
    closePanel,
    isPlacing: () => !!pending,
    hideAll() { state.trees = []; layer.clearLayers(); badgeLayer.clearLayers(); markers = {}; closePanel(); stopPlacement(); },
    rerenderPanel() { if (selectedId) renderPanel(); setMove(moveMode); refreshBadges(); },
    getFilter: () => filter,
    setFilter(f) { filter = Object.assign(filter, f); return applyFilter(); },
    applyFilter,
    filterActive,
    focusTree(id) { const tr = byId(id); if (tr) { map.setView([tr.lat, tr.lng], Math.max(map.getZoom(), 19)); openPanel(id); } }
  };
}
