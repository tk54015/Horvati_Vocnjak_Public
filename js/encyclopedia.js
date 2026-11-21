// Enciklopedija (voće + povrće s kalendarom). Sadržaj iz data/*.json (za sada na hrvatskom).
import { t, getLang } from './i18n.js';
import { speciesIconHtml, speciesName, waterDrops } from './species.js';

const MONTHS_HR = ['Sij', 'Vel', 'Ožu', 'Tra', 'Svi', 'Lip', 'Srp', 'Kol', 'Ruj', 'Lis', 'Stu', 'Pro'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const VEG_COLORS = { unutra: '#cfe6fb', sadnja: '#bfe8b8', berba: '#fff0a6' };

let fruit = null;
let veg = null;
let mode = 'voce';
let selFruit = null;
let selVeg = 'kalendar';
let countsFn = () => ({});

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const months = () => (getLang() === 'en' ? MONTHS_EN : MONTHS_HR);

export async function loadEncyclopedia() {
  if (!fruit) fruit = await fetch('data/enciklopedija.json').then((r) => r.json());
  return fruit;
}
export async function loadVegetables() {
  if (!veg) veg = await fetch('data/povrce.json').then((r) => r.json());
  return veg;
}
export function fruitEntry(id) { return fruit ? fruit.vrste.find((v) => v.id === id) : null; }

function byName(list) { return list.slice().sort((a, b) => a.naziv.localeCompare(b.naziv, 'hr')); }
function fruitList() {
  const list = byName(fruit.vrste.filter((v) => v.id !== 'ostalo'));
  return list.concat(fruit.vrste.filter((v) => v.id === 'ostalo'));
}

function problems(items, icon) {
  if (!items || !items.length) return '<p class="muted">–</p>';
  return items.map((p) => '<div class="enc-problem"><div class="enc-problem-name">' + icon + ' ' + esc(p.naziv) + '</div>' +
    '<div class="enc-row"><span class="tag see">' + t('enc.recognize') + '</span><p>' + esc(p.prepoznaj || p.opis || '') + '</p></div>' +
    (p.rjesenje ? '<div class="enc-row"><span class="tag fix">' + t('enc.fix') + '</span><p>' + esc(p.rjesenje) + '</p></div>' : '') + '</div>').join('');
}

function renderList() {
  const el = $('enc-list');
  if (mode === 'voce') {
    const counts = countsFn();
    el.innerHTML = fruitList().map((v) => '<button type="button" class="enc-item' + (v.id === selFruit ? ' active' : '') + '" data-id="' + v.id + '">' +
      speciesIconHtml(v.id, 22) + '<span>' + esc(v.id === 'ostalo' ? speciesName('ostalo') : (getLang() === 'en' ? speciesName(v.id) : v.naziv)) + '</span>' +
      (counts[v.id] ? '<b class="cnt">' + counts[v.id] + '</b>' : '') + '</button>').join('');
  } else {
    const items = [{ id: 'kalendar', naziv: t('enc.calendar'), emoji: '📅' }, { id: 'savjeti', naziv: t('enc.tips'), emoji: '📋' }].concat(byName(veg.vrste));
    el.innerHTML = items.map((v) => '<button type="button" class="enc-item' + (v.id === selVeg ? ' active' : '') + '" data-id="' + v.id + '">' +
      '<span class="sp-emoji">' + v.emoji + '</span><span>' + esc(v.naziv) + '</span></button>').join('');
  }
}

function vegCell(v, m) {
  const kinds = ['unutra', 'sadnja', 'berba'].filter((k) => (v[k] || []).includes(m));
  let style = '';
  if (kinds.length === 1) style = 'background:' + VEG_COLORS[kinds[0]];
  else if (kinds.length > 1) {
    const step = 100 / kinds.length;
    style = 'background:linear-gradient(135deg,' + kinds.map((k, i) => VEG_COLORS[k] + ' ' + (i * step) + '%,' + VEG_COLORS[k] + ' ' + ((i + 1) * step) + '%').join(',') + ')';
  }
  const now = m === new Date().getMonth() + 1;
  return '<td class="veg-cell' + (now ? ' now' : '') + '" style="' + style + '"></td>';
}

function vegHead(first) {
  const now = new Date().getMonth() + 1;
  return '<thead><tr>' + (first !== null ? '<th class="veg-name">' + first + '</th>' : '') + months().map((m, i) => '<th' + (i + 1 === now ? ' class="now"' : '') + '>' + m + '</th>').join('') + '</tr></thead>';
}

function legend() {
  return '<div class="veg-legend"><span><i style="background:' + VEG_COLORS.unutra + '"></i>' + t('enc.legIndoor') + '</span>' +
    '<span><i style="background:' + VEG_COLORS.sadnja + '"></i>' + t('enc.legPlant') + '</span>' +
    '<span><i style="background:' + VEG_COLORS.berba + '"></i>' + t('enc.legHarvest') + '</span></div>';
}

function renderArticle() {
  const el = $('enc-article');
  let h = getLang() === 'en' ? '<p class="enc-lang-note">' + t('enc.langNote') + '</p>' : '';
  if (mode === 'voce') {
    const v = fruit.vrste.find((x) => x.id === selFruit);
    if (!v) { el.innerHTML = ''; return; }
    const cnt = countsFn()[v.id] || 0;
    h += '<header class="enc-head">' + speciesIconHtml(v.id, 44) + '<div><h2>' + esc(v.naziv) + '</h2>' + (v.latinski ? '<i class="muted">' + esc(v.latinski) + '</i>' : '') +
      '<div class="muted">' + t('enc.onMap') + ': <b>' + cnt + '</b></div></div></header><p>' + esc(v.opis) + '</p>';
    h += '<section><h3>💧 ' + t('enc.water') + '</h3><p>' + waterDrops(v.id) + '</p><p>' + esc(v.voda) + '</p></section>';
    if (v.orezivanje) h += '<section><h3>✂️ ' + t('enc.pruning') + '</h3><p><b>' + t('enc.when') + ':</b> ' + esc(v.orezivanje.kada) + '</p><p><b>' + t('enc.how') + ':</b> ' + esc(v.orezivanje.kako) + '</p></section>';
    if (v.gnojidba) h += '<section><h3>🌱 ' + t('enc.feeding') + '</h3><p>' + esc(v.gnojidba) + '</p></section>';
    if ((v.bolesti || []).length) h += '<section><h3>🦠 ' + t('enc.diseases') + '</h3>' + problems(v.bolesti, '🦠') + '</section>';
    if ((v.stetnici || []).length) h += '<section><h3>🐛 ' + t('enc.pests') + '</h3>' + problems(v.stetnici, '🐛') + '</section>';
    if ((v.zastita || []).length) h += '<section><h3>🗓️ ' + t('enc.protection') + '</h3><table class="enc-table"><tbody>' + v.zastita.map((z) => '<tr><th>' + esc(z.kada) + '</th><td>' + esc(z.sto) + '</td></tr>').join('') + '</tbody></table></section>';
    if (v.berba) h += '<section><h3>🧺 ' + t('enc.harvest') + '</h3><p>' + esc(v.berba) + '</p></section>';
    if (fruit.meta && fruit.meta.napomena) h += '<p class="enc-note">ℹ️ ' + esc(fruit.meta.napomena) + '</p>';
  } else if (selVeg === 'kalendar') {
    h += '<header class="enc-head"><span class="sp-emoji" style="font-size:36px">📅</span><div><h2>' + t('enc.calendarTitle') + '</h2></div></header>' + legend();
    h += '<div class="veg-wrap"><table class="veg-table">' + vegHead(t('enc.vegetable')) + '<tbody>' + byName(veg.vrste).map((v) => '<tr><th class="veg-name"><button type="button" class="veg-link" data-id="' + v.id + '">' + v.emoji + ' ' + esc(v.naziv) + '</button></th>' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => vegCell(v, m)).join('') + '</tr>').join('') + '</tbody></table></div>';
  } else if (selVeg === 'savjeti') {
    h += '<header class="enc-head"><span class="sp-emoji" style="font-size:36px">📋</span><div><h2>' + t('enc.tips') + '</h2></div></header>';
    (veg.meta.savjeti || []).forEach((s) => { h += '<section><h3>' + esc(s.naslov) + '</h3><p>' + esc(s.tekst) + '</p></section>'; });
  } else {
    const v = veg.vrste.find((x) => x.id === selVeg);
    if (!v) { el.innerHTML = ''; return; }
    h += '<header class="enc-head"><span class="sp-emoji" style="font-size:40px">' + v.emoji + '</span><div><h2>' + esc(v.naziv) + '</h2>' + (v.latinski ? '<i class="muted">' + esc(v.latinski) + '</i>' : '') + '</div></header>';
    h += '<div class="veg-wrap"><table class="veg-table one">' + vegHead(null) + '<tbody><tr>' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => vegCell(v, m)).join('') + '</tr></tbody></table></div>' + legend();
    h += '<p>' + esc(v.opis) + '</p>';
    [['🌱', 'enc.sowing', v.sjetva], ['☀️', 'enc.position', v.polozaj], ['💧', 'enc.water', v.voda], ['🌿', 'enc.care', v.njega], ['🐛', 'enc.problems', v.problemi], ['🧺', 'enc.harvest', v.berbaOpis]]
      .filter((x) => x[2]).forEach((x) => { h += '<section><h3>' + x[0] + ' ' + t(x[1]) + '</h3><p>' + esc(x[2]) + '</p></section>'; });
    if (v.kombinacije || v.pazi) h += '<section><h3>🤝 ' + t('enc.bed') + '</h3>' + (v.kombinacije ? '<p><b>' + t('enc.combos') + ':</b> ' + esc(v.kombinacije) + '</p>' : '') + (v.pazi ? '<p><b>' + t('enc.watch') + ':</b> ' + esc(v.pazi) + '</p>' : '') + '</section>';
  }
  el.innerHTML = h;
  el.scrollTop = 0;
}

function render() {
  document.querySelectorAll('.enc-tab').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  renderList();
  renderArticle();
}

export async function openEncyclopedia(speciesId) {
  $('enc-modal').classList.remove('hidden');
  await Promise.all([loadEncyclopedia(), loadVegetables()]);
  if (speciesId) { mode = 'voce'; selFruit = fruit.vrste.some((v) => v.id === speciesId) ? speciesId : 'ostalo'; }
  if (!selFruit) selFruit = fruitList()[0].id;
  render();
}

export function initEncyclopedia(getCounts) {
  countsFn = getCounts;
  $('enc-close').addEventListener('click', () => $('enc-modal').classList.add('hidden'));
  $('enc-modal').addEventListener('click', (e) => { if (e.target.id === 'enc-modal') $('enc-modal').classList.add('hidden'); });
  document.querySelectorAll('.enc-tab').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; render(); }));
  $('enc-list').addEventListener('click', (e) => {
    const b = e.target.closest('.enc-item');
    if (!b) return;
    if (mode === 'voce') selFruit = b.dataset.id; else selVeg = b.dataset.id;
    render();
  });
  $('enc-article').addEventListener('click', (e) => {
    const b = e.target.closest('.veg-link');
    if (b) { selVeg = b.dataset.id; render(); }
  });
}

export function rerenderEncyclopedia() {
  if (!$('enc-modal').classList.contains('hidden') && fruit) render();
}
