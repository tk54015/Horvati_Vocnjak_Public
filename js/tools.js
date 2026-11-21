// Ravnalo i filter/pretraga stabala.
import { t, fmtNum } from './i18n.js';
import { distanceM, toLocal } from './geo.js';
import { speciesIconHtml, speciesName } from './species.js';
import { state, counts } from './state.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDist(m) { return m < 1 ? Math.round(m * 100) + ' cm' : fmtNum(m, 2) + ' m'; }

// ---------------------------------------------------------------------------
// Ravnalo
// ---------------------------------------------------------------------------
export function createRuler(map) {
  const layer = L.layerGroup().addTo(map);
  let active = false;
  let a = null;
  let done = false;
  let line = null;
  let label = null;

  function reset() { layer.clearLayers(); a = null; done = false; line = null; label = null; }
  function dot(ll) { return L.circleMarker(ll, { radius: 5, color: '#fff', weight: 2, fillColor: '#d32f2f', fillOpacity: 1, interactive: false }).addTo(layer); }
  function draw(b, final) {
    const d = distanceM(a, b);
    if (!line) line = L.polyline([a, b], { color: '#d32f2f', weight: 3, interactive: false }).addTo(layer);
    line.setLatLngs([a, b]);
    line.setStyle({ dashArray: final ? null : '6 6' });
    const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
    const icon = L.divIcon({ className: 'ruler-wrap', html: '<div class="ruler-label">' + fmtDist(d) + '</div>', iconSize: null });
    if (!label) label = L.marker(mid, { icon, interactive: false, keyboard: false, zIndexOffset: 3000 }).addTo(layer);
    else { label.setLatLng(mid); label.setIcon(icon); }
    return d;
  }

  map.on('click', (e) => {
    if (!active) return;
    if (!a || done) { reset(); a = e.latlng; dot(a); $('ruler-text').textContent = '📏 ' + t('ruler.second'); return; }
    dot(e.latlng);
    const d = draw(e.latlng, true);
    done = true;
    const p = toLocal(e.latlng, a);
    $('ruler-text').textContent = '📏 ' + t('ruler.result', { d: fmtDist(d), ew: fmtDist(Math.abs(p.x)), ns: fmtDist(Math.abs(p.y)) });
  });
  map.on('mousemove', (e) => {
    if (!active || !a || done) return;
    $('ruler-text').textContent = '📏 ' + fmtDist(draw(e.latlng, false)) + ' – ' + t('ruler.second');
  });

  function stop() {
    if (!active) return;
    active = false;
    reset();
    document.body.classList.remove('ruler-mode');
    $('ruler-bar').classList.add('hidden');
  }
  $('ruler-close').addEventListener('click', stop);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') stop(); });

  return {
    isActive: () => active,
    start() {
      active = true;
      reset();
      document.body.classList.add('ruler-mode');
      $('ruler-bar').classList.remove('hidden');
      $('ruler-text').textContent = '📏 ' + t('ruler.first');
    },
    stop
  };
}

// ---------------------------------------------------------------------------
// Filter i pretraga
// ---------------------------------------------------------------------------
export function initFilter(trees) {
  function render() {
    const c = counts();
    const f = trees.getFilter();
    $('filter-types').innerHTML = Object.keys(c).sort((x, y) => c[y] - c[x]).map((s) => '<button type="button" class="fp-type' + (f.species[s] ? ' active' : '') + '" data-sp="' + s + '">' + speciesIconHtml(s, 16) + esc(speciesName(s)) + ' <b>' + c[s] + '</b></button>').join('') || '<span class="muted">' + t('filter.noTrees') + '</span>';
    update();
  }
  function update() {
    const r = trees.applyFilter();
    $('filter-count').textContent = t('filter.count', { shown: r.shown, total: r.total });
    const chip = $('filter-chip');
    chip.classList.toggle('hidden', !trees.filterActive());
    chip.textContent = '🔍 ' + r.shown + ' / ' + r.total + '  ✕';
  }
  $('filter-types').addEventListener('click', (e) => {
    const b = e.target.closest('.fp-type');
    if (!b) return;
    const f = trees.getFilter();
    if (f.species[b.dataset.sp]) delete f.species[b.dataset.sp]; else f.species[b.dataset.sp] = true;
    render();
  });
  $('filter-panel').addEventListener('change', (e) => {
    if (e.target.name === 'filter-state') trees.setFilter({ state: e.target.value });
    if (e.target.id === 'filter-badges') trees.setFilter({ badges: e.target.value });
    update();
  });
  $('filter-search').addEventListener('input', (e) => { trees.setFilter({ search: e.target.value.trim() }); update(); });
  $('filter-search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const hit = state.trees.find((tr) => tr._shown !== false);
    if (hit) trees.focusTree(hit.id);
  });
  const reset = () => {
    trees.setFilter({ species: {}, state: 'all', search: '' });
    $('filter-search').value = '';
    const all = document.querySelector('input[name="filter-state"][value="all"]');
    if (all) all.checked = true;
    render();
  };
  $('filter-reset').addEventListener('click', reset);
  $('filter-close').addEventListener('click', () => $('filter-panel').classList.add('hidden'));
  $('filter-chip').addEventListener('click', () => { $('filter-panel').classList.remove('hidden'); render(); });
  return {
    open() { $('filter-panel').classList.remove('hidden'); render(); },
    close() { $('filter-panel').classList.add('hidden'); },
    refresh: render,
    reset
  };
}
