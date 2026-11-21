// Stabla: prikaz, dodavanje (ikona prati kursor), premještanje, panel stabla.
import { t, fmtNum } from './i18n.js';
import { treesDb } from './supabase.js';
import { species, speciesName, sortedSpecies, markerIcon, speciesIconHtml, waterDrops } from './species.js';
import { loadTasks, tasksFor, upcomingFor, monthName, catIcon } from './tasks.js';
import { openEncyclopedia } from './encyclopedia.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createTrees(map, deps) {
  const layer = L.layerGroup().addTo(map);
  let trees = [];
  let markers = {};
  let orchard = null;
  let pending = null; // stablo koje se postavlja
  let moveMode = false;
  let selectedId = null;

  const canEdit = () => deps.canEdit(orchard);

  function counts() {
    const c = {};
    trees.forEach((tr) => { c[tr.species] = (c[tr.species] || 0) + 1; });
    return c;
  }

  // ---------------- prikaz
  function drawMarker(tr) {
    if (markers[tr.id]) layer.removeLayer(markers[tr.id]);
    const m = L.marker([tr.lat, tr.lng], { icon: markerIcon(tr.species), draggable: moveMode && canEdit(), title: tr.name });
    m.on('click', () => { if (!pending) openPanel(tr.id); });
    m.on('dragend', async () => {
      const p = m.getLatLng();
      if (!deps.contains(p)) { deps.toast(t('tree.outside')); m.setLatLng([tr.lat, tr.lng]); return; }
      try {
        await treesDb.update(tr.id, { lat: p.lat, lng: p.lng });
        tr.lat = p.lat; tr.lng = p.lng;
      } catch (e) { deps.toast(t('db.error', { msg: e.message })); m.setLatLng([tr.lat, tr.lng]); }
    });
    m.addTo(layer);
    markers[tr.id] = m;
    highlight();
  }

  function redrawAll() {
    layer.clearLayers();
    markers = {};
    trees.forEach(drawMarker);
  }

  function highlight() {
    Object.keys(markers).forEach((id) => {
      const el = markers[id].getElement();
      if (el) el.classList.toggle('tree-selected', id === selectedId);
      markers[id].setZIndexOffset(id === selectedId ? 1000 : 0);
    });
  }

  async function load(o) {
    orchard = o;
    trees = [];
    closePanel();
    redrawAll();
    if (!o || !o.boundary) return;
    try { trees = await treesDb.list(o.id); } catch (e) { deps.toast(t('db.loadError', { msg: e.message })); }
    redrawAll();
    deps.onChange && deps.onChange();
  }

  // ---------------- dodavanje
  function openAddModal() {
    if (!canEdit()) return;
    setMove(false);
    $('tree-form').reset();
    $('tree-species').innerHTML = '<option value="">' + t('tree.choose') + '</option>' +
      sortedSpecies().map((s) => '<option value="' + s.id + '">' + esc(speciesName(s.id)) + '</option>').join('');
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
    if (!pending) {
      if (selectedId) closePanel();
      return;
    }
    if (!deps.contains(e.latlng)) { deps.toast(t('tree.outside')); return; }
    const tree = Object.assign({}, pending, { orchard_id: orchard.id, lat: e.latlng.lat, lng: e.latlng.lng });
    stopPlacement();
    try {
      const created = await treesDb.create(tree);
      trees.push(created);
      drawMarker(created);
      openPanel(created.id);
      deps.onChange && deps.onChange();
    } catch (err) {
      deps.toast(t('db.error', { msg: err.message }));
    }
  });

  $('tree-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const sp = $('tree-species').value;
    const name = $('tree-name').value.trim() || (sp ? speciesName(sp) : '');
    if (!sp) { $('tree-error').textContent = t('tree.needSpecies'); $('tree-error').classList.remove('hidden'); return; }
    const h = Number(String($('tree-height').value).replace(',', '.'));
    $('tree-modal').classList.add('hidden');
    startPlacement({
      species: sp,
      name,
      height_m: h > 0 ? h : null,
      stage: $('tree-stage').value || null,
      canopy: $('tree-canopy').value || null,
      notes: $('tree-notes').value.trim() || null
    });
  });
  $('tree-cancel').addEventListener('click', () => $('tree-modal').classList.add('hidden'));
  $('place-cancel').addEventListener('click', stopPlacement);

  // ---------------- premještanje
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

  async function openPanel(id) {
    const tr = trees.find((x) => x.id === id);
    if (!tr) return;
    selectedId = id;
    highlight();
    await loadTasks().catch(() => {});
    const month = new Date().getMonth() + 1;
    const now = tasksFor(tr.species, month);
    const next = upcomingFor(tr.species, 4);
    const chips = [];
    if (tr.height_m) chips.push('📏 ' + fmtNum(tr.height_m, 1) + ' m');
    chips.push(waterDrops(tr.species));
    if (tr.stage) chips.push(t('stage.' + tr.stage));
    if (tr.canopy) chips.push(t('canopy.' + tr.canopy));
    const editable = canEdit();
    $('tree-panel-body').innerHTML =
      '<header class="pp-head"><div class="pp-icon">' + speciesIconHtml(tr.species, 40) + '</div><div><h2>' + esc(tr.name) + '</h2>' +
      '<button type="button" class="link-btn sp-link" data-sp="' + tr.species + '">' + esc(speciesName(tr.species)) + '</button></div></header>' +
      '<div class="pp-chips">' + chips.map((c) => '<span class="pp-chip">' + c + '</span>').join('') + '</div>' +
      '<h4>📋 ' + t('tree.tasksNow', { month: monthName(month).toLowerCase() }) + '</h4>' +
      (now.length ? now.map((z) => '<div class="pp-task prio-' + z.prioritet + '"><b>' + catIcon(z.kategorija) + ' ' + esc(z.naslov) + '</b><div class="muted">' + esc(z.opis || '') + '</div></div>').join('') : '<p class="muted">' + t('tree.noTasks') + '</p>') +
      (next.length ? '<h4>📅 ' + t('tree.nextTasks') + '</h4><ul class="pp-next">' + next.map((g) => '<li><b>' + monthName(g.month) + '</b><span>' + g.tasks.map((z) => catIcon(z.kategorija) + ' ' + esc(z.naslov)).join('<br>') + '</span></li>').join('') + '</ul>' : '') +
      '<h4>📝 ' + t('tree.notes') + '</h4><textarea id="tree-notes-edit" rows="3"' + (editable ? '' : ' readonly') + '>' + esc(tr.notes || '') + '</textarea>' +
      (editable ? '<div class="pp-foot"><button type="button" id="tree-delete" class="btn-danger-outline">🗑️ ' + t('tree.delete') + '</button></div>' : '');
    $('tree-panel').classList.remove('hidden');

    const notesEl = $('tree-notes-edit');
    if (editable) {
      notesEl.addEventListener('change', async () => {
        const v = notesEl.value.trim();
        try { await treesDb.update(tr.id, { notes: v || null }); tr.notes = v; deps.toast(t('saved.cloud')); } catch (e) { deps.toast(t('db.error', { msg: e.message })); }
      });
      $('tree-delete').addEventListener('click', async () => {
        if (!confirm(t('tree.deleteConfirm', { name: tr.name }))) return;
        try {
          await treesDb.remove(tr.id);
          trees = trees.filter((x) => x.id !== tr.id);
          layer.removeLayer(markers[tr.id]);
          delete markers[tr.id];
          closePanel();
          deps.onChange && deps.onChange();
        } catch (e) { deps.toast(t('db.error', { msg: e.message })); }
      });
    }
  }

  $('tree-panel-close').addEventListener('click', closePanel);
  $('tree-panel-body').addEventListener('click', (e) => {
    const b = e.target.closest('.sp-link');
    if (b) openEncyclopedia(b.dataset.sp);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { stopPlacement(); $('tree-modal').classList.add('hidden'); }
  });

  return {
    load,
    counts,
    openAddModal,
    toggleMove: () => setMove(!moveMode),
    setMove,
    hideAll() { orchard = null; trees = []; layer.clearLayers(); markers = {}; closePanel(); stopPlacement(); },
    rerenderPanel() { if (selectedId) openPanel(selectedId); setMove(moveMode); }
  };
}
