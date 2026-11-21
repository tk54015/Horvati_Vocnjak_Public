// Raspored radova (data/raspored.json): po mjesecima, samo za vrste koje su na karti.
// Kvačice (obavljeno / odgodi) dolaze u sljedećem koraku.
import { t, getLang } from './i18n.js';
import { speciesIconHtml, speciesName } from './species.js';

const MONTHS_HR = ['Siječanj', 'Veljača', 'Ožujak', 'Travanj', 'Svibanj', 'Lipanj', 'Srpanj', 'Kolovoz', 'Rujan', 'Listopad', 'Studeni', 'Prosinac'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CAT_ICON = { orezivanje: '✂️', 'zaštita': '🧴', gnojidba: '🌱', berba: '🧺', voda: '💧', higijena: '🧹', vrijeme: '🌡️', ostalo: '📝' };

let data = null;
let view = null;
let speciesFilter = '';
let countsFn = () => ({});
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function loadTasks() {
  if (!data) data = await fetch('data/raspored.json').then((r) => r.json());
  return data;
}

export function monthName(m) { return (getLang() === 'en' ? MONTHS_EN : MONTHS_HR)[m - 1]; }

// Zadaci za vrstu u danom mjesecu
export function tasksFor(speciesId, month) {
  if (!data) return [];
  return data.zadaci.filter((z) => (z.mjeseci || []).includes(month) && (z.vrste || []).includes(speciesId));
}

export function upcomingFor(speciesId, count = 4) {
  if (!data) return [];
  const now = new Date().getMonth() + 1;
  const out = [];
  for (let i = 1; i <= 12 && out.length < count; i++) {
    const m = ((now - 1 + i) % 12) + 1;
    const prev = m === 1 ? 12 : m - 1;
    const list = data.zadaci.filter((z) => (z.vrste || []).includes(speciesId) && z.mjeseci.includes(m) && !z.mjeseci.includes(prev)); // samo mjesec kad zadatak počinje
    if (list.length) out.push({ month: m, tasks: list });
  }
  return out;
}

export function catIcon(k) { return CAT_ICON[k] || '📝'; }

function render() {
  const counts = countsFn();
  const now = new Date();
  const isNow = view.y === now.getFullYear() && view.m === now.getMonth() + 1;
  $('tasks-month').textContent = monthName(view.m) + ' ' + view.y;
  $('tasks-today').classList.toggle('hidden', isNow);
  const present = Object.keys(counts);
  const sel = $('tasks-species');
  const opts = present.filter((s) => data.zadaci.some((z) => (z.vrste || []).includes(s)));
  sel.innerHTML = '<option value="">' + t('tasks.allSpecies') + '</option>' + opts.map((s) => '<option value="' + s + '"' + (s === speciesFilter ? ' selected' : '') + '>' + esc(speciesName(s)) + ' (' + counts[s] + ')</option>').join('');

  const rows = data.zadaci.filter((z) => (z.mjeseci || []).includes(view.m))
    .map((z) => ({ z, species: (z.vrste || []).filter((v) => counts[v]) }))
    .filter((r) => (!r.z.vrste.length || r.species.length) && (!speciesFilter || r.z.vrste.includes(speciesFilter)));

  let h = getLang() === 'en' ? '<p class="enc-lang-note">' + t('enc.langNote') + '</p>' : '';
  if (!present.length) h += '<p class="muted">' + t('tasks.noTrees') + '</p>';
  if (!rows.length) {
    h += '<p class="muted">' + t('tasks.none') + '</p>';
  } else {
    const prios = data.meta.prioriteti;
    [1, 2, 3].forEach((p) => {
      const g = rows.filter((r) => r.z.prioritet === p);
      if (!g.length) return;
      h += '<section class="tg prio-' + p + '"><h3>' + prios[p].oznaka + ' ' + (getLang() === 'en' ? t('tasks.prio' + p) : esc(prios[p].naziv)) + '</h3>';
      g.forEach((r) => {
        const z = r.z;
        const last = z.mjeseci.length > 1 && z.mjeseci[z.mjeseci.length - 1] === view.m;
        h += '<div class="task"><div class="task-title">' + catIcon(z.kategorija) + ' ' + esc(z.naslov) +
          (last ? ' <span class="badge last">⏳ ' + t('tasks.last') + '</span>' : '') + (z.poPotrebi ? ' <span class="badge cond">🔎 ' + t('tasks.ifNeeded') + '</span>' : '') + '</div>' +
          (z.opis ? '<div class="task-desc">' + esc(z.opis) + '</div>' : '') +
          (r.species.length ? '<div class="chips">' + r.species.map((v) => '<span class="chip">' + speciesIconHtml(v, 16) + esc(speciesName(v)) + ' <b>' + counts[v] + '</b></span>').join('') + '</div>' : '') + '</div>';
      });
      h += '</section>';
    });
  }
  $('tasks-list').innerHTML = h;
}

export async function openTasks(speciesId) {
  await loadTasks();
  const now = new Date();
  view = { y: now.getFullYear(), m: now.getMonth() + 1 };
  speciesFilter = speciesId || '';
  $('tasks-modal').classList.remove('hidden');
  render();
}

export function initTasks(getCounts) {
  countsFn = getCounts;
  const shift = (d) => { view.m += d; if (view.m < 1) { view.m = 12; view.y--; } if (view.m > 12) { view.m = 1; view.y++; } render(); };
  $('tasks-prev').addEventListener('click', () => shift(-1));
  $('tasks-next').addEventListener('click', () => shift(1));
  $('tasks-today').addEventListener('click', () => { const n = new Date(); view = { y: n.getFullYear(), m: n.getMonth() + 1 }; render(); });
  $('tasks-species').addEventListener('change', (e) => { speciesFilter = e.target.value; render(); });
  $('tasks-close').addEventListener('click', () => $('tasks-modal').classList.add('hidden'));
  $('tasks-modal').addEventListener('click', (e) => { if (e.target.id === 'tasks-modal') $('tasks-modal').classList.add('hidden'); });
}

export function rerenderTasks() { if (view && !$('tasks-modal').classList.contains('hidden')) render(); }
