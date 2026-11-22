// Vrste stabala: ikona (slika ili emoji), naziv na hr/en, potreba za vodom (0–4).
import { getLang } from './i18n.js';

export const SPECIES = [
  { id: 'borovnica', mark: '🫐', icon: 'icons/borovnica.png', hr: 'Borovnica', en: 'Blueberry', water: 3 },
  { id: 'breskva', mark: '🍑', icon: 'icons/peach.png', hr: 'Breskva', en: 'Peach', water: 4 },
  { id: 'drenak', mark: '🌳', icon: 'icons/drenak.png', hr: 'Drenak', en: 'Cornelian cherry', water: 2 },
  { id: 'dud2', mark: '🌳', emoji: '🍇', hr: 'Dud', en: 'Mulberry', water: 2 },
  { id: 'glog', mark: '🌳', icon: 'icons/glog.png', hr: 'Glog', en: 'Hawthorn', water: 1 },
  { id: 'jabuka', mark: '🍎', icon: 'icons/apple.png', hr: 'Jabuka', en: 'Apple', water: 3 },
  { id: 'kivi', mark: '🥝', emoji: '🥝', hr: 'Kivi', en: 'Kiwi', water: 4 },
  { id: 'kruska', mark: '🍐', icon: 'icons/pear.png', hr: 'Kruška', en: 'Pear', water: 3 },
  { id: 'kupina', mark: '🫐', icon: 'icons/blackberry.png', hr: 'Kupina', en: 'Blackberry', water: 3 },
  { id: 'orah', mark: '🌰', icon: 'icons/orah.png', hr: 'Orah', en: 'Walnut', water: 2 },
  { id: 'ribizl', mark: '🍓', icon: 'icons/ribiz.png', hr: 'Ribizl', en: 'Currant', water: 2 },
  { id: 'smokva', mark: '🫠', icon: 'icons/fig.png', hr: 'Smokva', en: 'Fig', water: 1 },
  { id: 'sljiva', mark: '🍇', icon: 'icons/plum.png', hr: 'Šljiva', en: 'Plum', water: 3 },
  { id: 'tresnja', mark: '🍒', icon: 'icons/cherry.png', hr: 'Trešnja', en: 'Sweet cherry', water: 3 },
  { id: 'vinova_loza', mark: '🍇', icon: 'icons/grapes.png', hr: 'Vinova loza', en: 'Grapevine', water: 2 },
  { id: 'visnja', mark: '🍒', icon: 'icons/visnja.png', hr: 'Višnja', en: 'Sour cherry', water: 3 },
  { id: 'ostalo', mark: '🌳', emoji: '🌳', hr: 'Ostalo (stablo, grm…)', en: 'Other (tree, shrub…)', water: 2 }
];

const BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

export function species(id) { return BY_ID[id] || BY_ID.ostalo; }

export function speciesName(id) {
  const s = species(id);
  return getLang() === 'en' ? s.en : s.hr;
}

// Sortirano po nazivu na trenutnom jeziku, "Ostalo" na kraju
export function sortedSpecies() {
  const lang = getLang();
  const list = SPECIES.filter((s) => s.id !== 'ostalo').sort((a, b) => (lang === 'en' ? a.en : a.hr).localeCompare(lang === 'en' ? b.en : b.hr, lang));
  return list.concat([BY_ID.ostalo]);
}

// Naziv s emojijem (za padajuće izbornike, kao u Horvatima)
export function speciesLabel(id) { return speciesName(id) + ' ' + (species(id).mark || ''); }

export function speciesIconHtml(id, size = 22) {
  const s = species(id);
  if (s.icon) return '<img src="' + s.icon + '" alt="" width="' + size + '" height="' + size + '" class="sp-img">';
  return '<span class="sp-emoji" style="font-size:' + Math.round(size * 0.85) + 'px">' + s.emoji + '</span>';
}

export function markerIcon(id, size = 30) {
  const s = species(id);
  if (s.icon) {
    return L.icon({ iconUrl: s.icon, iconSize: [size, size], iconAnchor: [size / 2, size], className: 'tree-icon' });
  }
  return L.divIcon({ className: 'tree-emoji', html: '<span>' + s.emoji + '</span>', iconSize: [size, size], iconAnchor: [size / 2, size] });
}

export function waterDrops(id) {
  const level = species(id).water;
  let s = '';
  for (let i = 0; i < 4; i++) s += i < level ? '💧' : '<span class="drop-off">💧</span>';
  return s;
}
