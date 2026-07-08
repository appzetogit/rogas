import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, Truck, Clock, CheckCircle, AlertCircle, RefreshCw, Users, Package, Filter, Route, Sun, Moon } from "lucide-react";
import { adminClient } from "@food/api/axios";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";
import { Loader } from "@googlemaps/js-api-loader";
import { subscribeAllDeliveryLocations } from "@food/realtimeTracking";

const POLL_INTERVAL = 5000;

// Status colours for driver dots
const driverStatusColor = (d) => {
  if (!d.isOnline) return "#6b7280"; // gray = offline
  if (d.availabilityStatus === "online" && !d.activeOrderId) return "#22c55e"; // green = online idle
  if (d.activeOrderId) return "#f59e0b"; // amber = delivering
  return "#3b82f6"; // blue = online
};

const getPoint = (value = {}) => {
  const lat = Number(value.lat ?? value.latitude ?? value.coordinates?.[1]);
  const lng = Number(value.lng ?? value.longitude ?? value.coordinates?.[0]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const STAT_CARDS = [
  { key: "online", label: "Online", icon: Users, color: "#22c55e" },
  { key: "active", label: "Active Drivers", icon: Truck, color: "#3b82f6" },
  { key: "pendingPickups", label: "Pending Pickups", icon: Clock, color: "#f59e0b" },
  { key: "delivered", label: "Delivered Today", icon: CheckCircle, color: "#8b5cf6" },
];

const MAP_DARK_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1f2937" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f3f4f6" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#e5e7eb" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#111827" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#374151" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#111827" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca3af" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#111827" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#4b5563" }],
  },
];

export default function LiveOperationsMap() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [filter, setFilter] = useState("all"); // all | online | delivering
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [city, setCity] = useState("");
  const intervalRef = useRef(null);

  // Google Maps related state
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const zonesPolygonsRef = useRef([]);
  const vendorMarkersRef = useRef([]);
  const driverMarkersRef = useRef([]);
  const destinationMarkersRef = useRef([]);
  const routeOverlaysRef = useRef([]);
  const infoWindowsRef = useRef([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState("");
  const [isDarkMap, setIsDarkMap] = useState(false);

  // Real-time location storage
  const realtimeDriverLocations = useRef(new Map());
  const [realtimeTrigger, setRealtimeTrigger] = useState(0);
  const initialCenteredRef = useRef(false);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await adminClient.get("/food/admin/operations/snapshot", { params: { city: city || undefined } });
      if (res?.data?.success) {
        setSnapshot(res.data.data);
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error("Live map fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [city]);

  // Initial fetch and regular polling fallback
  useEffect(() => {
    fetchSnapshot();
    intervalRef.current = setInterval(fetchSnapshot, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchSnapshot]);

  // Load Google Maps API Key and Loader
  useEffect(() => {
    const loadMaps = async () => {
      try {
        const apiKey = await getGoogleMapsApiKey();
        setGoogleMapsApiKey(apiKey || "");

        let retries = 0;
        const maxRetries = 50;
        while (!window.google && retries < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          retries++;
        }

        if (window.google && window.google.maps && window.google.maps.Map) {
          initializeMap(window.google);
          return;
        }

        if (apiKey) {
          const loader = new Loader({
            apiKey: apiKey,
            version: "weekly",
            libraries: ["places", "drawing", "geometry"],
          });
          const google = await loader.load();
          initializeMap(google);
        } else {
          setMapLoading(false);
        }
      } catch (err) {
        console.error("Error loading Google Maps in live operations map:", err);
        setMapLoading(false);
      }
    };
    loadMaps();
  }, []);

  // Initialize the Map instance
  const initializeMap = (google) => {
    if (!mapRef.current) return;
    const initialLocation = { lat: 20.5937, lng: 78.9629 }; // Centered on India by default
    const map = new google.maps.Map(mapRef.current, {
      center: initialLocation,
      zoom: 5,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      scrollwheel: true,
      styles: isDarkMap ? MAP_DARK_STYLES : [],
      gestureHandling: "greedy",
    });
    mapInstanceRef.current = map;
    setMapLoading(false);
  };

  // Subscribe to real-time location stream from Firebase Realtime DB
  useEffect(() => {
    const unsubscribeRealtime = subscribeAllDeliveryLocations(
      (deliveryNode) => {
        const entries = Object.entries(deliveryNode || {});
        console.debug(`[LiveMap] Firebase snapshot - ${entries.length} drivers`);
        entries.forEach(([deliveryId, payload]) => {
          const lat = Number(payload?.lat ?? payload?.location?.lat);
          const lng = Number(payload?.lng ?? payload?.location?.lng);
          // Respect the actual isOnline flag written by the driver app
          const isOnline =
            payload?.isOnline === true ||
            payload?.isOnline === "true" ||
            payload?.isOnline === 1 ||
            payload?.isOnline === "1" ||
            payload?.status === "online" ||
            payload?.status === "busy";
          const heading = Number(payload?.heading ?? payload?.location?.heading) || 0;
          const speed = Number(payload?.speed ?? payload?.location?.speed) || 0;
          const lastUpdated = Number(payload?.timestamp ?? payload?.last_updated) || Date.now();

          // Store even if offline — so we can show last known location
          if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
            const entry = { lat, lng, isOnline, heading, speed, lastUpdated };
            realtimeDriverLocations.current.set(String(deliveryId), entry);
            console.debug(`[LiveMap] Firebase driver ${deliveryId}: lat=${lat}, lng=${lng}, isOnline=${isOnline}`);
          }
        });
        setRealtimeTrigger((prev) => prev + 1);
      },
      (error) => {
        console.error("Firebase realtime operations listener failed:", error);
      }
    );

    return () => {
      if (typeof unsubscribeRealtime === "function") unsubscribeRealtime();
    };
  }, []);

  // Merge snapshot drivers with realtime Firebase data
  const matchedDbIds = new Set();
  const mergedDrivers = (snapshot?.drivers || []).map((d) => {
    const idStr = String(d._id);
    const realtime = realtimeDriverLocations.current.get(idStr);

    const isDbOnline = d.availabilityStatus === "online" || d.isOnline === true;

    if (realtime) {
      matchedDbIds.add(idStr);
      // Use Firebase isOnline if driver sent it, otherwise trust DB flag
      const isOnline = realtime.isOnline || isDbOnline;
      return {
        ...d,
        isOnline,
        lat: realtime.lat,
        lng: realtime.lng,
        lastLat: realtime.lat,
        lastLng: realtime.lng,
        availabilityStatus: isOnline ? "online" : "offline",
        lastLocationAt: new Date(realtime.lastUpdated),
      };
    }
    // No Firebase data — fall back to DB values
    return {
      ...d,
      lat: d.lastLat,
      lng: d.lastLng,
      isOnline: isDbOnline,
      availabilityStatus: isDbOnline ? "online" : "offline",
    };
  });

  // Include any extra online drivers from Firebase that are not in the DB snapshot
  // REMOVED: This was causing ghost/deleted test drivers from Firebase to show up on the map.
  // We should ONLY show drivers that actually exist in the database snapshot.
  /*
  realtimeDriverLocations.current.forEach((realtime, driverId) => {
    if (!matchedDbIds.has(driverId)) {
      mergedDrivers.push({
        _id: driverId,
        name: `Driver (${driverId.substring(0, 6)})`,
        phone: "N/A",
        vehicleType: "Bike",
        // Treat any driver sending realtime data as online
        isOnline: true,
        lat: realtime.lat,
        lng: realtime.lng,
        lastLat: realtime.lat,
        lastLng: realtime.lng,
        availabilityStatus: "online",
        lastLocationAt: new Date(realtime.lastUpdated),
        deliveriesToday: 0,
        earningsToday: 0,
        rating: 5.0,
        city: "Indore",
        deliveredOrdersCount: 0,
        assignedDeliveries: [],
        routePoints: [],
      });
    }
  });
  */

  const filteredDrivers = mergedDrivers.filter((d) => {
    if (filter === "online") return d.isOnline;
    if (filter === "delivering") return d.activeOrderId;
    return true;
  });

  // Re-draw markers and polygons on the Google Map whenever data changes
  useEffect(() => {
    if (mapLoading || !mapInstanceRef.current || !window.google) return;

    const google = window.google;

    // 1. Clear old overlays
    zonesPolygonsRef.current.forEach((p) => p.setMap(null));
    zonesPolygonsRef.current = [];

    vendorMarkersRef.current.forEach((m) => m.setMap(null));
    vendorMarkersRef.current = [];

    driverMarkersRef.current.forEach((m) => m.setMap(null));
    driverMarkersRef.current = [];

    destinationMarkersRef.current.forEach((m) => m.setMap(null));
    destinationMarkersRef.current = [];

    routeOverlaysRef.current.forEach((overlay) => overlay.setMap(null));
    routeOverlaysRef.current = [];

    infoWindowsRef.current.forEach((iw) => iw.close());
    infoWindowsRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    let hasCoords = false;

    // 2. Draw Zones
    const zoneColors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
    (snapshot?.zones || []).forEach((zone, index) => {
      if (!zone.coordinates || zone.coordinates.length < 3) return;
      const path = zone.coordinates
        .map((coord) => {
          const lat = coord.latitude || coord.lat;
          const lng = coord.longitude || coord.lng;
          if (lat == null || lng == null) return null;
          const latLng = new google.maps.LatLng(lat, lng);
          bounds.extend(latLng);
          hasCoords = true;
          return latLng;
        })
        .filter(Boolean);

      if (path.length < 3) return;

      const color = zoneColors[index % zoneColors.length];
      const polygon = new google.maps.Polygon({
        paths: path,
        strokeColor: color,
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.2,
        map: mapInstanceRef.current,
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 8px; color: #1e293b; font-family: sans-serif; font-size: 13px;">
            <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: bold; color: #0f172a;">Zone: ${zone.name || zone.zoneName}</h4>
            <p style="margin: 0;">Status: Active</p>
          </div>
        `,
      });

      polygon.addListener("click", (e) => {
        infoWindowsRef.current.forEach((iw) => iw.close());
        infoWindow.setPosition(e.latLng);
        infoWindow.open(mapInstanceRef.current);
        infoWindowsRef.current.push(infoWindow);
      });

      zonesPolygonsRef.current.push(polygon);
    });

    // 3. Draw Vendor/Restaurant locations
    (snapshot?.vendors || []).forEach((vendor) => {
      const lat = Number(vendor.location?.latitude ?? vendor.location?.coordinates?.[1]);
      const lng = Number(vendor.location?.longitude ?? vendor.location?.coordinates?.[0]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const marker = new google.maps.Marker({
        position: { lat, lng },
        map: mapInstanceRef.current,
        title: vendor.restaurantName,
        icon: {
          path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
          fillColor: "#f97316", // Dark orange color for vendor
          fillOpacity: 1.0,
          strokeWeight: 1.5,
          strokeColor: "#ffffff",
          scale: 1.8, // Increased size for vendor point
          anchor: new google.maps.Point(12, 22),
        },
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 8px; color: #1e293b; font-family: sans-serif; font-size: 13px;">
            <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: bold; color: #0f172a;">${escapeHtml(vendor.restaurantName)}</h4>
            <p style="margin: 0 0 4px 0;">Area: ${escapeHtml(vendor.area || "-")}</p>
            <p style="margin: 0;">Phone: ${escapeHtml(vendor.ownerPhone || "-")}</p>
          </div>
        `,
      });

      marker.addListener("click", () => {
        infoWindowsRef.current.forEach((iw) => iw.close());
        infoWindow.open(mapInstanceRef.current, marker);
        infoWindowsRef.current.push(infoWindow);
      });

      vendorMarkersRef.current.push(marker);
      bounds.extend(new google.maps.LatLng(lat, lng));
      hasCoords = true;
    });

    // 4. Draw assigned delivery destinations
    filteredDrivers.forEach((driver) => {
      (driver.assignedDeliveries || []).forEach((delivery, index) => {
        const point = getPoint(delivery.destination);
        if (!point) return;

        const isSelected = selectedDriver?._id === driver._id;
        const marker = new google.maps.Marker({
          position: point,
          map: mapInstanceRef.current,
          title: `${delivery.orderId || "Order"} destination`,
          zIndex: isSelected ? 90 : 20,
          icon: {
            path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
            fillColor: isSelected ? "#0ea5e9" : "#94a3b8",
            fillOpacity: isSelected ? 1 : 0.82,
            strokeWeight: 2,
            strokeColor: "#ffffff",
            scale: isSelected ? 1.35 : 1.05,
            anchor: new google.maps.Point(12, 22),
          },
          label: isSelected
            ? {
              text: String(index + 1),
              color: "#ffffff",
              fontSize: "11px",
              fontWeight: "700",
            }
            : null,
        });

        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 8px; color: #1e293b; font-family: sans-serif; font-size: 13px; max-width: 240px;">
              <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: bold; color: #0f172a;">${escapeHtml(delivery.orderId || "Assigned order")}</h4>
              <p style="margin: 0 0 4px 0;">Driver: ${escapeHtml(driver.name || "-")}</p>
              <p style="margin: 0 0 4px 0;">Status: ${escapeHtml(delivery.status || "-")}</p>
              <p style="margin: 0;">${escapeHtml(delivery.address || "Delivery destination")}</p>
            </div>
          `,
        });

        marker.addListener("click", () => {
          infoWindowsRef.current.forEach((iw) => iw.close());
          infoWindow.open(mapInstanceRef.current, marker);
          infoWindowsRef.current.push(infoWindow);
          setSelectedDriver(driver);
        });

        destinationMarkersRef.current.push(marker);
        bounds.extend(new google.maps.LatLng(point.lat, point.lng));
        hasCoords = true;
      });
    });

    // 5. Draw Driver locations (filtered by view status filter)
    filteredDrivers.forEach((driver) => {
      const lat = Number(driver.lat ?? driver.lastLat);
      const lng = Number(driver.lng ?? driver.lastLng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const isOnline = driver.isOnline;
      const color = driverStatusColor(driver);

      let iconConfig;
      if (isOnline) {
        iconConfig = {
          url: "/MapRider.png",
          anchor: new google.maps.Point(25, 25),
          scaledSize: new google.maps.Size(50, 50),
        };
      } else {
        iconConfig = {
          path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
          fillColor: color,
          fillOpacity: 1.0,
          strokeWeight: 2,
          strokeColor: "#ffffff",
          scale: 1.4,
          anchor: new google.maps.Point(12, 22),
        };
      }

      const marker = new google.maps.Marker({
        position: { lat, lng },
        map: mapInstanceRef.current,
        title: driver.name,
        zIndex: 100,
        icon: iconConfig,
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 8px; color: #1e293b; font-family: sans-serif; font-size: 13px; min-width: 220px;">
            <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: bold; color: #0f172a;">${escapeHtml(driver.name || "Delivery Partner")}</h4>
            <p style="margin: 0 0 4px 0;">Phone: ${escapeHtml(driver.phone || "-")}</p>
            <p style="margin: 0 0 4px 0;">Vehicle: ${escapeHtml(driver.vehicleType || "Bike")}</p>
            <p style="margin: 0;">Status: <span style="color: ${color}; font-weight: bold;">${driver.isOnline ? "Online" : "Offline"}</span></p>
            <p style="margin: 4px 0 0 0;">Delivered: ${Number(driver.deliveredOrdersCount ?? driver.deliveriesToday ?? 0)}</p>
            <p style="margin: 4px 0 0 0;">Assigned: ${(driver.assignedDeliveries || []).length}</p>
          </div>
        `,
      });

      marker.addListener("click", () => {
        infoWindowsRef.current.forEach((iw) => iw.close());
        infoWindow.open(mapInstanceRef.current, marker);
        infoWindowsRef.current.push(infoWindow);
        setSelectedDriver(driver);
      });

      driverMarkersRef.current.push(marker);
      bounds.extend(new google.maps.LatLng(lat, lng));
      hasCoords = true;
    });

    // 6. Draw the selected delivery partner route and pending stops
    const routeDriver = filteredDrivers.find((driver) => driver._id === selectedDriver?._id);
    const routePoints = (routeDriver?.routePoints || [])
      .map((point) => {
        const coords = getPoint(point);
        return coords ? { ...point, ...coords } : null;
      })
      .filter((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng));

    if (routePoints.length >= 2) {
      const polyline = new google.maps.Polyline({
        path: routePoints.map(({ lat, lng }) => ({ lat, lng })),
        geodesic: true,
        strokeColor: "#0ea5e9",
        strokeOpacity: 0.9,
        strokeWeight: 5,
        map: mapInstanceRef.current,
        zIndex: 60,
      });
      routeOverlaysRef.current.push(polyline);

      routePoints.forEach((point, index) => {
        const marker = new google.maps.Marker({
          position: { lat: point.lat, lng: point.lng },
          map: mapInstanceRef.current,
          title: point.label || point.type,
          zIndex: 110,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: point.type === "pickup" ? "#f97316" : point.type === "dropoff" ? "#0ea5e9" : "#22c55e",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: 7,
          },
          label: {
            text: String(index + 1),
            color: "#ffffff",
            fontSize: "10px",
            fontWeight: "700",
          },
        });
        routeOverlaysRef.current.push(marker);
        bounds.extend(new google.maps.LatLng(point.lat, point.lng));
        hasCoords = true;
      });
    }

    // 7. Auto-fit bounds once
    if (hasCoords && mapInstanceRef.current && !initialCenteredRef.current) {
      mapInstanceRef.current.fitBounds(bounds);
      initialCenteredRef.current = true;
    }
  }, [snapshot, mapLoading, filter, realtimeTrigger, selectedDriver?._id]);

  const handleSelectDriver = (driver) => {
    setSelectedDriver(selectedDriver?._id === driver._id ? null : driver);
    if (driver && mapInstanceRef.current && window.google) {
      const lat = Number(driver.lat ?? driver.lastLat);
      const lng = Number(driver.lng ?? driver.lastLng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        mapInstanceRef.current.panTo({ lat, lng });
        mapInstanceRef.current.setZoom(15);
      }
    }
  };

  const stats = snapshot?.stats || {};

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#2B2B2B]">
      {/* Header */}
      <div className="bg-[#1F7A63] border-b border-[#135444] px-6 py-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Live Operations Map</h1>
              <p className="text-sm text-emerald-100">
                {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Loading…"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              placeholder="Filter by city…"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/25 text-white placeholder-emerald-100/60 focus:outline-none focus:ring-2 focus:ring-white/50 text-sm"
            />
            <button
              onClick={fetchSnapshot}
              className="p-2 rounded-lg bg-white/10 border border-white/25 hover:bg-white/20 text-white transition"
              title="Refresh now"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsDarkMap((prev) => !prev)}
              className="p-2 rounded-lg bg-white/10 border border-white/25 hover:bg-white/20 text-white transition"
              title="Toggle Dark Map"
            >
              {isDarkMap ? <Moon className="w-4 h-4 text-white" /> : <Sun className="w-4 h-4 text-yellow-300" />}
            </button>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="px-6 py-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="bg-white rounded-xl p-4 border border-gray-200 flex items-center gap-3 shadow-xs">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#2B2B2B]">{stats[key] ?? "-"}</p>
              <p className="text-xs text-gray-500 font-medium">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 pb-6 flex gap-6">
        {/* Google Map Container */}
        <div className="flex-1 bg-white rounded-2xl border border-gray-200 overflow-hidden min-h-[550px] relative flex flex-col p-6 shadow-xs">
          <div className="mb-4 flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            {["all", "online", "delivering"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
                  filter === f
                    ? "bg-[#1F7A63] text-white border-[#1F7A63]"
                    : "bg-[#F5F5F0] text-gray-600 border-gray-200 hover:bg-gray-200"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            {selectedDriver && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1F7A63]/10 text-[#1F7A63] text-xs font-bold border border-[#1F7A63]/25">
                <Route className="w-3.5 h-3.5" />
                Route: {selectedDriver.name || "Driver"}
              </span>
            )}
            <span className="ml-auto text-sm text-gray-500 font-semibold">{filteredDrivers.length} drivers</span>
          </div>

          {/* Google Map Ref Wrapper */}
          <div className="relative flex-1 bg-[#F5F5F0] rounded-xl overflow-hidden border border-gray-200 min-h-[420px]">
            <div ref={mapRef} className="w-full h-full" style={{ minHeight: "420px" }} />

            {/* Map Legend */}
            <div className="absolute bottom-3 right-3 bg-white/95 rounded-lg p-2.5 text-xs space-y-1.5 border border-gray-200 shadow-md z-10 font-sans text-gray-700">
              {[
                { color: "#22c55e", label: "Online (idle)" },
                { color: "#f59e0b", label: "Delivering" },
                { color: "#3b82f6", label: "Online" },
                { color: "#6b7280", label: "Offline (last location)" },
                { color: "#f97316", label: "Vendor Location" },
                { color: "#0ea5e9", label: "Assigned destination / route" },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                  <span className="text-[#2B2B2B] font-medium">{label}</span>
                </div>
              ))}
            </div>

            {/* Loading Overlay */}
            {(loading || mapLoading) && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                <div className="text-center">
                  <div className="animate-spin w-8 h-8 border-2 border-[#1F7A63] border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-sm text-gray-600 font-bold">Loading Operations Map...</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Driver Panel */}
        <div className="w-85 bg-white rounded-2xl border border-gray-200 flex flex-col max-h-[620px] shadow-xs">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-bold text-[#2B2B2B] flex items-center gap-2 text-sm uppercase tracking-wider">
              <Truck className="w-4 h-4 text-[#1F7A63]" />
              Active Drivers
              <span className="ml-auto text-xs font-bold text-gray-600 bg-[#F5F5F0] border border-gray-200 px-2 py-0.5 rounded-full">
                {filteredDrivers.length}
              </span>
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredDrivers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Package className="w-8 h-8 mb-2" />
                <p className="text-sm font-medium">No drivers found</p>
              </div>
            ) : (
              filteredDrivers.map((d) => (
                <button
                  key={d._id}
                  onClick={() => handleSelectDriver(d)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-[#F5F5F0]/65 transition ${
                    selectedDriver?._id === d._id ? "bg-[#1F7A63]/8 border-l-4 border-l-[#1F7A63]" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm" style={{ background: driverStatusColor(d) }}>
                      {(d.name || "D").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#2B2B2B] truncate">{d.name || "Unknown"}</p>
                      <p className="text-xs text-gray-500 font-medium">{d.city} · {d.vehicleType || "bike"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-black text-[#2B2B2B] text-right">{d.deliveredOrdersCount ?? d.deliveriesToday ?? 0}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">delivered</p>
                    </div>
                  </div>
                  {selectedDriver?._id === d._id && (
                    <div className="mt-2.5 pt-2.5 border-t border-gray-100 text-xs text-gray-600 space-y-1.5 font-medium animate-fadeIn">
                      <p className="flex items-center gap-1.5">📞 <span className="text-[#2B2B2B] font-semibold">{d.phone || "-"}</span></p>
                      <p className="flex items-center gap-1.5">⭐ Rating: <span className="text-[#2B2B2B] font-semibold">{d.rating?.toFixed(1) || "N/A"}</span></p>
                      <p className="flex items-center gap-1.5">💰 Earned today: <span className="text-[#2B2B2B] font-semibold">PLN {(d.earningsToday || 0).toFixed(2)}</span></p>
                      <p className="flex items-center gap-1.5">📦 Status: <span className="font-semibold" style={{ color: driverStatusColor(d) }}>{d.availabilityStatus || "offline"}</span></p>
                      <p className="flex items-center gap-1.5">Total delivered: <span className="text-[#2B2B2B] font-semibold">{d.deliveredOrdersCount ?? d.deliveriesToday ?? 0}</span></p>
                      <p className="flex items-center gap-1.5">Assigned deliveries: <span className="text-[#2B2B2B] font-semibold">{(d.assignedDeliveries || []).length}</span></p>
                      {(d.assignedDeliveries || []).slice(0, 4).map((delivery, idx) => (
                        <div key={delivery._id || delivery.orderId || idx} className="mt-1.5 rounded-xl bg-[#F5F5F0] border border-gray-100 p-2.5">
                          <p className="font-bold text-[#2B2B2B]">{delivery.orderId || `Order ${idx + 1}`} <span className="text-[#1F7A63] text-[10px] uppercase font-extrabold ml-1.5">- {delivery.status}</span></p>
                          <p className="text-gray-500 text-[11px] mt-0.5 truncate">{delivery.vendor?.name || ""} to {delivery.address || "destination"}</p>
                        </div>
                      ))}
                      {d.lastLocationAt && (
                        <p className="text-[10px] text-gray-400 mt-1 font-sans">Last Loc: {new Date(d.lastLocationAt).toLocaleTimeString()}</p>
                      )}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Pending Pickups Summary */}
          {(snapshot?.pendingPickups || []).length > 0 && (
            <div className="p-4 border-t border-gray-100 bg-[#F5F5F0]/30 rounded-b-2xl">
              <p className="text-xs font-bold text-orange-600 mb-2 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {snapshot.pendingPickups.length} PENDING PICKUPS
              </p>
              {snapshot.pendingPickups.slice(0, 3).map((o) => (
                <div key={o._id} className="text-xs text-gray-500 py-1 border-b border-gray-100/50 last:border-0">
                  <span className="text-[#2B2B2B] font-semibold">{o.restaurantId?.restaurantName || "Restaurant"}</span>
                  <span className="ml-2 text-orange-600 font-medium">({o.orderStatus})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
