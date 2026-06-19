import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, Truck, Clock, CheckCircle, AlertCircle, RefreshCw, Users, Package, Filter } from "lucide-react";
import { adminClient } from "@food/api/axios";

const POLL_INTERVAL = 8000; // 8s polling fallback

// Status colours for driver dots
const driverStatusColor = (d) => {
  if (!d.isOnline) return "#6b7280"; // gray = offline
  if (d.availabilityStatus === "online" && !d.activeOrderId) return "#22c55e"; // green = online idle
  if (d.activeOrderId) return "#f59e0b"; // amber = delivering
  return "#3b82f6"; // blue = online
};

const STAT_CARDS = [
  { key: "online", label: "Online", icon: Users, color: "#22c55e" },
  { key: "active", label: "Active Drivers", icon: Truck, color: "#3b82f6" },
  { key: "pendingPickups", label: "Pending Pickups", icon: Clock, color: "#f59e0b" },
  { key: "delivered", label: "Delivered Today", icon: CheckCircle, color: "#8b5cf6" },
];

export default function LiveOperationsMap() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [filter, setFilter] = useState("all"); // all | online | delivering
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [city, setCity] = useState("");
  const intervalRef = useRef(null);

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

  useEffect(() => {
    fetchSnapshot();
    intervalRef.current = setInterval(fetchSnapshot, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchSnapshot]);

  const filteredDrivers = (snapshot?.drivers || []).filter((d) => {
    if (filter === "online") return d.isOnline;
    if (filter === "delivering") return d.activeOrderId;
    return true;
  });

  const stats = snapshot?.stats || {};

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Live Operations Map</h1>
              <p className="text-sm text-gray-400">
                {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Loadingâ€¦"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              placeholder="Filter by cityâ€¦"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={fetchSnapshot}
              className="p-2 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 transition"
              title="Refresh now"
            >
              <RefreshCw className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="px-6 py-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="bg-gray-900 rounded-xl p-4 border border-gray-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${color}22` }}>
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats[key] ?? "-"}</p>
              <p className="text-xs text-gray-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 pb-6 flex gap-6">
        {/* Map placeholder â€” in production wire Google Maps or Leaflet here */}
        <div className="flex-1 bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden min-h-[500px] relative flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="flex-1 p-6">
              <div className="mb-4 flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                {["all", "online", "delivering"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition ${filter === f ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
                <span className="ml-auto text-sm text-gray-400">{filteredDrivers.length} drivers</span>
              </div>

              {/* Visual dot grid â€” replace with actual Map component in production */}
              <div className="relative bg-gray-800 rounded-xl w-full h-[380px] overflow-hidden border border-gray-700">
                <div className="absolute inset-0 opacity-10" style={{
                  backgroundImage: "repeating-linear-gradient(0deg, #4B5563 0, #4B5563 1px, transparent 0, transparent 50%), repeating-linear-gradient(-90deg, #4B5563 0, #4B5563 1px, transparent 0, transparent 50%)",
                  backgroundSize: "40px 40px"
                }} />
                <div className="absolute top-4 left-4 right-4 text-xs text-gray-500 font-medium">
                  ðŸ—ºï¸ Connect Google Maps API or Leaflet here â€” driver coordinates available in snapshot data
                </div>
                {filteredDrivers.map((driver, idx) => (
                  <button
                    key={driver._id}
                    onClick={() => setSelectedDriver(driver._id === selectedDriver?._id ? null : driver)}
                    style={{
                      position: "absolute",
                      left: `${15 + (idx % 10) * 8}%`,
                      top: `${20 + Math.floor(idx / 10) * 20}%`,
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: driverStatusColor(driver),
                      border: "2px solid rgba(255,255,255,0.6)",
                      cursor: "pointer",
                      boxShadow: selectedDriver?._id === driver._id ? "0 0 0 4px rgba(59,130,246,0.5)" : undefined,
                    }}
                    title={`${driver.name} â€” ${driver.availabilityStatus}`}
                  />
                ))}
                {/* Pending pickup markers */}
                {(snapshot?.pendingPickups || []).slice(0, 6).map((order, idx) => (
                  <div
                    key={order._id}
                    style={{
                      position: "absolute",
                      right: `${10 + (idx % 3) * 12}%`,
                      bottom: `${10 + Math.floor(idx / 3) * 20}%`,
                      width: 16,
                      height: 16,
                      borderRadius: "2px",
                      background: "#f97316",
                      border: "2px solid rgba(255,255,255,0.5)",
                    }}
                    title={`Pending pickup: ${order.orderId}`}
                  />
                ))}
                {/* Legend */}
                <div className="absolute bottom-3 right-3 bg-gray-900/90 rounded-lg p-2 text-xs space-y-1">
                  {[
                    { color: "#22c55e", label: "Online (idle)" },
                    { color: "#f59e0b", label: "Delivering" },
                    { color: "#6b7280", label: "Offline" },
                    { color: "#f97316", label: "Pending pickup" },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                      <span className="text-gray-300">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Driver Panel */}
        <div className="w-80 bg-gray-900 rounded-2xl border border-gray-800 flex flex-col">
          <div className="p-4 border-b border-gray-800">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-400" />
              Active Drivers
              <span className="ml-auto text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">
                {filteredDrivers.length}
              </span>
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredDrivers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <Package className="w-8 h-8 mb-2" />
                <p className="text-sm">No drivers found</p>
              </div>
            ) : (
              filteredDrivers.map((d) => (
                <button
                  key={d._id}
                  onClick={() => setSelectedDriver(selectedDriver?._id === d._id ? null : d)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-800 hover:bg-gray-800/50 transition ${selectedDriver?._id === d._id ? "bg-blue-900/20 border-l-2 border-l-blue-500" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: driverStatusColor(d) }}>
                      {(d.name || "D").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{d.name || "Unknown"}</p>
                      <p className="text-xs text-gray-400">{d.city} Â· {d.vehicleType || "bike"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white text-right">{d.deliveriesToday || 0}</p>
                      <p className="text-xs text-gray-500">today</p>
                    </div>
                  </div>
                  {selectedDriver?._id === d._id && (
                    <div className="mt-2 pt-2 border-t border-gray-700 text-xs text-gray-300 space-y-1">
                      <p>ðŸ“ž {d.phone || "-"}</p>
                      <p>â­ Rating: {d.rating?.toFixed(1) || "N/A"}</p>
                      <p>ðŸ’° Earned today: PLN {(d.earningsToday || 0).toFixed(2)}</p>
                      <p>ðŸ“¦ Status: <span className="font-semibold" style={{ color: driverStatusColor(d) }}>{d.availabilityStatus || "offline"}</span></p>
                    </div>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Pending Pickups Summary */}
          {(snapshot?.pendingPickups || []).length > 0 && (
            <div className="p-4 border-t border-gray-800">
              <p className="text-xs font-semibold text-orange-400 mb-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {snapshot.pendingPickups.length} pending pickups
              </p>
              {snapshot.pendingPickups.slice(0, 3).map((o) => (
                <div key={o._id} className="text-xs text-gray-400 py-1 border-b border-gray-800/50">
                  <span className="text-gray-300">{o.restaurantId?.restaurantName || "Restaurant"}</span>
                  <span className="ml-2 text-orange-400">{o.orderStatus}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
