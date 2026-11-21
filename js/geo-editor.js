// Uređivač granice zemljišta: pravokutnik (ručice), iscrtavanje točaka ili KML (uređivi poligon).
import { rectCorners, rectHandle, toLocal, fromLocal, rotate, polygonAreaM2 } from './geo.js';

const STYLE = { color: '#ffffff', weight: 2.5, fillColor: '#4caf50', fillOpacity: 0.28, dashArray: '6 6' };
const DONE_STYLE = { color: '#c8e6c9', weight: 2, fillColor: '#4caf50', fillOpacity: 0.18 };

function handleIcon(cls, text) {
  return L.divIcon({ className: 'hv-handle-wrap', html: '<div class="hv-handle ' + cls + '">' + (text || '') + '</div>', iconSize: [26, 26], iconAnchor: [13, 13] });
}

export function createBoundaryEditor(map, onChange) {
  const layer = L.layerGroup().addTo(map);
  let state = null; // { type: 'rect', rect } | { type: 'polygon', points: [[lat,lng]], source: 'draw'|'kml' }
  let editing = false;
  let drawMode = false;

  function area() {
    if (!state) return 0;
    if (state.type === 'rect') return state.rect.w * state.rect.h;
    return polygonAreaM2(state.points);
  }

  function emit() { onChange && onChange(getBoundary(), area()); }

  function clear() { layer.clearLayers(); }

  // ---------------- pravokutnik
  function drawRect() {
    clear();
    const rect = state.rect;
    const poly = L.polygon(rectCorners(rect), editing ? STYLE : DONE_STYLE).addTo(layer);
    if (!editing) return;
    const corners = rectCorners(rect);
    const center = L.latLng(rect.center);

    const refresh = () => {
      const cs = rectCorners(rect);
      poly.setLatLngs(cs);
      cornerMarkers.forEach((m, i) => m.setLatLng(cs[i]));
      rot.setLatLng(rectHandle(rect, 1));
      mov.setLatLng(rectHandle(rect, -1));
      line.setLatLngs([rectHandle(rect, -1), rectHandle(rect, 1)]);
      emit();
    };

    const line = L.polyline([rectHandle(rect, -1), rectHandle(rect, 1)], { color: '#1e88e5', weight: 1.5, dashArray: '4 4', interactive: false }).addTo(layer);

    // kutovi: suprotni kut ostaje na mjestu
    const cornerMarkers = corners.map((ll, i) => {
      const m = L.marker(ll, { draggable: true, icon: handleIcon('corner'), zIndexOffset: 1000, keyboard: false }).addTo(layer);
      let opposite = null;
      m.on('dragstart', () => { opposite = rectCorners(rect)[(i + 2) % 4]; });
      m.on('drag', (e) => {
        const o = opposite;
        const p = toLocal(e.target.getLatLng(), o);
        const u = rotate(p, -(rect.rot || 0)); // u okviru pravokutnika
        rect.w = Math.max(1, Math.abs(u.x));
        rect.h = Math.max(1, Math.abs(u.y));
        const half = rotate({ x: Math.sign(u.x || 1) * rect.w / 2, y: Math.sign(u.y || 1) * rect.h / 2 }, rect.rot || 0);
        const c = fromLocal(half, o);
        rect.center = [c.lat, c.lng];
        const cs = rectCorners(rect);
        poly.setLatLngs(cs);
        cornerMarkers.forEach((mm, j) => { if (j !== i) mm.setLatLng(cs[j]); });
        rot.setLatLng(rectHandle(rect, 1));
        mov.setLatLng(rectHandle(rect, -1));
        line.setLatLngs([rectHandle(rect, -1), rectHandle(rect, 1)]);
        emit();
      });
      m.on('dragend', refresh);
      return m;
    });

    const rot = L.marker(rectHandle(rect, 1), { draggable: true, icon: handleIcon('rotate', '⟳'), zIndexOffset: 1100, keyboard: false }).addTo(layer);
    rot.on('drag', (e) => {
      const p = toLocal(e.target.getLatLng(), L.latLng(rect.center));
      rect.rot = (Math.round(Math.atan2(p.x, p.y) * 180 / Math.PI) + 360) % 360;
      const cs = rectCorners(rect);
      poly.setLatLngs(cs);
      cornerMarkers.forEach((m, i) => m.setLatLng(cs[i]));
      mov.setLatLng(rectHandle(rect, -1));
      line.setLatLngs([rectHandle(rect, -1), e.target.getLatLng()]);
      emit();
    });
    rot.on('dragend', refresh);

    const mov = L.marker(rectHandle(rect, -1), { draggable: true, icon: handleIcon('move', '✥'), zIndexOffset: 1100, keyboard: false }).addTo(layer);
    let start = null;
    mov.on('dragstart', (e) => { const p = e.target.getLatLng(); start = { c: L.latLng(rect.center), h: p }; });
    mov.on('drag', (e) => {
      const p = e.target.getLatLng();
      rect.center = [start.c.lat + (p.lat - start.h.lat), start.c.lng + (p.lng - start.h.lng)];
      const cs = rectCorners(rect);
      poly.setLatLngs(cs);
      cornerMarkers.forEach((m, i) => m.setLatLng(cs[i]));
      rot.setLatLng(rectHandle(rect, 1));
      line.setLatLngs([p, rectHandle(rect, 1)]);
      emit();
    });
    mov.on('dragend', refresh);
    void center;
  }

  // ---------------- poligon (iscrtan ili iz KML-a)
  function drawPolygon() {
    clear();
    const pts = state.points;
    if (!editing) {
      if (pts.length >= 3) L.polygon(pts, DONE_STYLE).addTo(layer);
      return;
    }
    const shape = pts.length >= 3 ? L.polygon(pts, STYLE) : L.polyline(pts, { color: '#ffffff', weight: 2.5, dashArray: '6 6' });
    shape.addTo(layer);
    pts.forEach((ll, i) => {
      const m = L.marker(ll, { draggable: true, icon: handleIcon('vertex' + (i === 0 ? ' first' : ''), String(i + 1)), zIndexOffset: 1000, keyboard: false }).addTo(layer);
      m.on('drag', (e) => {
        const p = e.target.getLatLng();
        pts[i] = [p.lat, p.lng];
        shape.setLatLngs(pts);
        emit();
      });
    });
  }

  function redraw() {
    if (!state) { clear(); return; }
    if (state.type === 'rect') drawRect(); else drawPolygon();
  }

  map.on('click', (e) => {
    if (!editing || !drawMode || !state || state.type !== 'polygon') return;
    state.points.push([e.latlng.lat, e.latlng.lng]);
    drawPolygon();
    emit();
  });

  function getBoundary() {
    if (!state) return null;
    if (state.type === 'rect') {
      const r = state.rect;
      return { type: 'rect', rect: { center: r.center.slice(), w: r.w, h: r.h, rot: r.rot || 0 }, points: rectCorners(r).map((ll) => [ll.lat, ll.lng]) };
    }
    return { type: 'polygon', source: state.source, points: state.points.map((p) => p.slice()) };
  }

  return {
    area,
    getBoundary,
    isDrawing: () => editing && drawMode,
    load(boundary) {
      if (!boundary) { state = null; redraw(); return; }
      state = boundary.type === 'rect'
        ? { type: 'rect', rect: { center: boundary.rect.center.slice(), w: boundary.rect.w, h: boundary.rect.h, rot: boundary.rect.rot || 0 } }
        : { type: 'polygon', source: boundary.source || 'draw', points: boundary.points.map((p) => p.slice()) };
      redraw();
    },
    setEditing(on) {
      editing = on;
      if (!on) drawMode = false;
      document.body.classList.toggle('hv-drawing', editing && drawMode);
      redraw();
    },
    startRect(center, w = 20, h = 30) {
      state = { type: 'rect', rect: { center: [center.lat, center.lng], w, h, rot: 0 } };
      drawMode = false;
      document.body.classList.remove('hv-drawing');
      redraw();
      emit();
    },
    setRectSize(w, h) {
      if (!state || state.type !== 'rect') return;
      state.rect.w = Math.max(1, w);
      state.rect.h = Math.max(1, h);
      redraw();
      emit();
    },
    rect: () => (state && state.type === 'rect' ? state.rect : null),
    startDraw() {
      state = { type: 'polygon', source: 'draw', points: [] };
      drawMode = true;
      document.body.classList.add('hv-drawing');
      redraw();
      emit();
    },
    undoPoint() {
      if (state && state.type === 'polygon' && state.points.length) {
        state.points.pop();
        drawPolygon();
        emit();
      }
    },
    loadPoints(points, source) {
      state = { type: 'polygon', source, points: points.map((p) => p.slice()) };
      drawMode = false;
      document.body.classList.remove('hv-drawing');
      redraw();
      emit();
      map.fitBounds(L.latLngBounds(points), { padding: [60, 60] });
    },
    pointCount: () => (state && state.type === 'polygon' ? state.points.length : 4),
    type: () => (state ? (state.type === 'rect' ? 'rect' : state.source) : null),
    bounds() {
      const b = getBoundary();
      return b && b.points.length ? L.latLngBounds(b.points) : null;
    }
  };
}
