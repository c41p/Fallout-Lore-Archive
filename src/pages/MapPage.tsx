import L from "leaflet";
import { Layers3, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getMapLocations } from "../lib/api";
import { statusLabel } from "../lib/format";
import type { MapLocation } from "../types";
import "leaflet/dist/leaflet.css";

export function MapPage() {
  const container = useRef<HTMLDivElement>(null); const mapRef = useRef<L.Map>(); const [locations, setLocations] = useState<MapLocation[]>([]); const [selected, setSelected] = useState<MapLocation>(); const [showApproximate, setShowApproximate] = useState(true); const [error, setError] = useState("");
  useEffect(() => { getMapLocations().then(setLocations).catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => {
    if (!container.current || mapRef.current || !locations.length) return;
    const map = L.map(container.current, { attributionControl: false, zoomControl: true, minZoom: 3, maxZoom: 9 }).setView([36.1, -117.1], 5); mapRef.current = map;
    fetch("/map/ne_50m_admin_0_countries.geojson").then((r) => r.json()).then((geojson) => L.geoJSON(geojson, { filter: (feature) => ["United States of America", "Canada", "Mexico"].includes(String(feature.properties?.ADMIN)), style: { color: "#506655", weight: 1, fillColor: "#18241e", fillOpacity: .8 } }).addTo(map)).catch(() => undefined);
    return () => { map.remove(); mapRef.current = undefined; };
  }, [locations]);
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const layer = L.layerGroup().addTo(map);
    locations.filter((location) => showApproximate || location.spatial.geometryKind === "exact_point").forEach((location) => {
      const approximate = location.spatial.geometryKind === "approximate_point";
      if (approximate) L.circle([location.spatial.latitude, location.spatial.longitude], { radius: location.spatial.precision === "regional" ? 85000 : 35000, color: "#c99b58", weight: 1, dashArray: "5 5", fillColor: "#c99b58", fillOpacity: .08 }).addTo(layer);
      L.circleMarker([location.spatial.latitude, location.spatial.longitude], { radius: approximate ? 7 : 8, color: approximate ? "#c99b58" : "#91b87f", weight: 2, fillColor: "#101713", fillOpacity: 1 }).bindTooltip(`${location.entity.displayName}${approximate ? " (approximate)" : ""}`).on("click", () => setSelected(location)).addTo(layer);
    });
    return () => { layer.remove(); };
  }, [locations, showApproximate]);
  return <div className="page map-page"><header className="page-header"><span className="kicker">SPATIAL REPRESENTATIONS</span><h1>Map</h1><p>Place identity is separate from map geometry. Dashed areas and amber markers are approximate—not invented GPS claims.</p></header>
    <div className="map-toolbar"><span><Layers3 size={16} /> Layers</span><label><input type="checkbox" checked={showApproximate} onChange={(e) => setShowApproximate(e.target.checked)} /> Approximate and inferred locations</label><div className="map-legend"><span><i className="exact"></i>Exact correspondence</span><span><i className="approx"></i>Approximate</span></div></div>
    {error && <div className="error-panel">{error}</div>}
    <div className="map-frame"><div ref={container} className="leaflet-map" aria-label="Interactive map of represented Fallout locations"></div>{selected && <aside className="map-selection"><button aria-label="Close location details" onClick={() => setSelected(undefined)}>×</button><span className="eyebrow">{statusLabel(selected.spatial.geometryKind)}</span><h2>{selected.entity.displayName}</h2><p>{selected.entity.summary}</p><small>{selected.spatial.notes}</small><Link to={`/entity/${selected.entity.id}`}>Open full record →</Link></aside>}</div>
    <section><div className="section-heading"><div><span className="eyebrow">TEXT ALTERNATIVE</span><h2>Mapped locations</h2></div><span className="count-label"><MapPin size={15} /> {locations.length}</span></div><div className="location-list">{locations.filter((location) => showApproximate || location.spatial.geometryKind === "exact_point").map((location) => <Link key={location.spatial.id} to={`/entity/${location.entity.id}`}><i className={location.spatial.geometryKind === "exact_point" ? "exact" : "approx"}></i><div><strong>{location.entity.displayName}</strong><span>{statusLabel(location.spatial.geometryKind)} · {statusLabel(location.spatial.precision)}</span></div><p>{location.spatial.basis}</p></Link>)}</div></section>
    <p className="map-credit">Basemap: Natural Earth public-domain vector data. Lore markers are editorial representations with recorded precision and basis.</p>
  </div>;
}
