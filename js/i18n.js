// Prijevodi (hrvatski / engleski). Sav tekst sučelja ide preko t('ključ').
// U HTML-u: data-i18n="ključ" (tekst), data-i18n-ph="ključ" (placeholder), data-i18n-title="ključ" (title).

const STRINGS = {
  hr: {
    'app.name': 'Horvati voćnjak',
    'app.tagline': 'Karta voćnjaka, stabla, raspored radova i bilješke – na jednom mjestu.',
    'lang.switch': 'English',
    'welcome.title': 'Dobrodošli! 🌳',
    'welcome.text': 'Napravi svoj prvi voćnjak: upiši naziv i mjesto, a zatim na satelitskoj karti označi zemljište.',
    'welcome.create': '➕ Novi voćnjak',
    'new.title': 'Novi voćnjak',
    'new.name': 'Naziv voćnjaka',
    'new.namePh': 'npr. Vikendica, Djedov voćnjak',
    'new.address': 'Mjesto ili adresa',
    'new.addressPh': 'npr. Horvati, Zagreb',
    'new.addressHint': 'Karta će se pomaknuti na to mjesto. Može i prazno – mjesto možeš potražiti kasnije.',
    'new.create': 'Napravi',
    'new.nameRequired': 'Upiši naziv voćnjaka.',
    'common.cancel': 'Odustani',
    'common.close': 'Zatvori',
    'common.ok': 'U redu',
    'common.back': 'Natrag',
    'search.ph': 'Traži mjesto ili adresu…',
    'search.btn': 'Traži',
    'search.notFound': 'Mjesto nije pronađeno. Pokušaj s drugim nazivom.',
    'search.error': 'Pretraga trenutno ne radi. Pomakni kartu ručno.',
    'layers.satellite': 'Satelit',
    'layers.map': 'Karta',
    'howto.title': 'Kako označiti zemljište?',
    'howto.intro': 'Na karti je već postavljen pravokutnik od 20 × 30 m. Odaberi način koji ti je najlakši – uvijek se možeš kasnije vratiti i promijeniti granicu.',
    'howto.rect.title': '⬛ Pravokutnik',
    'howto.rect.text': 'Najjednostavnije. Upiši širinu i dužinu ili povuci kutove, okreni ⟳ i premjesti ✥ da odgovara zemljištu.',
    'howto.draw.title': '✏️ Iscrtaj na karti',
    'howto.draw.text': 'Klikaj redom kutove zemljišta na satelitskoj snimci. Za zemljišta koja nisu pravokutna.',
    'howto.kml.title': '📂 Uvezi KML',
    'howto.kml.text': 'Ako već imaš granicu iz Google Eartha ili Google My Maps (datoteka .kml).',
    'howto.choose': 'Odaberi',
    'edit.title': 'Granica zemljišta',
    'edit.area': 'Površina',
    'edit.method': 'Način',
    'edit.width': 'Širina (m)',
    'edit.length': 'Dužina (m)',
    'edit.rotation': 'Zakrenuto',
    'edit.rectHelp': 'Povuci bijele kutove za veličinu, plavu ručicu ⟳ za okretanje, a zelenu ✥ za premještanje.',
    'edit.drawHelp': 'Klikaj kutove zemljišta redom. Točke možeš naknadno povući. Potrebne su barem 3 točke.',
    'edit.drawUndo': '↶ Ukloni zadnju točku',
    'edit.drawClear': 'Počni ispočetka',
    'edit.points': 'Točaka',
    'edit.kmlHelp': 'Odaberi .kml datoteku. Uzima se prvi poligon iz datoteke; nakon uvoza točke možeš povući.',
    'edit.kmlChoose': 'Odaberi KML datoteku',
    'edit.kmlError': 'U datoteci nije pronađen poligon (granica). Provjeri je li to .kml s nacrtanim oblikom.',
    'edit.kmlKmz': 'KMZ još nije podržan – u Google Earthu spremi kao .kml.',
    'edit.otherMethods': 'Drugi način',
    'edit.howto': '❔ Pomoć',
    'edit.finish': '✓ Završi',
    'edit.finishNeed': 'Za granicu trebaju barem 3 točke.',
    'done.title': 'Zemljište je spremljeno',
    'done.text': 'Površina: {area}. Granicu možeš uvijek promijeniti gumbom „Uredi granicu”.',
    'done.next': 'Sljedeći korak: dodavanje stabala i gredica (dolazi uskoro).',
    'top.edit': '✏️ Uredi granicu',
    'top.new': '➕ Novi voćnjak',
    'top.orchards': 'Moji voćnjaci',
    'top.delete': '🗑️ Obriši voćnjak',
    'top.deleteConfirm': 'Obrisati voćnjak „{name}”? To se ne može vratiti.',
    'saved.local': 'Spremljeno u ovom pregledniku (prijava i spremanje na server dolaze uskoro).',
    'method.rect': 'Pravokutnik',
    'method.draw': 'Iscrtano',
    'method.kml': 'Iz KML-a',
    'auth.title': 'Prijava',
    'auth.tabLogin': 'Prijava',
    'auth.tabRegister': 'Registracija',
    'auth.email': 'E-mail',
    'auth.password': 'Lozinka',
    'auth.passwordHint': 'Najmanje 6 znakova.',
    'auth.login': 'Prijavi se',
    'auth.register': 'Napravi račun',
    'auth.google': 'Prijava s Googleom',
    'auth.or': 'ili',
    'auth.forgot': 'Zaboravljena lozinka?',
    'auth.forgotSent': 'Ako račun postoji, poslan je e-mail s poveznicom za novu lozinku.',
    'auth.needEmail': 'Upiši e-mail i lozinku (najmanje 6 znakova).',
    'auth.checkEmail': 'Račun je napravljen. Provjeri e-mail i potvrdi adresu, zatim se prijavi.',
    'auth.badLogin': 'Pogrešan e-mail ili lozinka.',
    'auth.exists': 'Račun s tim e-mailom već postoji – prijavi se.',
    'auth.googleOff': 'Prijava s Googleom još nije uključena.',
    'auth.logout': 'Odjava',
    'auth.error': 'Greška: {msg}',
    'auth.newPassword': 'Upiši novu lozinku',
    'auth.passwordChanged': 'Lozinka je promijenjena.',
    'import.confirm': 'U ovom pregledniku pronađeno je {n} voćnjaka iz probne verzije. Prebaciti ih na tvoj račun?',
    'import.done': 'Prebačeno voćnjaka: {n}.',
    'db.error': 'Spremanje nije uspjelo: {msg}',
    'db.loadError': 'Ne mogu učitati voćnjake: {msg}',
    'role.viewer': 'samo gledaš',
    'saved.cloud': 'Spremljeno na tvoj račun.'
  },
  en: {
    'app.name': 'Horvati Orchard',
    'app.tagline': 'Orchard map, trees, work schedule and notes – all in one place.',
    'lang.switch': 'Hrvatski',
    'welcome.title': 'Welcome! 🌳',
    'welcome.text': 'Create your first orchard: enter a name and location, then mark your land on the satellite map.',
    'welcome.create': '➕ New orchard',
    'new.title': 'New orchard',
    'new.name': 'Orchard name',
    'new.namePh': 'e.g. Cottage, Grandpa’s orchard',
    'new.address': 'Place or address',
    'new.addressPh': 'e.g. Horvati, Zagreb',
    'new.addressHint': 'The map will move to that place. You can leave it empty and search later.',
    'new.create': 'Create',
    'new.nameRequired': 'Enter the orchard name.',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.ok': 'OK',
    'common.back': 'Back',
    'search.ph': 'Search for a place or address…',
    'search.btn': 'Search',
    'search.notFound': 'Place not found. Try a different name.',
    'search.error': 'Search is not available right now. Move the map manually.',
    'layers.satellite': 'Satellite',
    'layers.map': 'Map',
    'howto.title': 'How do you want to mark your land?',
    'howto.intro': 'A 20 × 30 m rectangle is already placed on the map. Pick whichever way is easiest – you can always come back and change the boundary later.',
    'howto.rect.title': '⬛ Rectangle',
    'howto.rect.text': 'The simplest. Enter width and length or drag the corners, rotate ⟳ and move ✥ to fit your land.',
    'howto.draw.title': '✏️ Draw on the map',
    'howto.draw.text': 'Click the corners of your land one by one on the satellite image. For land that is not rectangular.',
    'howto.kml.title': '📂 Import KML',
    'howto.kml.text': 'If you already have a boundary from Google Earth or Google My Maps (a .kml file).',
    'howto.choose': 'Choose',
    'edit.title': 'Land boundary',
    'edit.area': 'Area',
    'edit.method': 'Method',
    'edit.width': 'Width (m)',
    'edit.length': 'Length (m)',
    'edit.rotation': 'Rotated',
    'edit.rectHelp': 'Drag the white corners to resize, the blue handle ⟳ to rotate and the green one ✥ to move.',
    'edit.drawHelp': 'Click the corners of your land in order. You can drag points afterwards. At least 3 points are needed.',
    'edit.drawUndo': '↶ Remove last point',
    'edit.drawClear': 'Start over',
    'edit.points': 'Points',
    'edit.kmlHelp': 'Choose a .kml file. The first polygon in the file is used; after import you can drag the points.',
    'edit.kmlChoose': 'Choose KML file',
    'edit.kmlError': 'No polygon (boundary) was found in the file. Check that it is a .kml with a drawn shape.',
    'edit.kmlKmz': 'KMZ is not supported yet – save it as .kml in Google Earth.',
    'edit.otherMethods': 'Other method',
    'edit.howto': '❔ Help',
    'edit.finish': '✓ Finish',
    'edit.finishNeed': 'A boundary needs at least 3 points.',
    'done.title': 'Land saved',
    'done.text': 'Area: {area}. You can always change the boundary with “Edit boundary”.',
    'done.next': 'Next step: adding trees and beds (coming soon).',
    'top.edit': '✏️ Edit boundary',
    'top.new': '➕ New orchard',
    'top.orchards': 'My orchards',
    'top.delete': '🗑️ Delete orchard',
    'top.deleteConfirm': 'Delete orchard “{name}”? This cannot be undone.',
    'saved.local': 'Saved in this browser (sign-in and server storage are coming soon).',
    'method.rect': 'Rectangle',
    'method.draw': 'Drawn',
    'method.kml': 'From KML',
    'auth.title': 'Sign in',
    'auth.tabLogin': 'Sign in',
    'auth.tabRegister': 'Register',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.passwordHint': 'At least 6 characters.',
    'auth.login': 'Sign in',
    'auth.register': 'Create account',
    'auth.google': 'Sign in with Google',
    'auth.or': 'or',
    'auth.forgot': 'Forgot password?',
    'auth.forgotSent': 'If the account exists, an email with a password reset link has been sent.',
    'auth.needEmail': 'Enter your email and password (at least 6 characters).',
    'auth.checkEmail': 'Account created. Check your email to confirm the address, then sign in.',
    'auth.badLogin': 'Wrong email or password.',
    'auth.exists': 'An account with that email already exists – sign in.',
    'auth.googleOff': 'Google sign-in is not enabled yet.',
    'auth.logout': 'Sign out',
    'auth.error': 'Error: {msg}',
    'auth.newPassword': 'Enter a new password',
    'auth.passwordChanged': 'Password changed.',
    'import.confirm': '{n} orchards from the trial version were found in this browser. Move them to your account?',
    'import.done': 'Orchards moved: {n}.',
    'db.error': 'Saving failed: {msg}',
    'db.loadError': 'Cannot load orchards: {msg}',
    'role.viewer': 'view only',
    'saved.cloud': 'Saved to your account.'
  }
};

const LANG_KEY = 'hvj_lang';

function detectLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'hr' || saved === 'en') return saved;
  } catch (e) { /* ništa */ }
  const nav = (navigator.language || 'hr').toLowerCase();
  return /^(hr|bs|sr|sh)/.test(nav) ? 'hr' : 'en';
}

let lang = detectLang();
const listeners = [];

export function getLang() { return lang; }

export function t(key, params) {
  let s = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.hr[key] || key;
  if (params) Object.keys(params).forEach((k) => { s = s.split('{' + k + '}').join(params[k]); });
  return s;
}

export function applyI18n(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.title = t('app.name');
}

export function setLang(next) {
  lang = next === 'en' ? 'en' : 'hr';
  try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ništa */ }
  applyI18n();
  listeners.forEach((fn) => fn(lang));
}

export function onLangChange(fn) { listeners.push(fn); }

// Brojevi i površine u formatu jezika
export function fmtNum(n, digits = 1) {
  return Number(n).toLocaleString(lang === 'hr' ? 'hr-HR' : 'en-GB', { maximumFractionDigits: digits });
}

export function fmtArea(m2) {
  if (m2 >= 10000) return fmtNum(m2 / 10000, 2) + ' ha (' + fmtNum(m2, 0) + ' m²)';
  return fmtNum(m2, 0) + ' m²';
}
