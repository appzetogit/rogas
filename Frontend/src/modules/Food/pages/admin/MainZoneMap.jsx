import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, Plus, Save, X, Eraser } from "lucide-react";
import { adminClient } from "@food/api/axios";
import { adminAPI } from "@food/api";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";
import { Loader } from "@googlemaps/js-api-loader";

const WORKING = "#9333ea"; // the shape being drawn
const BOUNDARY = "#dc2626"; // the main zone
const SUBZONE = "#2563eb"; // the saved sub-zones

const toLatLngs = (g, coords) => (coords || []).map((c) => new g.maps.LatLng(c.latitude, c.longitude));
const pathToCoords = (path) => {
  const out = [];
  for (let i = 0; i < path.getLength(); i += 1) out.push({ latitude: Number(path.getAt(i).lat().toFixed(6)), longitude: Number(path.getAt(i).lng().toFixed(6)) });
  if (out.length > 1 && out[0].latitude === out[out.length - 1].latitude && out[0].longitude === out[out.length - 1].longitude) out.pop();
  return out;
};
const errorText = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

/**
 * Draw a main zone (the city) on the map, then draw its sub-zones inside it. The server refuses a sub-zone that is not
 * completely inside the main zone or that overlaps another sub-zone, and says why.
 */
export default function MainZoneMap() {
  const { id } = useParams();
  const navigate = useNavigate();
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const managerRef = useRef(null);
  const workingRef = useRef(null);
  const overlaysRef = useRef([]);
  const fittedRef = useRef(false);

  const [data, setData] = useState(null); // { city, subZones }
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [mode, setMode] = useState("view"); // view | boundary | subzone
  const [editingId, setEditingId] = useState(null); // sub-zone being redrawn
  const [name, setName] = useState("");
  const [coords, setCoords] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await adminClient.get(`/food/admin/cities/${id}/map`);
      if (res?.data?.success) setData(res.data.data);
    } catch (err) {
      setError(errorText(err, "Could not load the main zone"));
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // ── Google Maps
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const key = await getGoogleMapsApiKey();
        let tries = 0;
        while (!window.google && tries < 50) { await new Promise((r) => setTimeout(r, 100)); tries += 1; }
        let g = window.google;
        if (!g?.maps?.drawing) {
          if (!key) throw new Error("The Google Maps key is not set");
          g = await new Loader({ apiKey: key, version: "weekly", libraries: ["places", "drawing", "geometry"] }).load();
        }
        if (dead || !mapEl.current) return;
        const map = new g.maps.Map(mapEl.current, { center: { lat: 52.2297, lng: 21.0122 }, zoom: 6, streetViewControl: false, gestureHandling: "greedy", mapTypeControl: true });
        const manager = new g.maps.drawing.DrawingManager({
          drawingMode: null, drawingControl: false,
          polygonOptions: { fillColor: WORKING, fillOpacity: 0.3, strokeColor: WORKING, strokeWeight: 2, editable: true, clickable: false, zIndex: 5 }
        });
        manager.setMap(map);
        g.maps.event.addListener(manager, "overlaycomplete", (event) => {
          manager.setDrawingMode(null);
          attachWorking(g, event.overlay);
        });
        mapRef.current = map;
        managerRef.current = manager;
        setMapReady(true);
      } catch (err) {
        setMapError(errorText(err, "The map could not be loaded"));
      }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearWorking = () => {
    if (workingRef.current) { workingRef.current.setMap(null); workingRef.current = null; }
    setCoords([]);
  };

  const attachWorking = (g, polygon) => {
    if (workingRef.current && workingRef.current !== polygon) workingRef.current.setMap(null);
    workingRef.current = polygon;
    polygon.setEditable(true);
    const path = polygon.getPath();
    const sync = () => setCoords(pathToCoords(path));
    ["set_at", "insert_at", "remove_at"].forEach((ev) => g.maps.event.addListener(path, ev, sync));
    sync();
  };

  const startDrawing = () => {
    clearWorking();
    managerRef.current?.setDrawingMode(window.google.maps.drawing.OverlayType.POLYGON);
  };

  // ── Saved shapes on the map: the main zone and every sub-zone (except the one being redrawn)
  useEffect(() => {
    const g = window.google;
    if (!mapReady || !data || !g) return;
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    const add = (poly) => { poly.setMap(mapRef.current); overlaysRef.current.push(poly); };
    const bounds = new g.maps.LatLngBounds();
    if (data.city.boundary?.length >= 3) {
      const path = toLatLngs(g, data.city.boundary);
      path.forEach((p) => bounds.extend(p));
      if (mode !== "boundary") add(new g.maps.Polygon({ paths: path, strokeColor: BOUNDARY, strokeWeight: 3, fillColor: BOUNDARY, fillOpacity: 0.04, clickable: false, zIndex: 1 }));
    }
    data.subZones.forEach((z) => {
      if (String(z._id) === String(editingId) || !(z.coordinates?.length >= 3)) return;
      const poly = new g.maps.Polygon({ paths: toLatLngs(g, z.coordinates), strokeColor: SUBZONE, strokeWeight: 2, fillColor: SUBZONE, fillOpacity: 0.2, zIndex: 2 });
      const info = new g.maps.InfoWindow({ content: `<strong>${String(z.name).replace(/</g, "&lt;")}</strong>` });
      poly.addListener("click", (e) => { info.setPosition(e.latLng); info.open(mapRef.current); });
      add(poly);
    });
    if (!fittedRef.current && !bounds.isEmpty()) { mapRef.current.fitBounds(bounds); fittedRef.current = true; }
  }, [mapReady, data, mode, editingId]);

  // ── Modes
  const cancel = () => {
    managerRef.current?.setDrawingMode(null);
    clearWorking();
    setMode("view"); setEditingId(null); setName(""); setError("");
  };

  const beginBoundary = () => {
    cancel();
    setMode("boundary");
    if (data.city.boundary?.length >= 3) attachWorking(window.google, new window.google.maps.Polygon({ paths: toLatLngs(window.google, data.city.boundary), map: mapRef.current, fillColor: WORKING, fillOpacity: 0.2, strokeColor: WORKING, strokeWeight: 3, clickable: false, zIndex: 5 }));
    else startDrawing();
  };

  const beginSubZone = (zone = null) => {
    cancel();
    setMode("subzone");
    if (zone) {
      setEditingId(zone._id); setName(zone.name || "");
      attachWorking(window.google, new window.google.maps.Polygon({ paths: toLatLngs(window.google, zone.coordinates), map: mapRef.current, fillColor: WORKING, fillOpacity: 0.3, strokeColor: WORKING, strokeWeight: 2, clickable: false, zIndex: 5 }));
    } else {
      startDrawing();
    }
  };

  const save = async () => {
    setError("");
    if (coords.length < 3) { setError("Draw the shape on the map first (at least 3 points)"); return; }
    if (mode === "subzone" && !name.trim()) { setError("Give the sub-zone a name"); return; }
    setSaving(true);
    try {
      if (mode === "boundary") await adminClient.patch(`/food/admin/cities/${id}`, { boundary: coords });
      else if (editingId) await adminClient.patch(`/food/admin/cities/${id}/sub-zones/${editingId}`, { name: name.trim(), coordinates: coords });
      else await adminClient.post(`/food/admin/cities/${id}/sub-zones`, { name: name.trim(), coordinates: coords });
      cancel();
      await load();
    } catch (err) {
      setError(errorText(err, "Could not save"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (zone) => {
    if (!window.confirm(`Delete the sub-zone "${zone.name}"? Vendors and drivers set to it will need another zone.`)) return;
    try {
      await adminAPI.deleteZone(zone._id);
      await load();
    } catch (err) {
      setError(errorText(err, "Could not delete"));
    }
  };

  const hasBoundary = data?.city.boundary?.length >= 3;
  const drawing = mode !== "view";

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="bg-gray-900 border-b border-gray-800 px-4 sm:px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate("/admin/food/cities")} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700" aria-label="Back"><ArrowLeft className="w-4 h-4" /></button>
        <div>
          <h1 className="text-lg font-bold">{data?.city.name || "Main zone"} - map</h1>
          <p className="text-xs text-gray-400">Draw the main zone boundary, then draw its sub-zones inside it</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        <div className="lg:w-96 shrink-0 p-4 space-y-4 lg:max-h-[calc(100vh-73px)] lg:overflow-y-auto">
          {error && <div className="rounded-xl border border-red-800 bg-red-950/60 text-red-200 text-sm p-3">{error}</div>}

          {drawing ? (
            <div className="rounded-2xl border border-purple-700/60 bg-gray-900 p-4 space-y-3">
              <p className="font-semibold">
                {mode === "boundary" ? "Main zone boundary" : editingId ? "Redraw the sub-zone" : "New sub-zone"}
              </p>
              <p className="text-xs text-gray-400">
                {mode === "boundary"
                  ? "Click the map to place the corners of the main zone. Drag a corner to adjust it."
                  : "Click inside the red outline to place the corners. The sub-zone must stay completely inside the main zone and must not overlap another sub-zone."}
              </p>
              {mode === "subzone" && (
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sub-zone name, e.g. Mokotow"
                  className="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              )}
              <p className="text-xs text-gray-500">{coords.length ? `${coords.length} corners placed` : "Nothing drawn yet"}</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold disabled:opacity-50"><Save className="w-4 h-4" />{saving ? "Saving..." : "Save"}</button>
                <button onClick={startDrawing} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm"><Eraser className="w-4 h-4" />Redraw</button>
                <button onClick={cancel} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm"><X className="w-4 h-4" />Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">Main zone boundary</p>
                    <p className="text-xs text-gray-400">{hasBoundary ? `${data.city.boundary.length} corners drawn` : "Not drawn yet"}</p>
                  </div>
                  <button onClick={beginBoundary} disabled={!mapReady || !data} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-700 hover:bg-red-600 text-sm font-semibold disabled:opacity-50">
                    <Pencil className="w-4 h-4" />{hasBoundary ? "Edit" : "Draw"}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="font-semibold">Sub-zones ({data?.subZones.length || 0})</p>
                  <button onClick={() => beginSubZone()} disabled={!mapReady || !hasBoundary} title={hasBoundary ? "" : "Draw the main zone boundary first"}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold disabled:opacity-40">
                    <Plus className="w-4 h-4" />Add sub-zone
                  </button>
                </div>
                {!hasBoundary && <p className="text-xs text-amber-400 mb-2">Draw the main zone boundary first. Sub-zones are drawn inside it.</p>}
                {data?.subZones.length === 0 && hasBoundary && <p className="text-xs text-gray-500">No sub-zones yet.</p>}
                <ul className="space-y-2">
                  {data?.subZones.map((z) => (
                    <li key={z._id} className="flex items-center justify-between gap-2 rounded-xl bg-gray-800 px-3 py-2">
                      <span className="text-sm truncate">{z.name}{z.isActive === false ? " (off)" : ""}</span>
                      <span className="flex gap-1 shrink-0">
                        <button onClick={() => beginSubZone(z)} className="p-1.5 rounded-lg hover:bg-gray-700" aria-label={`Redraw ${z.name}`}><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => remove(z)} className="p-1.5 rounded-lg hover:bg-gray-700 text-red-400" aria-label={`Delete ${z.name}`}><Trash2 className="w-4 h-4" /></button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-gray-500">Red outline: main zone. Blue shapes: sub-zones. Click a blue shape to see its name.</p>
            </>
          )}
        </div>

        <div className="flex-1 min-h-[420px] lg:h-[calc(100vh-73px)] relative">
          <div ref={mapEl} className="absolute inset-0" />
          {mapError && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-red-300 bg-gray-950/80">{mapError}</div>}
        </div>
      </div>
    </div>
  );
}
