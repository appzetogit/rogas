import React, { useState, useEffect, useCallback } from 'react';
import {
   ArrowLeft, RefreshCw, Navigation2, MapPin, Package,
   ChevronRight, CheckCircle2, Clock, Loader2, AlertCircle,
   Phone, Route, Bike
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../hooks/useDeliveryBackNavigation';
import RoutesMap from './RoutesMap';
import { useDeliveryStore } from '../store/useDeliveryStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDistance(meters) {
   if (!meters || meters === 0) return '—';
   if (meters < 1000) return `${Math.round(meters)} m`;
   return `${(meters / 1000).toFixed(1)} km`;
}

function formatTimeAgo(dateStr) {
   if (!dateStr) return '—';
   const diff = Date.now() - new Date(dateStr).getTime();
   const mins = Math.floor(diff / 60000);
   if (mins < 1) return 'just now';
   if (mins < 60) return `${mins}m ago`;
   const hrs = Math.floor(mins / 60);
   if (hrs < 24) return `${hrs}h ago`;
   return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const StopTypeChip = ({ type }) => {
   const isPickup = type === 'pickup';
   return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isPickup
         ? 'bg-[#1F7A63]/10 text-[#1F7A63] border border-[#1F7A63]/25'
         : 'bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/25'
         }`}>
         {isPickup
            ? <><Package className="w-2.5 h-2.5" /> Pickup</>
            : <><MapPin className="w-2.5 h-2.5" /> Delivery</>
         }
      </span>
   );
};

const StatusBadge = ({ status }) => {
   const map = {
      pending: { cls: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Pending' },
      completed: { cls: 'bg-green-50 text-green-700 border-green-200', label: 'Done' },
      skipped: { cls: 'bg-gray-100 text-gray-500 border-gray-200', label: 'Skipped' }
   };
   const { cls, label } = map[status] || map.pending;
   return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}>
         {label}
      </span>
   );
};

const StopCard = ({ stop, index, isFirst }) => {
   const isPickup = stop.type === 'pickup';
   const isCompleted = stop.status === 'completed';

   return (
      <motion.div
         initial={{ opacity: 0, y: 12 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ delay: index * 0.04, duration: 0.25 }}
         className={`relative bg-white rounded-2xl border transition-all ${isCompleted
            ? 'border-gray-100 opacity-60'
            : isFirst
               ? 'border-[#1F7A63] shadow-[0_0_0_1px_rgba(31,122,99,0.12),0_4px_20px_-2px_rgba(31,122,99,0.15)]'
               : 'border-gray-100 shadow-sm'
            }`}
      >
         {/* Top accent bar for first stop */}
         {isFirst && !isCompleted && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#1F7A63] rounded-t-2xl" />
         )}

         <div className="p-3">
            {/* Header row */}
            <div className="flex items-start justify-between mb-2">
               <div className="flex items-center gap-2.5">
                  {/* Stop number bubble */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 ${isCompleted
                     ? 'bg-gray-100 text-gray-400'
                     : isPickup
                        ? 'bg-[#1F7A63] text-white'
                        : 'bg-[#3B82F6] text-white'
                     }`}>
                     {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : stop.stopIndex}
                  </div>
                  <div>
                     <StopTypeChip type={stop.type} />
                     {isFirst && !isCompleted && (
                        <span className="ml-1.5 text-[9px] font-bold text-[#1F7A63] uppercase tracking-widest">
                           ← NEXT STOP
                        </span>
                     )}
                  </div>
               </div>
               <StatusBadge status={stop.status} />
            </div>

            {/* Name */}
            <h4 className="text-sm font-bold text-gray-900 leading-tight mb-1">
               {stop.name || (isPickup ? 'Vendor' : 'Customer')}
            </h4>

            {/* Address */}
            {stop.address && (
               <p className="text-xs text-gray-500 font-medium leading-relaxed mb-3 line-clamp-2">
                  <MapPin className="inline w-3 h-3 mr-0.5 text-gray-400" />
                  {stop.address}
               </p>
            )}

            {/* Phone + navigate row */}
            {stop.phone && (
               <div className="flex items-center gap-2">
                  <a
                     href={`tel:${stop.phone}`}
                     className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 active:scale-95 transition-all"
                  >
                     <Phone className="w-3 h-3 text-[#1F7A63]" />
                     Call
                  </a>
                  {stop.lat && stop.lng && (
                     <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1F7A63]/10 border border-[#1F7A63]/20 rounded-xl text-xs font-semibold text-[#1F7A63] hover:bg-[#1F7A63]/20 active:scale-95 transition-all"
                     >
                        <Navigation2 className="w-3 h-3" />
                        Navigate
                     </a>
                  )}
               </div>
            )}
         </div>
      </motion.div>
   );
};

const SkeletonCard = () => (
   <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-2.5">
         <div className="w-8 h-8 rounded-full bg-gray-100" />
         <div className="w-16 h-4 rounded-full bg-gray-100" />
      </div>
      <div className="w-3/4 h-4 rounded bg-gray-100" />
      <div className="w-full h-3 rounded bg-gray-100" />
      <div className="w-1/2 h-3 rounded bg-gray-100" />
   </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * RouteView — VRP Optimized Delivery Route for the Delivery Partner app.
 * Displays the computed stop sequence (Pickup → Delivery) for all active orders.
 * Theme: Dark header (#121212) + Emerald accent (#10B981) + White cards + Poppins font.
 */
export const RoutesView = () => {
   const goBack = useDeliveryBackNavigation();

   const [route, setRoute] = useState(null);
   const [loading, setLoading] = useState(true);
   const [recalculating, setRecalculating] = useState(false);
   const [error, setError] = useState(null);
   const [lastRefresh, setLastRefresh] = useState(null);
   const [activeTab, setActiveTab] = useState('list');

   const getRiderCoords = () => {
      const state = useDeliveryStore.getState();
      if (state.isOnline && state.riderLocation) {
         const lat = parseFloat(state.riderLocation.lat || state.riderLocation.latitude);
         const lng = parseFloat(state.riderLocation.lng || state.riderLocation.longitude);
         if (!isNaN(lat) && !isNaN(lng)) {
            return { lat, lng };
         }
      }
      return null;
   };

   // ── Fetch route ───────────────────────────────────────────────────────────
   const fetchRoute = useCallback(async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
         const res = await deliveryAPI.getRoute();
         if (res.data?.success) {
            setRoute(res.data.data?.route ?? null);
            setLastRefresh(new Date());
         } else {
            setError('Could not load your route.');
         }
      } catch (err) {
         setError('Failed to load route. Please check your connection.');
      } finally {
         setLoading(false);
      }
   }, []);

   // ── Auto-recalculate on mount ─────────────────────────────────────────────
   useEffect(() => {
      // Silently recalculate first, then show result
      const init = async () => {
         setLoading(true);
         try {
            const coords = getRiderCoords();
            const res = await deliveryAPI.recalculateRoute(coords);
            if (res.data?.success) {
               setRoute(res.data.data?.route ?? null);
               setLastRefresh(new Date());
            }
         } catch {
            // Fall back to fetching the cached route
            await fetchRoute(true);
         } finally {
            setLoading(false);
         }
      };
      init();
   }, [fetchRoute]);

   // ── Manual recalculate ────────────────────────────────────────────────────
   const handleRecalculate = async () => {
      setRecalculating(true);
      try {
         const coords = getRiderCoords();
         const res = await deliveryAPI.recalculateRoute(coords);
         if (res.data?.success) {
            setRoute(res.data.data?.route ?? null);
            setLastRefresh(new Date());
            toast.success('Route updated!');
         } else {
            toast.error('Could not recalculate route.');
         }
      } catch {
         toast.error('Recalculation failed. Please try again.');
      } finally {
         setRecalculating(false);
      }
   };

   const stops = route?.stops || [];
   const pendingStops = stops.filter(s => s.status !== 'completed');
   const completedStops = stops.filter(s => s.status === 'completed');
   const progress = stops.length > 0 ? Math.round((completedStops.length / stops.length) * 100) : 0;

   return (
      <div className="min-h-screen bg-[#F5F5F0] font-poppins pb-32">

         {/* ── Header ────────────────────────────────────────────────────── */}
         <div className="bg-[#1F7A63] px-5 py-3 flex items-center justify-between sticky top-0 z-[100] rounded-full">
            <div className="flex items-center gap-3.5 ">
               <button
                  onClick={goBack}
                  className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white border border-white/10 active:scale-90 transition-all"
               >
                  <ArrowLeft className="w-4 h-4" />
               </button>
               <div>
                  <h1 className="text-lg font-black text-white uppercase tracking-tight">My Route</h1>
                  <p className="text-[10px] font-medium text-emerald-100/70 mt-0.5">
                     {route?.zoneName ? `Zone: ${route.zoneName}` : 'Optimized delivery sequence'}
                  </p>
               </div>
            </div>

            <button
               onClick={handleRecalculate}
               disabled={recalculating || loading}
               className="flex items-center gap-1.5 px-3 py-2 bg-white/15 text-white border border-white/20 rounded-xl text-xs font-bold active:scale-90 transition-all disabled:opacity-40"
            >
               <RefreshCw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
               {recalculating ? 'Updating…' : 'Refresh'}
            </button>
         </div>

         {/* ── Content ───────────────────────────────────────────────────── */}
         <div className="px-4 pt-4 space-y-4">

            {/* ── Loading state ─────────────────────────────────────────── */}
            {loading && (
               <div className="space-y-3">
                  <div className="bg-white rounded-2xl p-5 border border-gray-100 animate-pulse space-y-3">
                     <div className="flex gap-4">
                        {[1, 2, 3].map(i => (
                           <div key={i} className="flex-1 h-14 rounded-xl bg-gray-100" />
                        ))}
                     </div>
                     <div className="h-2 bg-gray-100 rounded-full" />
                  </div>
                  {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
               </div>
            )}

            {/* ── Error state ───────────────────────────────────────────── */}
            {!loading && error && (
               <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 border border-red-200 rounded-2xl p-6 flex flex-col items-center gap-3 text-center"
               >
                  <AlertCircle className="w-10 h-10 text-red-400" />
                  <p className="text-sm font-semibold text-red-700">{error}</p>
                  <button
                     onClick={() => fetchRoute()}
                     className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl active:scale-95 transition-all"
                  >
                     Retry
                  </button>
               </motion.div>
            )}

            {/* ── Empty state ───────────────────────────────────────────── */}
            {!loading && !error && stops.length === 0 && (
               <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center py-20 gap-4 text-center"
               >
                  <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center">
                     <Route className="w-9 h-9 text-gray-300" />
                  </div>
                  <div>
                     <p className="text-sm font-bold text-gray-800">No Active Orders</p>
                     <p className="text-xs text-gray-400 font-medium mt-1 max-w-[220px] leading-relaxed">
                        Your route will appear here once orders are assigned to you.
                     </p>
                  </div>
                  <button
                     onClick={handleRecalculate}
                     className="flex items-center gap-2 px-5 py-2.5 bg-[#1F7A63] text-white text-xs font-bold rounded-xl active:scale-95 transition-all shadow-md shadow-[#1F7A63]/20"
                  >
                     <RefreshCw className="w-3.5 h-3.5" />
                     Check Again
                  </button>
               </motion.div>
            )}

            {/* ── Route content ─────────────────────────────────────────── */}
            {!loading && !error && stops.length > 0 && (
               <AnimatePresence>
                  {/* Tab Switcher */}
                  <div key="tabs" className="flex bg-gray-100/80 backdrop-blur-md rounded-2xl p-1 gap-1 border border-gray-200/50">
                     <button
                        onClick={() => setActiveTab('list')}
                        className={`flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-200 ${activeTab === 'list' ? 'bg-white text-[#1F7A63] shadow-sm' : 'text-gray-500 hover:bg-white/50'}`}
                     >
                        My Route
                     </button>
                     <button
                        onClick={() => setActiveTab('map')}
                        className={`flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-200 ${activeTab === 'map' ? 'bg-white text-[#1F7A63] shadow-sm' : 'text-gray-500 hover:bg-white/50'}`}
                     >
                        Map
                     </button>
                  </div>

                  {/* Summary card */}
                  <motion.div
                     key="summary"
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm"
                  >
                     {/* Stats row */}
                     <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="bg-[#1F7A63]/10 rounded-xl py-2 px-1 border border-[#1F7A63]/25 text-center">
                           <p className="text-[9px] font-bold text-[#1F7A63] uppercase tracking-wider mb-1">Stops</p>
                           <p className="text-xl font-black text-gray-900">{stops.length}</p>
                        </div>
                        <div className="bg-[#3B82F6]/10 rounded-xl py-2 px-1 border border-[#3B82F6]/25 text-center">
                           <p className="text-[9px] font-bold text-[#3B82F6] uppercase tracking-wider mb-1">Orders</p>
                           <p className="text-xl font-black text-gray-900">{route?.totalOrders || 0}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl py-2 px-1 border border-gray-100 text-center">
                           <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Distance</p>
                           <p className="text-xl font-black text-gray-900">
                              {formatDistance(route?.totalDistanceMeters)}
                           </p>
                        </div>
                     </div>

                     {/* Progress bar */}
                     {progress > 0 && (
                        <div className="mb-3">
                           <div className="flex justify-between items-center mb-1.5">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Progress</span>
                              <span className="text-[10px] font-bold text-[#10B981]">{progress}% complete</span>
                           </div>
                           <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <motion.div
                                 className="h-full bg-[#10B981] rounded-full"
                                 initial={{ width: 0 }}
                                 animate={{ width: `${progress}%` }}
                                 transition={{ duration: 0.6, ease: 'easeOut' }}
                              />
                           </div>
                        </div>
                     )}

                     {/* Last updated */}
                     <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium">
                        <Clock className="w-3 h-3" />
                        Route computed {formatTimeAgo(route?.generatedAt)}
                     </div>
                  </motion.div>

                  {/* Zone chip */}
                  {route?.zoneName && (
                     <motion.div
                        key="zone"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-2"
                     >
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1F7A63]/10 border border-[#1F7A63]/20 rounded-full">
                           <Bike className="w-3 h-3 text-[#1F7A63]" />
                           <span className="text-[10px] font-bold text-[#1F7A63]">
                              Serving: {route.zoneName}
                           </span>
                        </div>
                     </motion.div>
                  )}

                  {/* Tab Content */}
                  {activeTab === 'list' ? (
                     <>
                        {/* Pending stops section */}
                        {pendingStops.length > 0 && (
                           <div key="pending">
                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">
                                 Upcoming — {pendingStops.length} stops
                              </p>
                              <div className="space-y-3">
                                 {pendingStops.map((stop, idx) => (
                                    <StopCard
                                       key={`${stop.orderId}-${stop.type}`}
                                       stop={stop}
                                       index={idx}
                                       isFirst={idx === 0}
                                    />
                                 ))}
                              </div>
                           </div>
                        )}

                        {/* Completed stops section */}
                        {completedStops.length > 0 && (
                           <div key="completed">
                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1 mt-2">
                                 Completed — {completedStops.length} stops
                              </p>
                              <div className="space-y-3">
                                 {completedStops.map((stop, idx) => (
                                    <StopCard
                                       key={`${stop.orderId}-${stop.type}-done`}
                                       stop={stop}
                                       index={idx}
                                       isFirst={false}
                                    />
                                 ))}
                              </div>
                           </div>
                        )}
                     </>
                  ) : (
                     <motion.div
                        key="map"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="space-y-3"
                     >
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">
                           Map View — Sequence Route
                        </p>
                        <RoutesMap stops={stops} />
                     </motion.div>
                  )}
               </AnimatePresence>
            )}
         </div>
      </div>
   );
};

export default RoutesView;
