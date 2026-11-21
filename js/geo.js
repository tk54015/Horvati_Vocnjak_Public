// Geometrija u lokalnim metrima oko zadane točke (dovoljno točno za voćnjak/parcelu).
const M_PER_DEG_LAT = 111320;

export function mPerDegLng(lat) {
  return M_PER_DEG_LAT * Math.cos(lat * Math.PI / 180);
}

// latlng -> metri (x = istok, y = sjever) u odnosu na ishodište
export function toLocal(ll, origin) {
  return {
    x: (ll.lng - origin.lng) * mPerDegLng(origin.lat),
    y: (ll.lat - origin.lat) * M_PER_DEG_LAT
  };
}

export function fromLocal(p, origin) {
  return L.latLng(origin.lat + p.y / M_PER_DEG_LAT, origin.lng + p.x / mPerDegLng(origin.lat));
}

// Rotacija u smjeru kazaljke (stupnjevi), kao kompas
export function rotate(p, deg) {
  const t = deg * Math.PI / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: p.x * c + p.y * s, y: -p.x * s + p.y * c };
}

// Kutovi pravokutnika: center (latlng), w = širina (istok–zapad prije okretanja), h = dužina (sjever–jug), rot u stupnjevima
export function rectCorners(rect) {
  const c = L.latLng(rect.center);
  const hw = rect.w / 2;
  const hh = rect.h / 2;
  return [[-hw, hh], [hw, hh], [hw, -hh], [-hw, -hh]].map(([x, y]) => fromLocal(rotate({ x, y }, rect.rot || 0), c));
}

// Točka na zadanoj udaljenosti od središta u smjeru "gore" pravokutnika (sign = -1 dolje)
export function rectHandle(rect, sign) {
  const c = L.latLng(rect.center);
  const d = (rect.h / 2 + Math.max(3, Math.min(15, Math.max(rect.w, rect.h) * 0.25))) * sign;
  return fromLocal(rotate({ x: 0, y: d }, rect.rot || 0), c);
}

export function polygonAreaM2(latlngs) {
  if (!latlngs || latlngs.length < 3) return 0;
  const o = L.latLng(latlngs[0]);
  const pts = latlngs.map((ll) => toLocal(L.latLng(ll), o));
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function distanceM(a, b) {
  const o = L.latLng(a);
  const p = toLocal(L.latLng(b), o);
  return Math.hypot(p.x, p.y);
}

// Prvi poligon iz KML-a -> [[lat, lng], ...]
export function parseKmlPolygon(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;
  const polys = doc.getElementsByTagNameNS('*', 'Polygon');
  for (let i = 0; i < polys.length; i++) {
    const outer = polys[i].getElementsByTagNameNS('*', 'outerBoundaryIs')[0] || polys[i];
    const coordEl = outer.getElementsByTagNameNS('*', 'coordinates')[0];
    if (!coordEl) continue;
    const pts = coordEl.textContent.trim().split(/\s+/).map((tuple) => {
      const [lng, lat] = tuple.split(',').map(Number);
      return [lat, lng];
    }).filter(([lat, lng]) => isFinite(lat) && isFinite(lng));
    if (pts.length > 1) {
      const a = pts[0];
      const b = pts[pts.length - 1];
      if (a[0] === b[0] && a[1] === b[1]) pts.pop();
    }
    if (pts.length >= 3) return pts;
  }
  return null;
}
