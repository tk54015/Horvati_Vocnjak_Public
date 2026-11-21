# Horvati voćnjak – javno

Aplikacija za voćnjake na više lokacija (nastavak aplikacije *Horvati voćnjak*).

**Faza 1a (trenutno):** satelitska karta, pretraga mjesta, više voćnjaka, granica zemljišta
(pravokutnik s ručicama, iscrtavanje točaka ili uvoz KML-a) s izračunom površine, hrvatski i engleski.
Podaci se za sada spremaju u preglednik; prijava (email + Google) i baza preko Supabasea dolaze u sljedećoj fazi.

- `index.html` – sučelje
- `js/app.js` – glavna logika
- `js/geo-editor.js` – uređivač granice
- `js/geo.js` – geometrija (metri, površina, KML)
- `js/i18n.js` – prijevodi (hr / en)

Karta: snimke © Esri, Maxar, Earthstar Geographics; pretraga mjesta: © OpenStreetMap (Nominatim).
