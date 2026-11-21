// Novčanik, godišnji izvještaj, procjena uroda i vremenska prognoza (Open-Meteo).
import { t, fmtNum, getLang } from './i18n.js';
import { speciesIconHtml, speciesName } from './species.js';
import { state, setItem, uid, todayIso, fmtDate, yieldRange, LOG_TYPES, onChange, allTasks, taskIdFromKey } from './state.js';
import { loadVegetables } from './encyclopedia.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => Number(n || 0).toLocaleString(getLang() === 'en' ? 'en-GB' : 'hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const kg = (n) => fmtNum(n, n < 10 ? 1 : 0) + ' kg';
const open = (id) => $(id).classList.remove('hidden');
const close = (id) => $(id).classList.add('hidden');

// ---------------------------------------------------------------------------
// Novčanik (samo vlasnik)
// ---------------------------------------------------------------------------
const CATS = {
  trosak: ['sadnice', 'zastita', 'gnojivo', 'alat', 'voda', 'rad', 'ostalo'],
  prihod: ['voce', 'povrce', 'preradevine', 'poticaji', 'ostalo']
};
const CAT_ICON = { sadnice: '🌱', zastita: '🧴', gnojivo: '🌿', alat: '🛠️', voda: '💧', rad: '👷', ostalo: '📦', voce: '🍎', povrce: '🥕', preradevine: '🍯', poticaji: '🏛️' };
const catLabel = (kind, c) => (CAT_ICON[c] || '📦') + ' ' + t('wcat.' + kind + '.' + c);
let walletYear = new Date().getFullYear();

function walletEntries(year) {
  return Object.keys(state.items.wallet).map((id) => Object.assign({ id }, state.items.wallet[id]))
    .filter((e) => String(e.date).slice(0, 4) === String(year))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
export function walletTotals(year) {
  const r = { cost: 0, income: 0, pCost: 0, pIncome: 0 };
  walletEntries(year).forEach((e) => {
    if (e.planned) { if (e.kind === 'prihod') r.pIncome += e.amount; else r.pCost += e.amount; }
    else if (e.kind === 'prihod') r.income += e.amount; else r.cost += e.amount;
  });
  return r;
}

function fillCats() {
  const kind = (document.querySelector('input[name="w-kind"]:checked') || {}).value || 'trosak';
  $('w-cat').innerHTML = CATS[kind].map((c) => '<option value="' + c + '">' + esc(catLabel(kind, c)) + '</option>').join('');
}

function entryLi(e) {
  const sign = e.kind === 'prihod' ? '+' : '−';
  return '<li class="' + e.kind + (e.planned ? ' planned' : '') + '"><div class="wl-main"><b>' + esc(catLabel(e.kind, e.category)) + '</b> <small>' + fmtDate(e.date) + '</small>' + (e.note ? '<div class="muted">' + esc(e.note) + '</div>' : '') + '</div>' +
    '<span class="wl-amount ' + e.kind + '">' + sign + eur(e.amount) + '</span>' +
    (e.planned ? '<button type="button" class="t-act" data-act="w-real" data-id="' + e.id + '">✓ ' + t('wallet.realize') + '</button>' : '') +
    '<button type="button" class="x-mini" data-act="w-del" data-id="' + e.id + '">✕</button></li>';
}

function renderWallet() {
  if ($('wallet-modal').classList.contains('hidden')) return;
  $('w-year').textContent = String(walletYear);
  const list = walletEntries(walletYear);
  const real = list.filter((e) => !e.planned);
  const planned = list.filter((e) => e.planned);
  const s = walletTotals(walletYear);
  const bal = s.income - s.cost;
  const after = bal + s.pIncome - s.pCost;
  const card = (cls, label, v, signed) => '<div class="ws-card ' + cls + '"><span>' + label + '</span><b>' + (signed ? (v >= 0 ? '+' : '−') + eur(Math.abs(v)) : eur(v)) + '</b></div>';
  $('w-summary').innerHTML = card('cost', t('wallet.costs'), s.cost) + card('income', t('wallet.income'), s.income) + card(bal >= 0 ? 'profit' : 'loss', t(bal >= 0 ? 'wallet.profit' : 'wallet.loss'), bal, true) +
    card('planned cost', '🕒 ' + t('wallet.pCosts'), s.pCost) + card('planned income', '🕒 ' + t('wallet.pIncome'), s.pIncome) + card('planned ' + (after >= 0 ? 'profit' : 'loss'), t('wallet.after'), after, true);
  const by = {};
  real.forEach((e) => { const k = e.kind + '|' + e.category; by[k] = (by[k] || 0) + e.amount; });
  const keys = Object.keys(by).sort((a, b) => by[b] - by[a]);
  const max = keys.reduce((m, k) => Math.max(m, by[k]), 0);
  $('w-breakdown').innerHTML = keys.length ? '<h4>' + t('wallet.byCat') + '</h4><ul class="wallet-bars">' + keys.map((k) => {
    const [kind, c] = k.split('|');
    return '<li><span class="wb-label">' + esc(catLabel(kind, c)) + '</span><span class="wb-bar"><i class="' + kind + '" style="width:' + Math.max(3, Math.round(by[k] / max * 100)) + '%"></i></span><span class="wb-val ' + kind + '">' + (kind === 'prihod' ? '+' : '−') + eur(by[k]) + '</span></li>';
  }).join('') + '</ul>' : '';
  $('w-planned').innerHTML = planned.length ? '<h4>🕒 ' + t('wallet.planned') + '</h4><ul class="wallet-list">' + planned.map(entryLi).join('') + '</ul>' : '';
  $('w-list').innerHTML = real.length ? real.map(entryLi).join('') : '<li class="muted">' + t('wallet.empty', { y: walletYear }) + '</li>';
}

function initWallet(toast) {
  document.querySelectorAll('input[name="w-kind"]').forEach((r) => r.addEventListener('change', fillCats));
  $('w-prev').addEventListener('click', () => { walletYear--; renderWallet(); });
  $('w-next').addEventListener('click', () => { walletYear++; renderWallet(); });
  $('wallet-close').addEventListener('click', () => close('wallet-modal'));
  $('w-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = Math.round(Number(String($('w-amount').value).replace(',', '.')) * 100) / 100;
    if (!(amount > 0)) { toast(t('wallet.needAmount')); return; }
    const entry = { kind: (document.querySelector('input[name="w-kind"]:checked') || {}).value || 'trosak', category: $('w-cat').value, amount, date: $('w-date').value || todayIso(), note: $('w-note').value.trim(), planned: $('w-planned-cb').checked };
    $('w-amount').value = '';
    $('w-note').value = '';
    walletYear = Number(entry.date.slice(0, 4));
    await setItem('wallet', uid('w'), entry);
  });
  $('wallet-modal').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const cur = state.items.wallet[b.dataset.id];
    if (!cur) return;
    if (b.dataset.act === 'w-del') { if (confirm(t('wallet.deleteConfirm'))) await setItem('wallet', b.dataset.id, null); }
    if (b.dataset.act === 'w-real') await setItem('wallet', b.dataset.id, Object.assign({}, cur, { planned: false, date: todayIso() }));
  });
}

export function openWallet() {
  if (!state.isOwner) return;
  walletYear = new Date().getFullYear();
  $('w-date').value = todayIso();
  fillCats();
  open('wallet-modal');
  renderWallet();
}

// ---------------------------------------------------------------------------
// Procjena uroda
// ---------------------------------------------------------------------------
function renderYield() {
  const y = new Date().getFullYear();
  const by = {};
  state.trees.forEach((tr) => {
    const r = yieldRange(tr);
    const g = by[tr.species] = by[tr.species] || { n: 0, min: 0, max: 0, known: 0, last: 0, lastN: 0 };
    g.n++;
    if (r) { g.min += r.min; g.max += r.max; g.known++; }
    const hv = tr.data && tr.data.harvest;
    if (hv && hv[y - 1] && hv[y - 1].kg > 0) { g.last += Number(hv[y - 1].kg); g.lastN++; }
    if (hv && hv[y] && hv[y].kg > 0) { g.cur = (g.cur || 0) + Number(hv[y].kg); }
  });
  const keys = Object.keys(by).sort((a, b) => by[b].max - by[a].max);
  let tmin = 0;
  let tmax = 0;
  const rows = keys.map((s) => {
    const g = by[s];
    tmin += g.min; tmax += g.max;
    return '<tr><td>' + speciesIconHtml(s, 18) + ' ' + esc(speciesName(s)) + '</td><td class="num">' + g.n + '</td><td class="num">' + (g.known ? kg(g.min) + ' – ' + kg(g.max) : '–') + '</td><td class="num">' + (g.cur ? kg(g.cur) : '–') + '</td><td class="num">' + (g.lastN ? kg(g.last) : '–') + '</td></tr>';
  }).join('');
  $('yield-body').innerHTML = state.trees.length
    ? '<p class="muted">' + t('yield.intro') + '</p><div class="tbl-wrap"><table class="data-table"><thead><tr><th>' + t('tree.species') + '</th><th class="num">#</th><th class="num">' + t('yield.estimate') + '</th><th class="num">' + y + '</th><th class="num">' + (y - 1) + '</th></tr></thead><tbody>' + rows +
      '</tbody><tfoot><tr><th>' + t('yield.total') + '</th><th class="num">' + state.trees.length + '</th><th class="num">' + kg(tmin) + ' – ' + kg(tmax) + '</th><th></th><th></th></tr></tfoot></table></div><p class="muted small">' + t('yield.note') + '</p>'
    : '<p class="muted">' + t('filter.noTrees') + '</p>';
}
export function openYield() { renderYield(); open('yield-modal'); }

// ---------------------------------------------------------------------------
// Godišnji izvještaj
// ---------------------------------------------------------------------------
let reportYear = new Date().getFullYear();
let lastCsv = '';

async function buildReport(year) {
  const y = String(year);
  const veg = await loadVegetables().catch(() => null);
  const logs = [];
  const harvest = [];
  state.trees.forEach((tr) => {
    ((tr.data && tr.data.logs) || []).forEach((l) => { if (String(l.date).slice(0, 4) === y) logs.push({ tree: tr, log: l }); });
    const h = tr.data && tr.data.harvest && tr.data.harvest[y];
    if (h && h.kg > 0) harvest.push({ tree: tr, kg: Number(h.kg), note: h.note || '', est: yieldRange(tr) });
  });
  logs.sort((a, b) => String(a.log.date).localeCompare(String(b.log.date)));
  const tasks = { done: 0, skipped: 0, postponed: 0, list: [] };
  Object.keys(state.items.task).forEach((k) => {
    if (!k.startsWith(y + ':')) return;
    const st = state.items.task[k];
    const task = allTasks().find((z) => z.id === taskIdFromKey(k));
    if (st.status === 'done') tasks.done++; else if (st.status === 'skipped') tasks.skipped++; else if (st.status === 'postponed') tasks.postponed++;
    tasks.list.push({ st, task });
  });
  const plantings = [];
  Object.keys(state.items.bed).forEach((id) => {
    const b = state.items.bed[id];
    (b.sadnje || []).forEach((s) => { if (String(s.datum).slice(0, 4) === y) plantings.push({ bed: b, s, v: veg ? veg.vrste.find((x) => x.id === s.povrce) : null }); });
  });
  return { year, logs, harvest, tasks, plantings, wallet: state.isOwner ? walletTotals(year) : null };
}

function csvCell(v) { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

async function renderReport() {
  $('r-year').textContent = String(reportYear);
  const r = await buildReport(reportYear);
  const byType = {};
  r.logs.forEach((x) => { byType[x.log.type] = (byType[x.log.type] || 0) + 1; });
  const hvBy = {};
  r.harvest.forEach((x) => { const g = hvBy[x.tree.species] = hvBy[x.tree.species] || { kg: 0, n: 0, min: 0, max: 0 }; g.kg += x.kg; g.n++; if (x.est) { g.min += x.est.min; g.max += x.est.max; } });
  const totalKg = r.harvest.reduce((s, x) => s + x.kg, 0);
  let h = '<div class="spray-summary">' +
    '<div class="spray-big"><b>' + r.logs.length + '</b><span>' + t('report.works') + '</span></div>' +
    '<div class="spray-big"><b>' + kg(totalKg) + '</b><span>' + t('report.harvested', { n: r.harvest.length }) + '</span></div>' +
    '<div class="spray-big"><b>' + r.tasks.done + '</b><span>' + t('report.tasksDone', { s: r.tasks.skipped }) + '</span></div>' +
    (r.wallet ? '<div class="spray-big ' + (r.wallet.income - r.wallet.cost >= 0 ? 'ok' : '') + '"><b>' + eur(r.wallet.income - r.wallet.cost) + '</b><span>' + t('report.balance', { c: eur(r.wallet.cost), i: eur(r.wallet.income) }) + '</span></div>' : '') + '</div>';
  h += '<h3>🧺 ' + t('tab.berba') + '</h3>' + (Object.keys(hvBy).length
    ? '<div class="tbl-wrap"><table class="data-table"><thead><tr><th>' + t('tree.species') + '</th><th class="num">#</th><th class="num">kg</th><th class="num">' + t('yield.estimate') + '</th></tr></thead><tbody>' +
      Object.keys(hvBy).sort((a, b) => hvBy[b].kg - hvBy[a].kg).map((s) => { const g = hvBy[s]; return '<tr><td>' + speciesIconHtml(s, 18) + ' ' + esc(speciesName(s)) + '</td><td class="num">' + g.n + '</td><td class="num"><b>' + kg(g.kg) + '</b></td><td class="num">' + (g.max ? kg(g.min) + ' – ' + kg(g.max) : '–') + '</td></tr>'; }).join('') + '</tbody></table></div>'
    : '<p class="muted">' + t('harvest.empty') + '</p>');
  h += '<h3>📓 ' + t('tab.dnevnik') + '</h3>' + (r.logs.length
    ? '<p>' + Object.keys(byType).map((k) => '<span class="chip">' + (LOG_TYPES[k] || '📝') + ' ' + t('log.' + k) + ': <b>' + byType[k] + '</b></span>').join(' ') + '</p>'
    : '<p class="muted">' + t('log.empty') + '</p>');
  const problems = r.logs.filter((x) => x.log.type === 'bolest');
  if (problems.length) h += '<h3>🦠 ' + t('report.problems') + '</h3><ul class="pp-log">' + problems.map((x) => '<li><span class="li-icon">' + speciesIconHtml(x.tree.species, 18) + '</span><div><b>' + esc(x.tree.name) + '</b> <small>' + fmtDate(x.log.date) + '</small><div>' + esc(x.log.text) + '</div></div></li>').join('') + '</ul>';
  if (r.plantings.length) h += '<h3>🟫 ' + t('report.beds') + '</h3><ul class="pp-log">' + r.plantings.map((x) => '<li><span class="li-icon">' + (x.v ? x.v.emoji : '🌱') + '</span><div><b>' + esc(x.v ? x.v.naziv : x.s.povrce) + '</b> – ' + esc(x.bed.naziv) + ' <small>' + fmtDate(x.s.datum) + '</small></div></li>').join('') + '</ul>';
  $('report-body').innerHTML = h;

  const rows = [[t('report.csvDate'), t('report.csvKind'), t('tree.name'), t('tree.species'), t('report.csvText'), 'kg']];
  r.logs.forEach((x) => rows.push([x.log.date, t('log.' + x.log.type), x.tree.name, speciesName(x.tree.species), x.log.text, '']));
  r.harvest.forEach((x) => rows.push([y4(r.year), t('tab.berba'), x.tree.name, speciesName(x.tree.species), x.note, String(x.kg).replace('.', ',')]));
  r.plantings.forEach((x) => rows.push([x.s.datum, t('report.beds'), x.bed.naziv, x.v ? x.v.naziv : x.s.povrce, x.s.napomena || '', '']));
  lastCsv = rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
}
const y4 = (y) => String(y);

export function openReport() {
  reportYear = new Date().getFullYear();
  open('report-modal');
  renderReport();
}

function initReport() {
  $('r-prev').addEventListener('click', () => { reportYear--; renderReport(); });
  $('r-next').addEventListener('click', () => { reportYear++; renderReport(); });
  $('report-close').addEventListener('click', () => close('report-modal'));
  $('r-csv').addEventListener('click', () => {
    const blob = new Blob(['﻿' + lastCsv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (state.orchard ? state.orchard.name.replace(/[^\w\-čćžšđČĆŽŠĐ ]+/g, '').trim() || 'vocnjak' : 'vocnjak') + '-' + reportYear + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('r-print').addEventListener('click', () => window.print());
}

// ---------------------------------------------------------------------------
// Vremenska prognoza (Open-Meteo, po središtu voćnjaka)
// ---------------------------------------------------------------------------
const WMO = (c) => (c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 57 ? '🌦️' : c <= 67 ? '🌧️' : c <= 77 ? '🌨️' : c <= 82 ? '🌧️' : c <= 86 ? '🌨️' : '⛈️');
const heatPts = (tt) => (tt == null || tt <= 25 ? 0 : tt <= 30 ? (tt - 25) * 0.2 : Math.min(2, 1 + (tt - 30) * 0.1));
function rating(score) {
  if (score >= 7) return 'red';
  if (score >= 5) return 'orange';
  if (score >= 3) return 'yellow';
  return 'green';
}
function score(days) {
  const heat = days.reduce((s, d) => s + heatPts(d.max), 0);
  const rain = days.reduce((s, d) => s + (d.rain || 0), 0);
  const sc = Math.max(0, heat - Math.min(7, rain / 2));
  return { heat, rain, score: sc, rating: rating(sc) };
}

const weatherCache = {};
async function fetchWeather(lat, lng) {
  const key = lat.toFixed(3) + ',' + lng.toFixed(3);
  const c = weatherCache[key];
  if (c && Date.now() - c.at < 30 * 60 * 1000) return c.data;
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(4) + '&longitude=' + lng.toFixed(4) +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&past_days=7&forecast_days=7&timezone=auto';
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  const d = j.daily;
  const days = d.time.map((date, i) => ({ date, code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], rain: d.precipitation_sum[i] || 0, prob: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null, wind: d.wind_speed_10m_max ? d.wind_speed_10m_max[i] : null }));
  weatherCache[key] = { at: Date.now(), data: days };
  return days;
}

function dayLabel(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'hr-HR', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

async function renderWeather() {
  const o = state.orchard;
  const body = $('weather-body');
  if (!o || !o.center) { body.innerHTML = '<p class="muted">' + t('weather.noCenter') + '</p>'; return; }
  body.innerHTML = '<p class="muted">' + t('weather.loading') + '</p>';
  let days;
  try { days = await fetchWeather(Number(o.center[0]), Number(o.center[1])); } catch (e) { body.innerHTML = '<p class="form-error">⚠️ ' + t('weather.error', { msg: e.message }) + '</p>'; return; }
  const today = todayIso();
  const past = days.filter((d) => d.date < today);
  const future = days.filter((d) => d.date >= today);
  const ps = score(past);
  const fs = score(future);
  const alerts = [];
  // mraz je opasan za cvat i mlade sadnice u proljeće
  const frost = future.find((d) => d.min != null && d.min <= 0 && [3, 4, 5].includes(Number(d.date.slice(5, 7))));
  if (frost) alerts.push('🥶 ' + t('weather.frost', { day: dayLabel(frost.date), t: fmtNum(frost.min, 1) }));
  const hot = future.find((d) => d.max != null && d.max >= 32);
  if (hot) alerts.push('🔥 ' + t('weather.hot', { day: dayLabel(hot.date), t: fmtNum(hot.max, 0) }));
  const storm = future.find((d) => d.rain >= 20);
  if (storm) alerts.push('🌧️ ' + t('weather.heavyRain', { day: dayLabel(storm.date), mm: fmtNum(storm.rain, 0) }));
  const dry = future.slice(0, 5).every((d) => d.rain < 1);
  const sprayDay = future.find((d) => d.rain < 0.5 && (d.prob == null || d.prob < 30) && (d.wind == null || d.wind < 20));
  if (sprayDay) alerts.push('🧴 ' + t('weather.sprayDay', { day: dayLabel(sprayDay.date) }));
  let h = '<p class="muted">📍 ' + esc(o.name) + ' · Open-Meteo</p>';
  h += '<div class="w-score"><div class="w-score-card ' + ps.rating + '"><span>' + t('weather.past7') + '</span><b>' + fmtNum(ps.rain, 1) + ' mm</b><small>' + t('weather.need.' + ps.rating) + '</small></div>' +
    '<div class="w-score-card ' + fs.rating + '"><span>' + t('weather.next7') + '</span><b>' + fmtNum(fs.rain, 1) + ' mm</b><small>' + t('weather.need.' + fs.rating) + '</small></div></div>';
  if (dry && ps.rain < 5) alerts.unshift('💧 ' + t('weather.dry'));
  if (alerts.length) h += '<ul class="w-alerts">' + alerts.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ul>';
  h += '<div class="w-days">' + future.map((d) => '<div class="w-day' + (d.date === today ? ' today' : '') + '"><div class="w-date">' + esc(dayLabel(d.date)) + '</div><div class="w-ico">' + WMO(d.code) + '</div><div class="w-temp"><b>' + fmtNum(d.max, 0) + '°</b> / ' + fmtNum(d.min, 0) + '°</div><div class="w-rain">💧 ' + fmtNum(d.rain, 1) + ' mm' + (d.prob != null ? ' · ' + d.prob + '%' : '') + '</div></div>').join('') + '</div>';
  h += '<details class="w-past"><summary>' + t('weather.pastDays') + '</summary><div class="w-days">' + past.map((d) => '<div class="w-day past"><div class="w-date">' + esc(dayLabel(d.date)) + '</div><div class="w-ico">' + WMO(d.code) + '</div><div class="w-temp"><b>' + fmtNum(d.max, 0) + '°</b> / ' + fmtNum(d.min, 0) + '°</div><div class="w-rain">💧 ' + fmtNum(d.rain, 1) + ' mm</div></div>').join('') + '</div></details>';
  h += '<p class="muted small">' + t('weather.scoreNote') + '</p>';
  body.innerHTML = h;
}

export function openWeather() { open('weather-modal'); renderWeather(); }

// ---------------------------------------------------------------------------
export function initExtras(deps) {
  initWallet(deps.toast);
  initReport();
  $('yield-close').addEventListener('click', () => close('yield-modal'));
  $('weather-close').addEventListener('click', () => close('weather-modal'));
  ['wallet-modal', 'report-modal', 'yield-modal', 'weather-modal'].forEach((id) => $(id).addEventListener('click', (e) => { if (e.target.id === id) close(id); }));
  onChange((what) => {
    if (what === 'wallet') renderWallet();
    if (!$('yield-modal').classList.contains('hidden')) renderYield();
  });
}

export function rerenderExtras() {
  renderWallet();
  if (!$('yield-modal').classList.contains('hidden')) renderYield();
  if (!$('report-modal').classList.contains('hidden')) renderReport();
  if (!$('weather-modal').classList.contains('hidden')) renderWeather();
}

export function closeExtras() { ['wallet-modal', 'report-modal', 'yield-modal', 'weather-modal'].forEach(close); }
