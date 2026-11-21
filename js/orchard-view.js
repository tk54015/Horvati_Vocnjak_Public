// Prikaz gotovog zemljišta: zeleno (kao u Horvatima), okolica zatamnjena ("izrezano").
const WORLD = [[-89, -179.9], [-89, 179.9], [89, 179.9], [89, -179.9]];

export function createOrchardView(map) {
  const layer = L.layerGroup().addTo(map);
  let points = null;
  let satellite = false;

  function draw() {
    layer.clearLayers();
    if (!points || points.length < 3) return;
    // okolica: tamni sloj s rupom u obliku zemljišta
    L.polygon([WORLD, points], {
      stroke: false, fillColor: '#0f1a0d', fillOpacity: satellite ? 0.55 : 0.78, interactive: false
    }).addTo(layer);
    // zemljište
    L.polygon(points, {
      color: '#111', weight: 2, fillColor: '#008000', fillOpacity: satellite ? 0.12 : 1, interactive: false
    }).addTo(layer);
  }

  return {
    show(pts) { points = pts; draw(); },
    hide() { points = null; layer.clearLayers(); },
    setSatellite(on) { satellite = !!on; draw(); },
    satellite: () => satellite,
    bounds: () => (points ? L.latLngBounds(points) : null),
    contains(ll) {
      if (!points) return true;
      // ray casting u lat/lng (dovoljno za parcelu)
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [yi, xi] = points[i];
        const [yj, xj] = points[j];
        if (((yi > ll.lat) !== (yj > ll.lat)) && (ll.lng < (xj - xi) * (ll.lat - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
    }
  };
}
