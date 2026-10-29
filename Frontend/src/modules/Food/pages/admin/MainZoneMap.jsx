import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Plus,
  Save,
  X,
  RotateCcw,
  Eraser,
  MapPin,
  Layers,
  AlertCircle,
  CheckCircle2,
  Info,
  MousePointerClick,
  Sparkles,
  Maximize2,
  Eye,
  Crosshair,
} from "lucide-react";
import { adminClient } from "@food/api/axios";
import { adminAPI } from "@food/api";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";
import { Loader } from "@googlemaps/js-api-loader";

const BOUNDARY_COLOR = "#e11d48"; // Crimson Red for city perimeter
const SUBZONE_COLOR = "#2563eb";  // Royal Blue for sub-zones

const CITY_COORDINATES = {
  indore: { lat: 22.7196, lng: 75.8577 },
  bhopal: { lat: 23.2599, lng: 77.4126 },
  mumbai: { lat: 19.0760, lng: 72.8777 },
  delhi: { lat: 28.6139, lng: 77.2090 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  warsaw: { lat: 52.2297, lng: 21.0122 },
};

const toLatLngs = (g, coords) =>
  (coords || []).map((c) => new g.maps.LatLng(c.latitude, c.longitude));

const pathToCoords = (path) => {
  const out = [];
  if (!path) return out;
  for (let i = 0; i < path.getLength(); i += 1) {
    out.push({
      latitude: Number(path.getAt(i).lat().toFixed(6)),
      longitude: Number(path.getAt(i).lng().toFixed(6)),
    });
  }
  if (
    out.length > 1 &&
    out[0].latitude === out[out.length - 1].latitude &&
    out[0].longitude === out[out.length - 1].longitude
  ) {
    out.pop();
  }
  return out;
};

const getCentroid = (coords) => {
  if (!coords || coords.length === 0) return null;
  let latSum = 0;
  let lngSum = 0;
  coords.forEach((c) => {
    latSum += Number(c.latitude);
    lngSum += Number(c.longitude);
  });
  return {
    lat: latSum / coords.length,
    lng: lngSum / coords.length,
  };
};

const createPillIcon = (g, text, bg = "#2563eb", textColor = "#ffffff") => {
  const cleanText = String(text || "").trim();
  const width = Math.max(120, Math.min(320, cleanText.length * 7.5 + 34));
  const height = 28;
  const safeText = cleanText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#0f172a" flood-opacity="0.25"/>
        </filter>
      </defs>
      <rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="${(height - 4) / 2}" fill="${bg}" stroke="#ffffff" stroke-width="2" filter="url(#shadow)"/>
      <circle cx="14" cy="${height / 2}" r="4" fill="#ffffff"/>
      <text x="24" y="${height / 2 + 4}" fill="${textColor}" font-family="system-ui, -apple-system, sans-serif" font-size="11px" font-weight="800" letter-spacing="-0.2px">${safeText}</text>
    </svg>
  `;

  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new g.maps.Size(width, height),
    anchor: new g.maps.Point(width / 2, height / 2),
  };
};

const errorText = (err, fallback) =>
  err?.response?.data?.message || err?.message || fallback;

export default function MainZoneMap() {
  const { id } = useParams();
  const navigate = useNavigate();
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const workingPolygonRef = useRef(null);
  const mapClickListenerRef = useRef(null);
  const pathListenersRef = useRef([]);
  const overlaysRef = useRef([]);
  const fittedRef = useRef(false);

  const [data, setData] = useState(null); // { city, subZones }
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [mode, setMode] = useState("view"); // "view" | "boundary" | "subzone"
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [coords, setCoords] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [boundaryPrompt, setBoundaryPrompt] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState(null);

  // Load city & subzones from API
  const load = useCallback(async () => {
    try {
      const res = await adminClient.get(`/food/admin/cities/${id}/map`);
      if (res?.data?.success) {
        setData(res.data.data);
      }
    } catch (err) {
      setError(errorText(err, "Could not load city zone data"));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Determine center coordinates
  const getInitialCenter = useCallback(() => {
    const cityName = data?.city?.name?.toLowerCase()?.trim();
    if (cityName && CITY_COORDINATES[cityName]) {
      return CITY_COORDINATES[cityName];
    }
    return { lat: 22.7196, lng: 75.8577 }; // Default Indore
  }, [data]);

  // Google Maps Initialization (Without deprecated DrawingManager!)
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const key = await getGoogleMapsApiKey();
        let tries = 0;
        while (!window.google && tries < 50) {
          await new Promise((r) => setTimeout(r, 100));
          tries += 1;
        }

        let g = window.google;
        if (!g?.maps) {
          if (!key) throw new Error("Google Maps API key is not configured");
          g = await new Loader({
            apiKey: key,
            version: "weekly",
            libraries: ["places", "geometry"],
          }).load();
        }

        if (dead || !mapEl.current) return;

        const center = getInitialCenter();
        const map = new g.maps.Map(mapEl.current, {
          center,
          zoom: 12,
          streetViewControl: false,
          gestureHandling: "greedy",
          mapTypeControl: true,
          mapTypeControlOptions: {
            position: g.maps.ControlPosition.TOP_RIGHT,
          },
        });

        mapRef.current = map;
        setMapReady(true);
      } catch (err) {
        setMapError(errorText(err, "The map could not be loaded"));
      }
    })();

    return () => {
      dead = true;
    };
  }, [getInitialCenter]);

  // Cleanup listeners
  const cleanupListeners = () => {
    if (mapClickListenerRef.current) {
      window.google?.maps?.event?.removeListener(mapClickListenerRef.current);
      mapClickListenerRef.current = null;
    }
    pathListenersRef.current.forEach((l) =>
      window.google?.maps?.event?.removeListener(l)
    );
    pathListenersRef.current = [];
  };

  // Remove the active working polygon from map
  const clearWorkingPolygon = () => {
    cleanupListeners();
    if (workingPolygonRef.current) {
      workingPolygonRef.current.setMap(null);
      workingPolygonRef.current = null;
    }
    if (mapRef.current) {
      mapRef.current.setOptions({ draggableCursor: null });
    }
    setCoords([]);
  };

  // Setup working polygon and click handler on the map
  const setupWorkingPolygon = (targetMode, initialCoords = []) => {
    clearWorkingPolygon();
    const g = window.google;
    const map = mapRef.current;
    if (!g || !map) return;

    const isBoundary = targetMode === "boundary";
    const color = isBoundary ? BOUNDARY_COLOR : SUBZONE_COLOR;

    // Set map cursor to crosshair for intuitive drawing
    map.setOptions({ draggableCursor: "crosshair" });

    // Create the editable polygon
    const polygon = new g.maps.Polygon({
      paths: initialCoords.length > 0 ? toLatLngs(g, initialCoords) : [],
      strokeColor: color,
      strokeWeight: 3,
      fillColor: color,
      fillOpacity: isBoundary ? 0.1 : 0.28,
      editable: true,
      draggable: false,
      zIndex: 10,
      map: map,
    });

    workingPolygonRef.current = polygon;
    const path = polygon.getPath();

    // Synchronize polygon path with React state
    const syncState = () => {
      const currentPoints = pathToCoords(path);
      setCoords(currentPoints);
    };

    // Listen to node edits (dragging a corner, inserting a corner, removing a corner)
    const setAt = g.maps.event.addListener(path, "set_at", syncState);
    const insertAt = g.maps.event.addListener(path, "insert_at", syncState);
    const removeAt = g.maps.event.addListener(path, "remove_at", syncState);
    pathListenersRef.current = [setAt, insertAt, removeAt];

    // Listen for map clicks to add points
    mapClickListenerRef.current = map.addListener("click", (e) => {
      path.push(e.latLng);
      syncState();
    });

    // Initial sync
    syncState();
  };

  // Render saved overlays (main zone boundary & sub-zones) WITH VISIBLE CORNER HANDLES & FLOATING LABELS
  useEffect(() => {
    const g = window.google;
    const map = mapRef.current;
    if (!mapReady || !data || !g || !map) return;

    // Clear previous overlays
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const addOverlay = (item) => {
      item.setMap(map);
      overlaysRef.current.push(item);
    };

    const bounds = new g.maps.LatLngBounds();

    // 1. Draw City Perimeter Boundary (if not currently editing boundary)
    if (data.city.boundary?.length >= 3) {
      const path = toLatLngs(g, data.city.boundary);
      path.forEach((p) => bounds.extend(p));

      if (mode !== "boundary") {
        // City Boundary Polygon
        const cityPoly = new g.maps.Polygon({
          paths: path,
          strokeColor: BOUNDARY_COLOR,
          strokeWeight: 3.5,
          strokeOpacity: 0.95,
          fillColor: BOUNDARY_COLOR,
          fillOpacity: 0.08,
          clickable: true,
          zIndex: 2,
        });
        addOverlay(cityPoly);

        // Corner Vertex Dots (visible corner handles just like in editing mode!)
        data.city.boundary.forEach((c) => {
          const cornerMarker = new g.maps.Marker({
            position: { lat: c.latitude, lng: c.longitude },
            map: map,
            icon: {
              path: g.maps.SymbolPath.CIRCLE,
              scale: 5,
              fillColor: "#ffffff",
              fillOpacity: 1,
              strokeColor: BOUNDARY_COLOR,
              strokeWeight: 2.5,
            },
            clickable: false,
            zIndex: 4,
          });
          addOverlay(cornerMarker);
        });

        // Floating City Perimeter Label Badge
        const cityCentroid = getCentroid(data.city.boundary);
        if (cityCentroid) {
          const cityLabelMarker = new g.maps.Marker({
            position: cityCentroid,
            map: map,
            icon: createPillIcon(g, `${data.city.name} — City Perimeter`, BOUNDARY_COLOR),
            zIndex: 5,
            title: `${data.city.name} Municipal Boundary`,
          });
          addOverlay(cityLabelMarker);
        }
      }
    }

    // 2. Draw Sub-Zones (with corner handles & floating name badges)
    data.subZones?.forEach((z) => {
      if (String(z._id) === String(editingId) || !(z.coordinates?.length >= 3)) return;

      const isSelected = selectedZoneId === z._id;
      const poly = new g.maps.Polygon({
        paths: toLatLngs(g, z.coordinates),
        strokeColor: isSelected ? "#1d4ed8" : SUBZONE_COLOR,
        strokeWeight: isSelected ? 3.5 : 2.5,
        strokeOpacity: 0.95,
        fillColor: SUBZONE_COLOR,
        fillOpacity: isSelected ? 0.35 : 0.22,
        zIndex: isSelected ? 8 : 6,
        cursor: "pointer",
      });

      const info = new g.maps.InfoWindow({
        content: `
          <div style="font-family:system-ui,-apple-system,sans-serif;padding:6px 10px;font-size:13px;line-height:1.4">
            <strong style="color:#0f172a;display:block;font-size:14px;margin-bottom:2px">${String(z.name).replace(/</g, "&lt;")}</strong>
            <span style="color:#2563eb;font-weight:700;font-size:11px;background:#eff6ff;padding:2px 6px;border-radius:4px;display:inline-block">Sub-Zone • Active</span>
            <div style="color:#64748b;font-size:11px;margin-top:4px">${z.coordinates.length} perimeter corners</div>
          </div>
        `,
      });

      poly.addListener("click", (e) => {
        setSelectedZoneId(z._id);
        info.setPosition(e.latLng);
        info.open(map);
      });

      addOverlay(poly);

      // Corner Vertex Dots for each Sub-Zone (just like in editing mode!)
      z.coordinates.forEach((c) => {
        const cornerMarker = new g.maps.Marker({
          position: { lat: c.latitude, lng: c.longitude },
          map: map,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 4.5,
            fillColor: "#ffffff",
            fillOpacity: 1,
            strokeColor: SUBZONE_COLOR,
            strokeWeight: 2.2,
          },
          clickable: false,
          zIndex: 7,
        });
        addOverlay(cornerMarker);
      });

      // Floating Sub-Zone Name Badge at Centroid
      const zoneCentroid = getCentroid(z.coordinates);
      if (zoneCentroid) {
        const zoneBadgeMarker = new g.maps.Marker({
          position: zoneCentroid,
          map: map,
          icon: createPillIcon(g, z.name, SUBZONE_COLOR),
          zIndex: 9,
          cursor: "pointer",
          title: z.name,
        });

        zoneBadgeMarker.addListener("click", () => {
          setSelectedZoneId(z._id);
          const zb = new g.maps.LatLngBounds();
          z.coordinates.forEach((c) =>
            zb.extend(new g.maps.LatLng(c.latitude, c.longitude))
          );
          map.fitBounds(zb);
        });

        addOverlay(zoneBadgeMarker);
      }
    });

    // Fit bounds on initial load if boundary exists
    if (!fittedRef.current && !bounds.isEmpty()) {
      map.fitBounds(bounds);
      fittedRef.current = true;
    }
  }, [mapReady, data, mode, editingId, selectedZoneId]);

  // Zoom / Fit Whole City
  const handleFitCity = () => {
    const g = window.google;
    const map = mapRef.current;
    if (!g || !map || !data?.city?.boundary?.length) return;
    const bounds = new g.maps.LatLngBounds();
    data.city.boundary.forEach((c) => bounds.extend(new g.maps.LatLng(c.latitude, c.longitude)));
    map.fitBounds(bounds);
  };

  // Zoom to a specific sub-zone
  const handleFocusZone = (z) => {
    const g = window.google;
    const map = mapRef.current;
    if (!g || !map || !z?.coordinates?.length) return;
    setSelectedZoneId(z._id);
    const bounds = new g.maps.LatLngBounds();
    z.coordinates.forEach((c) => bounds.extend(new g.maps.LatLng(c.latitude, c.longitude)));
    map.fitBounds(bounds);
  };

  // Cancel drawing
  const cancel = () => {
    clearWorkingPolygon();
    setMode("view");
    setEditingId(null);
    setName("");
    setError("");
    setBoundaryPrompt(false);
  };

  // Begin Boundary Drawing / Editing
  const beginBoundary = () => {
    setBoundaryPrompt(false);
    setMode("boundary");
    setEditingId(null);
    setName("");
    setError("");

    const initial = data?.city?.boundary?.length >= 3 ? data.city.boundary : [];
    setupWorkingPolygon("boundary", initial);
  };

  // Begin Sub-Zone Drawing / Editing
  const beginSubZone = (zone = null) => {
    const hasPerimeter = data?.city?.boundary?.length >= 3;
    if (!hasPerimeter) {
      setBoundaryPrompt(true);
      return;
    }

    setBoundaryPrompt(false);
    setMode("subzone");
    setError("");

    if (zone) {
      setEditingId(zone._id);
      setName(zone.name || "");
      setupWorkingPolygon("subzone", zone.coordinates || []);
    } else {
      setEditingId(null);
      setName("");
      setupWorkingPolygon("subzone", []);
    }
  };

  // Undo latest added point
  const handleUndoPoint = () => {
    if (!workingPolygonRef.current) return;
    const path = workingPolygonRef.current.getPath();
    if (path.getLength() > 0) {
      path.pop();
      setCoords(pathToCoords(path));
    }
  };

  // Clear all points to redraw
  const handleRedraw = () => {
    if (!workingPolygonRef.current) return;
    const path = workingPolygonRef.current.getPath();
    path.clear();
    setCoords([]);
  };

  // Save polygon to backend
  const save = async () => {
    setError("");
    if (coords.length < 3) {
      setError("Please click on the map to place at least 3 corner points to form a polygon.");
      return;
    }
    if (mode === "subzone" && !name.trim()) {
      setError("Please enter a name for this sub-zone.");
      return;
    }

    setSaving(true);
    try {
      if (mode === "boundary") {
        await adminClient.patch(`/food/admin/cities/${id}`, { boundary: coords });
      } else if (editingId) {
        await adminClient.patch(`/food/admin/cities/${id}/sub-zones/${editingId}`, {
          name: name.trim(),
          coordinates: coords,
        });
      } else {
        await adminClient.post(`/food/admin/cities/${id}/sub-zones`, {
          name: name.trim(),
          coordinates: coords,
        });
      }
      cancel();
      await load();
    } catch (err) {
      setError(errorText(err, "Could not save polygon. Sub-zones must remain strictly inside the city boundary."));
    } finally {
      setSaving(false);
    }
  };

  // Delete sub-zone
  const remove = async (zone) => {
    if (
      !window.confirm(
        `Delete sub-zone "${zone.name}"? Any vendors or delivery partners in it will need to be reallocated.`
      )
    ) {
      return;
    }
    try {
      await adminAPI.deleteZone(zone._id);
      await load();
    } catch (err) {
      setError(errorText(err, "Could not delete sub-zone"));
    }
  };

  const hasBoundary = data?.city?.boundary?.length >= 3;
  const isDrawing = mode !== "view";

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-slate-800 flex flex-col font-sans">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200/90 px-5 sm:px-8 py-4 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => navigate("/admin/food/cities")}
            className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition active:scale-95 cursor-pointer"
            aria-label="Back to cities"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-slate-900 capitalize tracking-tight">
                {data?.city?.name || "City"} — Map &amp; Sub-Zones
              </h1>
              <span className="text-[11px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-50 text-[#00604c] border border-emerald-200">
                {data?.city?.country || "Global"}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Draw the outer municipal border and partition into nested vendor &amp; driver sub-zones
            </p>
          </div>
        </div>

        {/* Legend & Controls */}
        <div className="flex items-center gap-2.5">
          {hasBoundary && (
            <button
              onClick={handleFitCity}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 transition cursor-pointer shadow-2xs"
              title="Fit entire city perimeter on map"
            >
              <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Fit City</span>
            </button>
          )}

          <div className="hidden sm:inline-flex items-center gap-2 text-xs font-bold text-slate-600 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-200" /> City Perimeter
            </span>
            <span className="text-slate-300">•</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-2 ring-blue-200" /> Sub-Zones
            </span>
          </div>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Sidebar Controls */}
        <div className="lg:w-96 shrink-0 p-5 space-y-4 bg-white border-r border-slate-200/80 lg:overflow-y-auto shadow-xs">
          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/80 text-rose-800 text-xs font-semibold p-3.5 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Prompt if user clicked Add Sub-Zone without Boundary */}
          {boundaryPrompt && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/90 text-blue-900 text-xs p-4 space-y-2.5 shadow-2xs">
              <div className="flex items-center gap-2 font-bold text-blue-800">
                <Info className="w-4 h-4 text-blue-600" />
                <span>Boundary Required First</span>
              </div>
              <p className="text-[11px] text-blue-700 leading-relaxed font-medium">
                Sub-zones are strictly contained inside the municipal boundary. Draw the city perimeter first.
              </p>
              <button
                onClick={beginBoundary}
                className="w-full py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition active:scale-95 shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" /> Draw City Perimeter Now
              </button>
            </div>
          )}

          {isDrawing ? (
            /* Active Drawing Mode Panel */
            <div
              className={`rounded-3xl border p-5 space-y-4 shadow-xs ${
                mode === "boundary"
                  ? "border-rose-200 bg-rose-50/40"
                  : "border-blue-200 bg-blue-50/40"
              }`}
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      mode === "boundary" ? "bg-rose-500" : "bg-blue-600"
                    }`}
                  />
                  <p className="font-black text-slate-900 text-sm">
                    {mode === "boundary"
                      ? "Drawing City Boundary"
                      : editingId
                      ? "Redrawing Sub-Zone"
                      : "Drawing New Sub-Zone"}
                  </p>
                </div>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  {mode === "boundary"
                    ? "Click on the map to place corners of the city border. Drag any point to adjust position."
                    : "Click inside the red city outline to place corners. Drag any point to fine-tune shape."}
                </p>
              </div>

              {mode === "subzone" && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Sub-Zone Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Vijay Nagar, Palasia, Central"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                  />
                </div>
              )}

              {/* Status Box */}
              <div className="flex items-center justify-between text-xs font-bold text-slate-600 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <MousePointerClick className="w-3.5 h-3.5 text-slate-400" />
                  Polygon Points:
                </span>
                <span
                  className={`font-black ${
                    coords.length >= 3 ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  {coords.length === 0
                    ? "Click map to begin"
                    : `${coords.length} ${coords.length === 1 ? "point" : "points"} placed`}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={save}
                  disabled={saving || coords.length < 3 || (mode === "subzone" && !name.trim())}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-bold shadow-sm transition disabled:opacity-40 cursor-pointer ${
                    mode === "boundary"
                      ? "bg-rose-600 hover:bg-rose-700"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? "Saving..." : "Save Polygon"}
                </button>

                {coords.length > 0 && (
                  <button
                    onClick={handleUndoPoint}
                    className="px-3 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs cursor-pointer flex items-center gap-1"
                    title="Undo last placed point"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Undo
                  </button>
                )}

                <button
                  onClick={handleRedraw}
                  className="px-3 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs cursor-pointer"
                  title="Clear all points"
                >
                  <Eraser className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={cancel}
                  className="px-3 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition shadow-2xs cursor-pointer"
                  title="Cancel drawing"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* View Mode Panel */
            <>
              {/* City Boundary Box */}
              <div className="rounded-3xl border border-slate-200/80 bg-slate-50/70 p-4.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-200" />
                      <p className="font-black text-slate-900 text-sm">Main City Boundary</p>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      {hasBoundary
                        ? `${data.city.boundary.length} perimeter corners configured`
                        : "Boundary not drawn yet"}
                    </p>
                  </div>
                  <button
                    onClick={beginBoundary}
                    disabled={!mapReady || !data}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer ${
                      hasBoundary
                        ? "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 shadow-2xs"
                        : "bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
                    }`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {hasBoundary ? "Edit Boundary" : "Draw Boundary"}
                  </button>
                </div>
              </div>

              {/* Sub-Zones Section */}
              <div className="rounded-3xl border border-slate-200/80 bg-slate-50/70 p-4.5">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 ring-2 ring-blue-200" />
                    <p className="font-black text-slate-900 text-sm">
                      Sub-Zones ({data?.subZones?.length || 0})
                    </p>
                  </div>

                  {/* Add Sub-Zone Button: Beautiful Blue Color */}
                  <button
                    onClick={() => beginSubZone()}
                    disabled={!mapReady}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer shadow-xs ${
                      hasBoundary
                        ? "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20"
                        : "bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    Add Sub-Zone
                  </button>
                </div>

                {!hasBoundary && (
                  <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs font-medium mb-3 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Draw the main city boundary first. Sub-zones must reside strictly inside it.
                    </span>
                  </div>
                )}

                {data?.subZones?.length === 0 && hasBoundary && (
                  <p className="text-xs text-slate-400 font-medium py-2">
                    No sub-zones created yet. Click <strong>+ Add Sub-Zone</strong> to partition this city.
                  </p>
                )}

                <div className="space-y-2 mt-2 max-h-72 overflow-y-auto pr-1">
                  {data?.subZones?.map((z) => {
                    const isSelected = selectedZoneId === z._id;
                    return (
                      <div
                        key={z._id}
                        className={`flex items-center justify-between gap-2 rounded-2xl border px-3.5 py-3 shadow-2xs transition cursor-pointer ${
                          isSelected
                            ? "bg-blue-50/70 border-blue-300 ring-1 ring-blue-500/20"
                            : "bg-white border-slate-200/80 hover:border-blue-200 hover:bg-slate-50/50"
                        }`}
                        onClick={() => handleFocusZone(z)}
                      >
                        <div className="truncate flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                            <span className="text-xs font-bold text-slate-900 truncate block">
                              {z.name}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-semibold block mt-0.5 ml-3.5">
                            {z.coordinates?.length || 0} corners • {z.isActive === false ? "Inactive" : "Active"}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleFocusZone(z)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                            title="Focus zone on map"
                          >
                            <Crosshair className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => beginSubZone(z)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                            aria-label={`Redraw ${z.name}`}
                            title="Redraw shape"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => remove(z)}
                            className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                            aria-label={`Delete ${z.name}`}
                            title="Delete sub-zone"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Navigation Tip */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 text-slate-500 text-xs font-medium space-y-1">
                <p className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-400" /> Interactive Map Controls:
                </p>
                <p className="text-[11px] leading-relaxed">
                  Every city and sub-zone polygon is labeled with floating badges and corner vertex markers. Click any sub-zone card or map badge to instantly focus and zoom in.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Right Map View */}
        <div className="flex-1 min-h-[500px] lg:h-[calc(100vh-73px)] relative bg-slate-100">
          <div ref={mapEl} className="absolute inset-0" />
          {mapError && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-rose-800 bg-white/90 backdrop-blur-xs font-semibold text-sm">
              {mapError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
