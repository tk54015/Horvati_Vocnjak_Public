// Gredice: pravokutnik u metrima (okretanje ⟳, premještanje ✥), sadnje po godinama, upozorenje za plodored.
import { t, fmtNum } from './i18n.js';
import { rectCorners, rectHandle, toLocal } from './geo.js';
import { state, setItem, uid, todayIso, fmtDate, onChange } from './state.js';
import { loadVegetables } from './encyclopedia.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FAMILY = {
  rajcica: 'pomoćnice', paprika: 'pomoćnice', patlidzan: 'pomoćnice', krumpir: 'pomoćnice',
  krastavac: 'tikvenjače', tikvica: 'tikvenjače', bundeva: 'tikvenjače', lubenica: 'tikvenjače',
  kupus: 'kupusnjače', rotkvica: 'kupusnjače', luk: 'lukovi', cesnjak: 'lukovi', poriluk: 'lukovi',
  mrkva: 'štitarke', persin: 'štitarke', grah: 'mahunarke', grasak: 'mahunarke', cikla: 'lobode', blitva: 'lobode', spinat: 'lobode'
};

const handleIcon = (cls, txt) => L.divIcon({ className: 'hv-handle-wrap', html: '<div class="hv-handle ' + cls + '">' + txt + '</div>', iconSize: [26, 26], iconAnchor: [13, 13] });

export function createBeds(map, deps) {
  const layer = L.layerGroup().addTo(map);
  let veg = null;
  let selected = null;
  let placing = null;
  let preview = null;

  const beds = () => state.items.bed;
  const rect = (b) => ({ center: b.center, w: b.sirina, h: b.duzina, rot: b.rot || 0 });
  const vegById = (id) => (veg ? veg.vrste.find((v) => v.id === id) : null);
  const yearPlantings = (b, y) => (b.sadnje || []).filter((s) => String(s.datum || '').slice(0, 4) === String(y));

  function draw() {
    layer.clearLayers();
    Object.keys(beds()).forEach((id) => {
      const b = beds()[id];
      const sel = id === selected;
      const poly = L.polygon(rectCorners(rect(b)), { color: sel ? '#1e88e5' : '#4e2f12', weight: sel ? 3 : 1.5, fillColor: '#8b5a2b', fillOpacity: 0.7, bubblingMouseEvents: false });
      poly.on('click', () => { if (!deps.isBusy()) openPanel(id); });
      poly.addTo(layer);
      const emojis = [...new Set(yearPlantings(b, new Date().getFullYear()).map((s) => (vegById(s.povrce) || {}).emoji || '🌱'))];
      let label = null;
      if (emojis.length) {
        label = L.marker(b.center, { icon: L.divIcon({ className: 'bed-wrap', html: '<div class="bed-emoji">' + emojis.slice(0, 4).join('') + '</div>', iconSize: null }), keyboard: false });
        label.on('click', () => openPanel(id));
        label.addTo(layer);
      }
      if (sel && state.canEdit) {
        const r = rect(b);
        const line = L.polyline([rectHandle(r, -1), rectHandle(r, 1)], { color: '#1e88e5', weight: 1.5, dashArray: '4 4', interactive: false }).addTo(layer);
        const rot = L.marker(rectHandle(r, 1), { draggable: true, icon: handleIcon('rotate', '⟳'), zIndexOffset: 2000, keyboard: false }).addTo(layer);
        const mov = L.marker(rectHandle(r, -1), { draggable: true, icon: handleIcon('move', '✥'), zIndexOffset: 2000, keyboard: false }).addTo(layer);
        const refresh = () => {
          const rr = rect(b);
          poly.setLatLngs(rectCorners(rr));
          if (label) label.setLatLng(b.center);
          line.setLatLngs([rectHandle(rr, -1), rectHandle(rr, 1)]);
        };
        rot.on('drag', (e) => {
          const p = toLocal(e.target.getLatLng(), L.latLng(b.center));
          b.rot = (Math.round(Math.atan2(p.x, p.y) * 180 / Math.PI) + 360) % 360;
          refresh();
          mov.setLatLng(rectHandle(rect(b), -1));
          $('bed-size').textContent = sizeText(b);
        });
        let start = null;
        mov.on('dragstart', (e) => { start = { c: b.center.slice(), h: e.target.getLatLng() }; });
        mov.on('drag', (e) => {
          const p = e.target.getLatLng();
          b.center = [start.c[0] + (p.lat - start.h.lat), start.c[1] + (p.lng - start.h.lng)];
          refresh();
          rot.setLatLng(rectHandle(rect(b), 1));
          const d = toLocal(L.latLng(b.center), L.latLng(start.c));
          $('bed-size').textContent = '↔ ' + fmtNum(Math.abs(d.x), 2) + ' m ' + (d.x >= 0 ? t('dir.e') : t('dir.w')) + ' · ' + fmtNum(Math.abs(d.y), 2) + ' m ' + (d.y >= 0 ? t('dir.n') : t('dir.s'));
        });
        const save = () => setItem('bed', id, Object.assign({}, b));
        rot.on('dragend', save);
        mov.on('dragend', save);
      }
    });
  }

  function sizeText(b) {
    return fmtNum(b.sirina, 2) + ' × ' + fmtNum(b.duzina, 2) + ' m · ' + fmtNum(b.sirina * b.duzina, 1) + ' m²' + (b.rot ? ' · ' + b.rot + '°' : '');
  }

  // ---------------- dodavanje
  function openAdd() {
    if (!state.canEdit) return;
    $('bed-form').reset();
    $('bed-new-name').value = t('bed.defaultName', { n: Object.keys(beds()).length + 1 });
    $('bed-error').classList.add('hidden');
    $('bed-modal').classList.remove('hidden');
    $('bed-new-w').focus();
  }

  $('bed-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const w = Number(String($('bed-new-w').value).replace(',', '.'));
    const l = Number(String($('bed-new-l').value).replace(',', '.'));
    if (!(w > 0 && w <= 100) || !(l > 0 && l <= 200)) { $('bed-error').textContent = t('bed.needSize'); $('bed-error').classList.remove('hidden'); return; }
    $('bed-modal').classList.add('hidden');
    placing = { naziv: $('bed-new-name').value.trim() || t('bed.defaultName', { n: Object.keys(beds()).length + 1 }), sirina: w, duzina: l, rot: 0, sadnje: [] };
    $('place-text').textContent = '🟫 ' + t('bed.placeHint', { name: placing.naziv });
    $('place-bar').classList.remove('hidden');
    document.body.classList.add('placing');
    preview = L.polygon(rectCorners({ center: [0, 0], w, h: l, rot: 0 }), { color: '#1e88e5', weight: 2, dashArray: '4 4', fillColor: '#8b5a2b', fillOpacity: 0.4, interactive: false }).addTo(map);
  });
  $('bed-cancel').addEventListener('click', () => $('bed-modal').classList.add('hidden'));

  function stopPlacing() {
    if (!placing) return;
    placing = null;
    if (preview) { map.removeLayer(preview); preview = null; }
    $('place-bar').classList.add('hidden');
    document.body.classList.remove('placing');
  }
  $('place-cancel').addEventListener('click', stopPlacing);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { stopPlacing(); $('bed-modal').classList.add('hidden'); } });

  map.on('mousemove', (e) => { if (placing && preview) preview.setLatLngs(rectCorners({ center: [e.latlng.lat, e.latlng.lng], w: placing.sirina, h: placing.duzina, rot: 0 })); });
  map.on('click', async (e) => {
    if (placing) {
      if (!deps.contains(e.latlng)) { deps.toast(t('bed.outside')); return; }
      const b = Object.assign({}, placing, { center: [e.latlng.lat, e.latlng.lng] });
      const id = uid('bed');
      stopPlacing();
      await setItem('bed', id, b);
      openPanel(id);
      return;
    }
    if (selected && !deps.isBusy()) closePanel();
  });

  // ---------------- panel
  function closePanel() { selected = null; $('bed-panel').classList.add('hidden'); draw(); }

  function warning(b, vegId, year) {
    const fam = FAMILY[vegId];
    if (!fam) return '';
    const hit = (b.sadnje || []).filter((s) => FAMILY[s.povrce] === fam && Number(String(s.datum).slice(0, 4)) < year && Number(String(s.datum).slice(0, 4)) >= year - 3)
      .sort((x, y) => String(y.datum).localeCompare(String(x.datum)))[0];
    if (!hit) return '';
    return '⚠️ ' + t('bed.rotation', { veg: (vegById(hit.povrce) || {}).naziv || hit.povrce, year: String(hit.datum).slice(0, 4), fam });
  }

  function plantingText(s) {
    const v = vegById(s.povrce);
    const amount = s.kolicina === 'redovi' ? t('bed.rows', { n: s.iznos }) : s.kolicina === 'dio' ? t('bed.part', { m: fmtNum(s.iznos, 1) }) : t('bed.whole');
    return { emoji: v ? v.emoji : '🌱', name: v ? v.naziv : s.povrce, amount };
  }

  function renderPanel() {
    const b = beds()[selected];
    if (!b) { closePanel(); return; }
    const y = new Date().getFullYear();
    const editable = state.canEdit;
    const cur = yearPlantings(b, y);
    const older = (b.sadnje || []).filter((s) => String(s.datum).slice(0, 4) < String(y));
    const byYear = {};
    older.forEach((s) => { (byYear[String(s.datum).slice(0, 4)] = byYear[String(s.datum).slice(0, 4)] || []).push(s); });
    let h = '<header class="pp-head"><div class="pp-icon bed-ico">🟫</div><div><h2>' + esc(b.naziv) + '</h2><div class="muted" id="bed-size">' + sizeText(b) + '</div></div></header>';
    h += '<h4>🌱 ' + t('bed.thisYear', { y }) + '</h4>';
    h += cur.length ? '<ul class="pp-log">' + cur.map((s) => { const x = plantingText(s); return '<li><span class="li-icon">' + x.emoji + '</span><div><b>' + esc(x.name) + '</b> <small>' + esc(x.amount) + ' · ' + fmtDate(s.datum) + '</small>' + (s.napomena ? '<div class="muted">' + esc(s.napomena) + '</div>' : '') + '</div>' + (editable ? '<button type="button" class="x-mini" data-act="p-del" data-id="' + s.id + '">✕</button>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="muted">' + t('bed.empty') + '</p>';
    if (editable && veg) {
      h += '<form id="plant-form" class="pp-form"><div class="row"><select id="p-veg">' + veg.vrste.slice().sort((a, c) => a.naziv.localeCompare(c.naziv, 'hr')).map((v) => '<option value="' + v.id + '">' + v.emoji + ' ' + esc(v.naziv) + '</option>').join('') + '</select><input id="p-date" type="date" value="' + todayIso() + '"></div>' +
        '<div class="row"><select id="p-kind"><option value="cijela">' + t('bed.whole') + '</option><option value="redovi">' + t('bed.byRows') + '</option><option value="dio">' + t('bed.byPart') + '</option></select><input id="p-amount" type="number" min="0" step="0.5" class="hidden" placeholder="#"></div>' +
        '<div id="p-info" class="muted"></div><div id="p-warn" class="warn hidden"></div>' +
        '<div class="row"><input id="p-note" type="text" maxlength="200" placeholder="' + esc(t('bed.notePh')) + '"><button type="submit" class="btn-primary">' + t('log.add') + '</button></div></form>';
    }
    h += '<h4>🕘 ' + t('bed.history') + '</h4>' + (Object.keys(byYear).length ? '<ul class="pp-log">' + Object.keys(byYear).sort().reverse().map((yy) => '<li><b>' + yy + '</b><div>' + byYear[yy].map((s) => { const x = plantingText(s); return x.emoji + ' ' + esc(x.name) + ' <small>(' + esc(x.amount) + ')</small>'; }).join(', ') + '</div></li>').join('') + '</ul>' : '<p class="muted">' + t('bed.noHistory') + '</p>');
    if (editable) h += '<div class="pp-foot"><button type="button" class="t-act" data-act="b-rot0">⟲ ' + t('bed.straighten') + '</button><button type="button" class="btn-danger-outline" data-act="b-del">🗑️ ' + t('bed.delete') + '</button></div>';
    $('bed-panel-body').innerHTML = h;
    $('bed-panel').classList.remove('hidden');
    updateInfo();
  }

  function updateInfo() {
    const b = beds()[selected];
    if (!b || !$('p-veg')) return;
    const v = vegById($('p-veg').value);
    const mon = (a) => (a || []).map((m) => m).join(', ') || '–';
    $('p-info').textContent = v ? t('enc.legIndoor') + ': ' + mon(v.unutra) + ' · ' + t('enc.legPlant') + ': ' + mon(v.sadnja) + ' · ' + t('enc.legHarvest') + ': ' + mon(v.berba) : '';
    const w = warning(b, $('p-veg').value, Number(String($('p-date').value || todayIso()).slice(0, 4)));
    $('p-warn').textContent = w;
    $('p-warn').classList.toggle('hidden', !w);
    $('p-amount').classList.toggle('hidden', $('p-kind').value === 'cijela');
  }

  async function openPanel(id) {
    deps.closeOthers && deps.closeOthers();
    selected = id;
    veg = await loadVegetables().catch(() => null);
    draw();
    renderPanel();
  }

  $('bed-panel-close').addEventListener('click', closePanel);
  $('bed-panel-body').addEventListener('change', (e) => { if (['p-veg', 'p-date', 'p-kind'].includes(e.target.id)) updateInfo(); });
  $('bed-panel-body').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = beds()[selected];
    if (!b || !state.canEdit) return;
    const kind = $('p-kind').value;
    const amount = Number(String($('p-amount').value).replace(',', '.'));
    if (kind !== 'cijela' && !(amount > 0)) { deps.toast(t('bed.needAmount')); return; }
    const nb = Object.assign({}, b, { sadnje: (b.sadnje || []).concat([{ id: uid('s'), povrce: $('p-veg').value, datum: $('p-date').value || todayIso(), kolicina: kind, iznos: kind === 'cijela' ? null : amount, napomena: $('p-note').value.trim() }]) });
    await setItem('bed', selected, nb);
  });
  $('bed-panel-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || !state.canEdit) return;
    const b = beds()[selected];
    if (!b) return;
    if (btn.dataset.act === 'p-del') {
      if (!confirm(t('bed.deletePlanting'))) return;
      await setItem('bed', selected, Object.assign({}, b, { sadnje: (b.sadnje || []).filter((s) => s.id !== btn.dataset.id) }));
    } else if (btn.dataset.act === 'b-rot0') {
      await setItem('bed', selected, Object.assign({}, b, { rot: 0 }));
    } else if (btn.dataset.act === 'b-del') {
      if (!confirm(t('bed.deleteConfirm', { name: b.naziv }))) return;
      const id = selected;
      closePanel();
      await setItem('bed', id, null);
    }
  });

  onChange((what) => { if (what === 'bed' || what === 'reload') { draw(); if (selected) renderPanel(); } });

  return {
    openAdd,
    async refresh() { veg = await loadVegetables().catch(() => null); draw(); },
    hideAll() { layer.clearLayers(); selected = null; $('bed-panel').classList.add('hidden'); stopPlacing(); },
    closePanel,
    isPlacing: () => !!placing,
    rerender() { if (selected) renderPanel(); }
  };
}
