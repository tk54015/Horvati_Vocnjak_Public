// Raspored radova: mjesec po mjesec, kvačice, odgoda, preskakanje, vlastiti zadaci, napredak po stablima.
import { t, getLang } from './i18n.js';
import { speciesIconHtml, speciesName, speciesLabel, sortedSpecies } from './species.js';
import { state, counts, monthRows, setItem, speciesProgress, uid, onChange } from './state.js';

const MONTHS_HR = ['Siječanj', 'Veljača', 'Ožujak', 'Travanj', 'Svibanj', 'Lipanj', 'Srpanj', 'Kolovoz', 'Rujan', 'Listopad', 'Studeni', 'Prosinac'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CAT_ICON = { orezivanje: '✂️', 'zaštita': '🧴', gnojidba: '🌱', berba: '🧺', voda: '💧', higijena: '🧹', vrijeme: '🌡️', ostalo: '📝', vlastito: '📌' };

let view = null;
let speciesFilter = '';
let postponing = null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function loadTasks() {
  if (!state.raspored) state.raspored = await fetch('data/raspored.json').then((r) => r.json());
  return state.raspored;
}

export function monthName(m) { return (getLang() === 'en' ? MONTHS_EN : MONTHS_HR)[m - 1]; }
export function catIcon(k) { return CAT_ICON[k] || '📝'; }

function monthOptions(fromY, fromM, n) {
  let h = '';
  for (let i = 1; i <= n; i++) {
    let m = fromM + i;
    let y = fromY;
    while (m > 12) { m -= 12; y++; }
    h += '<option value="' + y + '-' + m + '">' + monthName(m) + ' ' + y + '</option>';
  }
  return h;
}

function rowHtml(r, editable) {
  const z = r.task;
  let badges = '';
  if (z.custom) badges += ' <span class="badge custom">📌 ' + t('tasks.custom') + '</span>';
  if (r.movedHere) badges += ' <span class="badge moved">↪ ' + t('tasks.moved') + (r.state && r.state.from ? ' (' + monthName(r.state.from.month).toLowerCase() + ')' : '') + '</span>';
  if (r.isLast && !r.done) badges += ' <span class="badge last">⏳ ' + t('tasks.last') + '</span>';
  if (r.isFirst && !r.done) badges += ' <span class="badge first">' + t('tasks.starts') + '</span>';
  if (z.poPotrebi && !r.done) badges += ' <span class="badge cond">🔎 ' + t('tasks.ifNeeded') + '</span>';
  const c = counts();
  const chips = r.species.map((v) => '<span class="chip">' + speciesIconHtml(v, 16) + esc(speciesName(v)) + ' <b>' + c[v] + '</b></span>').join('');
  const now = new Date();
  let progress = '';
  if (r.species.length && view.y === now.getFullYear() && view.m === now.getMonth() + 1) {
    const p = speciesProgress(r);
    if (p.total) progress = '<div class="progress">🌳 ' + t('tasks.progress', { done: p.handled, total: p.total }) + (p.skipped ? ' · ' + p.skipped + ' ' + t('tasks.skippedN') : '') + (p.postponed ? ' · ' + p.postponed + ' ' + t('tasks.postponedN') : '') + '</div>';
  }
  let actions = '';
  if (editable && !r.done) {
    actions = postponing === r.key
      ? '<div class="t-actions"><select class="pp-month" data-key="' + esc(r.key) + '">' + monthOptions(view.y, view.m, 6) + '</select><button type="button" class="t-act primary" data-act="pp-ok" data-key="' + esc(r.key) + '">' + t('tasks.postpone') + '</button><button type="button" class="t-act" data-act="pp-cancel">' + t('common.cancel') + '</button></div>'
      : '<div class="t-actions"><button type="button" class="t-act" data-act="postpone" data-key="' + esc(r.key) + '">⏭️ ' + t('tasks.postpone') + '</button><button type="button" class="t-act" data-act="skip" data-key="' + esc(r.key) + '">🚫 ' + t('tasks.skip') + '</button></div>';
  }
  if (editable && z.custom) actions += '<div class="t-actions"><button type="button" class="t-act" data-act="cdel" data-id="' + esc(z.id) + '">🗑️ ' + t('tasks.deleteCustom') + '</button></div>';
  return '<div class="task' + (r.done ? ' done' : '') + '"><label class="t-check"><input type="checkbox" data-key="' + esc(r.key) + '"' + (r.done ? ' checked' : '') + (editable ? '' : ' disabled') + '></label>' +
    '<div class="t-main"><div class="task-title">' + catIcon(z.kategorija) + ' ' + esc(z.naslov) + badges + '</div>' +
    (z.opis ? '<div class="task-desc">' + esc(z.opis) + '</div>' : '') + (chips ? '<div class="chips">' + chips + '</div>' : '') + progress + actions + '</div></div>';
}

function render() {
  if (!view || $('tasks-modal').classList.contains('hidden')) return;
  const c = counts();
  const now = new Date();
  const isNow = view.y === now.getFullYear() && view.m === now.getMonth() + 1;
  const editable = state.canEdit;
  $('tasks-month').textContent = monthName(view.m) + ' ' + view.y;
  $('tasks-today').classList.toggle('hidden', isNow);
  $('tasks-add').classList.toggle('hidden', !editable);
  const opts = Object.keys(c).filter((s) => state.raspored.zadaci.some((z) => (z.vrste || []).includes(s)));
  $('tasks-species').innerHTML = '<option value="">' + t('tasks.allSpecies') + '</option>' + opts.map((s) => '<option value="' + s + '"' + (s === speciesFilter ? ' selected' : '') + '>' + esc(speciesLabel(s)) + ' (' + c[s] + ')</option>').join('');

  const keep = (r) => !speciesFilter || (r.task.vrste || []).includes(speciesFilter);
  const rows = monthRows(view.y, view.m);
  const active = rows.active.filter(keep);
  const away = rows.away.filter(keep);
  const done = active.filter((r) => r.done).length;
  $('tasks-progress').innerHTML = active.length ? '<div class="bar"><span style="width:' + Math.round(done / active.length * 100) + '%"></span></div><span>' + t('tasks.doneOf', { done, total: active.length }) + '</span>' : '';

  let h = getLang() === 'en' ? '<p class="enc-lang-note">' + t('enc.langNote') + '</p>' : '';
  if (!Object.keys(c).length) h += '<p class="muted">' + t('tasks.noTrees') + '</p>';
  if (!active.length && !away.length) h += '<p class="muted">' + t('tasks.none') + '</p>';
  const prios = state.raspored.meta.prioriteti;
  [1, 2, 3].forEach((p) => {
    const g = active.filter((r) => r.task.prioritet === p).sort((a, b) => (a.done - b.done) || (b.isLast - a.isLast));
    if (!g.length) return;
    h += '<section class="tg prio-' + p + '"><h3>' + prios[p].oznaka + ' ' + (getLang() === 'en' ? t('tasks.prio' + p) : esc(prios[p].naziv)) + '</h3>' + g.map((r) => rowHtml(r, editable)).join('') + '</section>';
  });
  if (away.length) {
    h += '<section class="tg away"><h3>⏭️ ' + t('tasks.away') + '</h3>' + away.map((r) => {
      const s = r.state;
      const what = s.status === 'skipped' ? '🚫 ' + t('tasks.skipped') : (s.status === 'done' ? '✅ ' + t('tasks.doneIn') : '⏭️ ' + t('tasks.postponedTo')) + ' ' + monthName(s.to.month) + ' ' + s.to.year;
      return '<div class="task away"><div class="t-main"><div class="task-title">' + catIcon(r.task.kategorija) + ' ' + esc(r.task.naslov) + '</div><div class="task-desc">' + what + '</div>' +
        (editable && s.status !== 'done' ? '<div class="t-actions"><button type="button" class="t-act" data-act="undo" data-key="' + esc(r.key) + '">↩ ' + t('tasks.undo') + '</button></div>' : '') + '</div></div>';
    }).join('') + '</section>';
  }
  $('tasks-list').innerHTML = h;
}

function customForm() {
  return '<form id="ct-form" class="ct-form"><b>📌 ' + t('tasks.newCustom') + '</b>' +
    '<input id="ct-title" type="text" maxlength="100" placeholder="' + esc(t('tasks.customPh')) + '">' +
    '<input id="ct-desc" type="text" maxlength="300" placeholder="' + esc(t('tasks.customDesc')) + '">' +
    '<div class="ct-row"><label>' + t('tasks.month') + '<select id="ct-month">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => '<option value="' + m + '"' + (m === view.m ? ' selected' : '') + '>' + monthName(m) + '</option>').join('') + '</select></label>' +
    '<label>' + t('tasks.year') + '<select id="ct-year"><option value="' + view.y + '">' + t('tasks.onlyYear', { y: view.y }) + '</option><option value="' + (view.y + 1) + '">' + t('tasks.onlyYear', { y: view.y + 1 }) + '</option><option value="0">' + t('tasks.everyYear') + '</option></select></label></div>' +
    '<div class="ct-row"><label>' + t('tasks.priority') + '<select id="ct-prio"><option value="1">🔴 ' + t('tasks.prio1') + '</option><option value="2" selected>🟠 ' + t('tasks.prio2') + '</option><option value="3">🟢 ' + t('tasks.prio3') + '</option></select></label>' +
    '<label>' + t('tasks.species') + '<select id="ct-species"><option value="">' + t('tasks.noSpecies') + '</option>' + sortedSpecies().map((s) => '<option value="' + s.id + '">' + esc(speciesLabel(s.id)) + '</option>').join('') + '</select></label></div>' +
    '<div id="ct-error" class="form-error hidden"></div><div class="card-foot"><button type="button" id="ct-cancel" class="btn-secondary">' + t('common.cancel') + '</button><button type="submit" class="btn-primary">' + t('tasks.addCustom') + '</button></div></form>';
}

export async function openTasks(speciesId) {
  await loadTasks();
  const now = new Date();
  view = { y: now.getFullYear(), m: now.getMonth() + 1 };
  speciesFilter = speciesId || '';
  postponing = null;
  $('tasks-modal').classList.remove('hidden');
  render();
}

export function initTasks() {
  const shift = (d) => { view.m += d; if (view.m < 1) { view.m = 12; view.y--; } if (view.m > 12) { view.m = 1; view.y++; } postponing = null; render(); };
  $('tasks-prev').addEventListener('click', () => shift(-1));
  $('tasks-next').addEventListener('click', () => shift(1));
  $('tasks-today').addEventListener('click', () => { const n = new Date(); view = { y: n.getFullYear(), m: n.getMonth() + 1 }; render(); });
  $('tasks-species').addEventListener('change', (e) => { speciesFilter = e.target.value; render(); });
  $('tasks-close').addEventListener('click', () => $('tasks-modal').classList.add('hidden'));
  $('tasks-modal').addEventListener('click', (e) => { if (e.target.id === 'tasks-modal') $('tasks-modal').classList.add('hidden'); });
  $('tasks-add').addEventListener('click', () => {
    if (!state.canEdit || $('ct-form')) return;
    $('tasks-list').insertAdjacentHTML('afterbegin', customForm());
    const syncYear = () => {
      const y = $('ct-year');
      if (y.value === '0') return;
      const n = new Date();
      const m = Number($('ct-month').value);
      y.value = String(view.y === n.getFullYear() && m < n.getMonth() + 1 ? view.y + 1 : view.y);
    };
    $('ct-month').addEventListener('change', syncYear);
    syncYear();
    $('ct-title').focus();
  });
  $('tasks-list').addEventListener('submit', async (e) => {
    if (e.target.id !== 'ct-form') return;
    e.preventDefault();
    const title = $('ct-title').value.trim();
    if (!title) { $('ct-error').textContent = t('tasks.needTitle'); $('ct-error').classList.remove('hidden'); return; }
    const month = Number($('ct-month').value);
    const year = Number($('ct-year').value);
    const sp = $('ct-species').value;
    const task = { naslov: title, opis: $('ct-desc').value.trim(), mjeseci: [month], prioritet: Number($('ct-prio').value), kategorija: 'vlastito', vrste: sp ? [sp] : [] };
    if (year) task.godina = year;
    view = { y: year || view.y, m: month };
    await setItem('ctask', uid('c'), task);
  });
  $('tasks-list').addEventListener('click', async (e) => {
    if (e.target.id === 'ct-cancel') { $('ct-form').remove(); return; }
    const b = e.target.closest('[data-act]');
    if (!b || !state.canEdit) return;
    const act = b.dataset.act;
    const key = b.dataset.key;
    const prev = key ? state.items.task[key] : null;
    if (act === 'postpone') { postponing = key; render(); }
    else if (act === 'pp-cancel') { postponing = null; render(); }
    else if (act === 'pp-ok') {
      const [y, m] = $('tasks-list').querySelector('.pp-month[data-key="' + key + '"]').value.split('-').map(Number);
      postponing = null;
      await setItem('task', key, { status: 'postponed', to: { year: y, month: m }, from: prev && prev.from ? prev.from : { year: view.y, month: view.m } });
    } else if (act === 'skip') { postponing = null; await setItem('task', key, { status: 'skipped' }); }
    else if (act === 'undo') await setItem('task', key, null);
    else if (act === 'cdel') {
      if (!confirm(t('tasks.deleteCustomConfirm'))) return;
      await setItem('ctask', b.dataset.id, null);
    }
  });
  $('tasks-list').addEventListener('change', async (e) => {
    const box = e.target;
    if (box.type !== 'checkbox' || !state.canEdit) return;
    const key = box.dataset.key;
    const prev = state.items.task[key];
    if (box.checked) await setItem('task', key, prev && prev.to ? { status: 'done', to: prev.to, from: prev.from } : { status: 'done' });
    else await setItem('task', key, prev && prev.to ? { status: 'postponed', to: prev.to, from: prev.from } : null);
  });
  onChange(() => render());
}

export function rerenderTasks() { render(); }
