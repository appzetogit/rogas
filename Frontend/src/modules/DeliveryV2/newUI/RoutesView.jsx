import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
   ArrowLeft, RefreshCw, Navigation2, MapPin, Package,
   ChevronRight, CheckCircle2, Clock, Loader2, AlertCircle,
   Phone, Route, Bike, UtensilsCrossed, ChefHat, Flame, Star, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { dmbDeliveryAPI } from '../../../services/api';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../hooks/useDeliveryBackNavigation';
import RoutesMap from './RoutesMap';
import { useDeliveryStore } from '../store/useDeliveryStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SLOT_ICONS = {
   breakfast: '🌅',
   lunch: '☀️',
   dinner: '🌙'
};

const SLOT_COLORS = {
   breakfast: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', accent: '#F97316' },
   lunch: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', accent: '#D97706' },
   dinner: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', accent: '#4F46E5' }
};

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

// ─── Vendor Status Badge ──────────────────────────────────────────────────────
const VendorStatusBadge = ({ status }) => {
   const map = {
      scheduled: { cls: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Pending', icon: <Clock className="w-2.5 h-2.5" /> },
      preparing: { cls: 'bg-orange-50 text-orange-700 border-orange-200', label: 'Preparation 🔥', icon: <Flame className="w-2.5 h-2.5" /> },
      ready: { cls: 'bg-[#1F7A63]/10 text-[#1F7A63] border-[#1F7A63]/25', label: 'Ready ✓', icon: <CheckCircle2 className="w-2.5 h-2.5" /> }
   };
   const { cls, label, icon } = map[status] || map.scheduled;
   return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${cls}`}>
         {icon}{label}
      </span>
   );
};

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

// ─── Stop Card ─────────────────────────────────────────────────────────────────
const StopCard = ({ stop, index, isFirst, onClick, isSlotActive }) => {
   const isPickup = stop.type === 'pickup';
   const isCompleted = stop.status === 'completed';
   const isLocked = !isSlotActive; // between slots — show but locked

   return (
      <motion.div
         initial={{ opacity: 0, y: 12 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ delay: index * 0.04, duration: 0.25 }}
         onClick={onClick}
         className={`relative bg-white rounded-2xl border transition-all cursor-pointer ${isCompleted
            ? 'border-gray-100 opacity-60'
            : isLocked
               ? 'border-gray-100 opacity-80 shadow-sm'
               : isFirst
                  ? 'border-[#1F7A63] shadow-[0_0_0_1px_rgba(31,122,99,0.12),0_4px_20px_-2px_rgba(31,122,99,0.15)]'
                  : 'border-gray-100 shadow-sm hover:border-[#1F7A63]/30'
            }`}
      >
         {/* Top accent bar for first stop */}
         {isFirst && !isCompleted && isSlotActive && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#1F7A63] rounded-t-2xl" />
         )}

         {/* Lock overlay for between-slot */}
         {isLocked && (
            <div className="absolute top-2 right-2 z-10">
               <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 rounded-full text-[9px] font-bold text-gray-500">
                  🔒 Preview
               </span>
            </div>
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
                     {isFirst && !isCompleted && isSlotActive && (
                        <span className="ml-1.5 text-[9px] font-bold text-[#1F7A63] uppercase tracking-widest">
                           ← NEXT STOP
                        </span>
                     )}
                  </div>
               </div>
               {/* Show vendor status badge or regular status badge */}
               {isPickup && stop.vendorStatus
                  ? <VendorStatusBadge status={stop.vendorStatus} />
                  : <StatusBadge status={stop.status} />
               }
            </div>

            {/* Name */}
            <h4 className="text-sm font-bold text-gray-900 leading-tight mb-1">
               {stop.name || ''}
            </h4>

            {/* Order count for vendor stops */}
            {isPickup && stop.orderCount > 0 && (
               <p className="text-[10px] font-bold text-[#1F7A63] mb-1">
                  📦 {stop.orderCount} meal box{stop.orderCount > 1 ? 'es' : ''} to collect
               </p>
            )}

            {/* Address */}
            {stop.address && (
               <p className="text-xs text-gray-500 font-medium leading-relaxed mb-3 line-clamp-2">
                  <MapPin className="inline w-3 h-3 mr-0.5 text-gray-400" />
                  {stop.address}
               </p>
            )}

            {/* Phone + navigate row (only show when slot is active) */}
            {isSlotActive && stop.phone && (
               <div className="flex items-center gap-2">
                  <a
                     href={`tel:${stop.phone}`}
                     onClick={(e) => e.stopPropagation()}
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
                        onClick={(e) => e.stopPropagation()}
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

// ─── Slot Timing Modal (shown between slots when clicking a stop) ──────────────
const SlotTimingModal = ({ stop, slot, nextSlotStartTime, onClose }) => {
   const slotLabel = slot ? (slot.charAt(0).toUpperCase() + slot.slice(1)) : 'Next';
   const slotIcon = SLOT_ICONS[slot] || '🕐';
   return (
      <motion.div
         initial={{ opacity: 0 }}
         animate={{ opacity: 1 }}
         exit={{ opacity: 0 }}
         className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end justify-center px-4 pb-6"
         onClick={onClose}
      >
         <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
         >
            {/* Close button */}
            <div className="flex justify-between items-start mb-4">
               <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-2xl">
                  {slotIcon}
               </div>
               <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <X className="w-4 h-4 text-gray-500" />
               </button>
            </div>

            <h3 className="text-base font-black text-gray-900 mb-1">
               {slotLabel} Slot Preview
            </h3>
            <p className="text-xs text-gray-500 font-medium mb-4 leading-relaxed">
               This stop is scheduled for the <strong>{slotLabel}</strong> meal slot.
               The slot opens at <span className="text-[#1F7A63] font-black">{nextSlotStartTime || '—'}</span>.
            </p>

            {/* Stop info */}
            <div className="bg-[#F5F5F0] rounded-2xl p-3 mb-4">
               <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${stop?.type === 'pickup' ? 'bg-[#1F7A63] text-white' : 'bg-[#3B82F6] text-white'}`}>
                     {stop?.stopIndex}
                  </div>
                  <div>
                     <p className="text-xs font-black text-gray-900">{stop?.name || 'Stop'}</p>
                     {stop?.address && <p className="text-[10px] text-gray-500 font-medium">{stop.address}</p>}
                  </div>
               </div>
               {stop?.type === 'pickup' && stop?.vendorStatus && (
                  <div className="mt-2 flex items-center gap-2">
                     <span className="text-[10px] font-bold text-gray-500">Vendor Status:</span>
                     <VendorStatusBadge status={stop.vendorStatus} />
                  </div>
               )}
            </div>

            <p className="text-[10px] text-center text-gray-400 font-medium">
               Come back at {nextSlotStartTime || 'the scheduled time'} to start your route
            </p>
         </motion.div>
      </motion.div>
   );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const RoutesView = ({ onSelectStop }) => {
   const goBack = useDeliveryBackNavigation();

   const [routeData, setRouteData] = useState(null);
   const [loading, setLoading] = useState(true);
   const [refreshing, setRefreshing] = useState(false);
   const [error, setError] = useState(null);
   const [lastRefresh, setLastRefresh] = useState(null);
   const [activeTab, setActiveTab] = useState('list');
   const [timingModal, setTimingModal] = useState(null); // { stop }

   // ── Fetch slot-based route ─────────────────────────────────────────────────
   const fetchSlotRoute = useCallback(async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
         const res = await dmbDeliveryAPI.getSlotRoute();
         if (res.data?.success) {
            setRouteData(res.data);
            setLastRefresh(new Date());
         } else {
            setError('Could not load your route.');
         }
      } catch (err) {
         setError('Failed to load route. Please check your connection.');
         console.error('[RoutesView] fetchSlotRoute error:', err);
      } finally {
         setLoading(false);
      }
   }, []);

   // ── On mount ───────────────────────────────────────────────────────────────
   useEffect(() => {
      fetchSlotRoute(false);
   }, [fetchSlotRoute]);

   // ── Auto-refresh every 3 minutes to catch slot transitions ─────────────────
   useEffect(() => {
      const interval = setInterval(() => {
         fetchSlotRoute(true);
      }, 3 * 60 * 1000);
      return () => clearInterval(interval);
   }, [fetchSlotRoute]);

   // ── Real-time Socket: vendor_order_status_changed ──────────────────────────
   useEffect(() => {
      // Use the delivery socket from window if available
      const socket = window.__deliverySocket;
      if (!socket) return;

      const handleVendorStatusChange = (payload) => {
         const { vendorId, vendorStatus, slot } = payload;
         setRouteData(prev => {
            if (!prev) return prev;
            const updatedStops = prev.stops.map(stop => {
               if (stop.type === 'pickup' && String(stop.vendorId) === String(vendorId)) {
                  return { ...stop, vendorStatus };
               }
               return stop;
            });
            return { ...prev, stops: updatedStops };
         });
         toast.info(`Vendor status updated: ${vendorStatus === 'preparing' ? '🔥 Preparing' : '✅ Ready'}`);
      };

      socket.on('vendor_order_status_changed', handleVendorStatusChange);
      return () => socket.off('vendor_order_status_changed', handleVendorStatusChange);
   }, []);

   // ── Manual refresh ─────────────────────────────────────────────────────────
   const handleRefresh = async () => {
      setRefreshing(true);
      try {
         const res = await dmbDeliveryAPI.getSlotRoute();
         if (res.data?.success) {
            setRouteData(res.data);
            setLastRefresh(new Date());
            toast.success('Route updated!');
         } else {
            toast.error('Could not refresh route.');
         }
      } catch {
         toast.error('Refresh failed. Please try again.');
      } finally {
         setRefreshing(false);
      }
   };

   // ── Handle stop click ──────────────────────────────────────────────────────
   const handleStopClick = (stop) => {
      if (!routeData?.isSlotActive) {
         // Between slots — show timing info modal
         setTimingModal({ stop });
         return;
      }
      // Active slot — navigate normally
      if (onSelectStop) onSelectStop(stop);
   };

   // ── Derived state ──────────────────────────────────────────────────────────
   const stops = routeData?.stops || [];
   const isSlotActive = routeData?.isSlotActive ?? true;
   const slotLabel = routeData?.slotLabel || '';
   const slotIcon = SLOT_ICONS[routeData?.activeSlot] || '🕐';
   const nextSlotStartTime = routeData?.nextSlotStartTime || '';
   const activeSlot = routeData?.activeSlot || '';
   const slotWindow = routeData?.slotWindow;
   const totalOrders = routeData?.totalOrders || 0;
   const totalVendors = routeData?.totalVendors || 0;

   const pendingStops = stops.filter(s => s.status !== 'completed');
   const completedStops = stops.filter(s => s.status === 'completed');
   const readyVendors = stops.filter(s => s.type === 'pickup' && s.vendorStatus === 'ready').length;
   const totalVendorStops = stops.filter(s => s.type === 'pickup').length;

   const slotColors = SLOT_COLORS[activeSlot] || SLOT_COLORS.dinner;

   return (
      <div className="min-h-screen bg-[#F5F5F0] font-poppins pb-32">

         {/* ── Header ─────────────────────────────────────────────────────── */}
         <div className="bg-[#1F7A63] px-5 py-3 flex items-center justify-between sticky top-0 z-[100] rounded-full">
            <div className="flex items-center gap-3.5">
               <button
                  onClick={goBack}
                  className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white border border-white/10 active:scale-90 transition-all"
               >
                  <ArrowLeft className="w-4 h-4" />
               </button>
               <div>
                  <h1 className="text-lg font-black text-white uppercase tracking-tight">My Route</h1>
                  <p className="text-[10px] font-medium text-emerald-100/70 mt-0.5">
                     {isSlotActive
                        ? `${slotIcon} ${slotLabel} slot — ${slotWindow?.start || ''} to ${slotWindow?.end || ''}`
                        : `⏳ Preview: ${slotLabel} slot at ${nextSlotStartTime}`
                     }
                  </p>
               </div>
            </div>

            <button
               onClick={handleRefresh}
               disabled={refreshing || loading}
               className="flex items-center gap-1.5 px-3 py-2 bg-white/15 text-white border border-white/20 rounded-xl text-xs font-bold active:scale-90 transition-all disabled:opacity-40"
            >
               <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
               {refreshing ? 'Updating…' : 'Refresh'}
            </button>
         </div>

         {/* ── Between-slots banner ────────────────────────────────────────── */}
         {!loading && !isSlotActive && stops.length > 0 && (
            <motion.div
               initial={{ opacity: 0, y: -10 }}
               animate={{ opacity: 1, y: 0 }}
               className={`mx-4 mt-4 px-4 py-3 rounded-2xl border ${slotColors.bg} ${slotColors.border} flex items-center gap-3`}
            >
               <span className="text-2xl">{slotIcon}</span>
               <div className="flex-1">
                  <p className={`text-xs font-black ${slotColors.text}`}>
                     {slotLabel} slot starts at {nextSlotStartTime}
                  </p>
                  <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                     Showing upcoming {slotLabel} route — tap any stop to see details
                  </p>
               </div>
            </motion.div>
         )}

         {/* ── Content ─────────────────────────────────────────────────────── */}
         <div className="px-4 pt-4 space-y-4">

            {/* Loading state */}
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

            {/* Error state */}
            {!loading && error && (
               <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 border border-red-200 rounded-2xl p-6 flex flex-col items-center gap-3 text-center"
               >
                  <AlertCircle className="w-10 h-10 text-red-400" />
                  <p className="text-sm font-semibold text-red-700">{error}</p>
                  <button
                     onClick={() => fetchSlotRoute()}
                     className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl active:scale-95 transition-all"
                  >
                     Retry
                  </button>
               </motion.div>
            )}

            {/* Empty state */}
            {!loading && !error && stops.length === 0 && (
               <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center py-20 gap-4 text-center"
               >
                  <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center text-4xl">
                     {isSlotActive ? '🍱' : slotIcon}
                  </div>
                  <div>
                     <p className="text-sm font-bold text-gray-800">
                        {isSlotActive ? 'No Orders for This Slot' : `${slotLabel} Slot Preview`}
                     </p>
                     <p className="text-xs text-gray-400 font-medium mt-1 max-w-[240px] leading-relaxed">
                        {isSlotActive
                           ? `No ${slotLabel} orders found for today. Check back later.`
                           : routeData?.message || `Next slot starts at ${nextSlotStartTime}.`
                        }
                     </p>
                  </div>
                  <button
                     onClick={handleRefresh}
                     className="flex items-center gap-2 px-5 py-2.5 bg-[#1F7A63] text-white text-xs font-bold rounded-xl active:scale-95 transition-all shadow-md shadow-[#1F7A63]/20"
                  >
                     <RefreshCw className="w-3.5 h-3.5" />
                     Refresh
                  </button>
               </motion.div>
            )}

            {/* Route content */}
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
                     <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="bg-[#1F7A63]/10 rounded-xl py-2 px-1 border border-[#1F7A63]/25 text-center">
                           <p className="text-[9px] font-bold text-[#1F7A63] uppercase tracking-wider mb-1">Stops</p>
                           <p className="text-xl font-black text-gray-900">{stops.length}</p>
                        </div>
                        <div className="bg-[#3B82F6]/10 rounded-xl py-2 px-1 border border-[#3B82F6]/25 text-center">
                           <p className="text-[9px] font-bold text-[#3B82F6] uppercase tracking-wider mb-1">Orders</p>
                           <p className="text-xl font-black text-gray-900">{totalOrders}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl py-2 px-1 border border-gray-100 text-center">
                           <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Vendors</p>
                           <p className="text-xl font-black text-gray-900">{totalVendors}</p>
                        </div>
                     </div>

                     {/* Vendor readiness bar */}
                     {totalVendorStops > 0 && isSlotActive && (
                        <div className="mb-3">
                           <div className="flex justify-between items-center mb-1.5">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Vendor Readiness</span>
                              <span className="text-[10px] font-bold text-[#1F7A63]">{readyVendors}/{totalVendorStops} ready</span>
                           </div>
                           <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <motion.div
                                 className="h-full bg-[#1F7A63] rounded-full"
                                 initial={{ width: 0 }}
                                 animate={{ width: totalVendorStops > 0 ? `${(readyVendors / totalVendorStops) * 100}%` : '0%' }}
                                 transition={{ duration: 0.6, ease: 'easeOut' }}
                              />
                           </div>
                        </div>
                     )}

                     {/* Last updated */}
                     <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium">
                        <Clock className="w-3 h-3" />
                        Updated {lastRefresh ? formatTimeAgo(lastRefresh) : '—'}
                     </div>
                  </motion.div>

                  {/* Slot chip */}
                  <motion.div
                     key="slot-chip"
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     className="flex items-center gap-2"
                  >
                     <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${isSlotActive ? 'bg-[#1F7A63]/10 border-[#1F7A63]/20' : `${slotColors.bg} ${slotColors.border}`}`}>
                        <span>{slotIcon}</span>
                        <span className={`text-[10px] font-bold ${isSlotActive ? 'text-[#1F7A63]' : slotColors.text}`}>
                           {isSlotActive ? `Active: ${slotLabel}` : `Preview: ${slotLabel} at ${nextSlotStartTime}`}
                        </span>
                        {isSlotActive && (
                           <span className="w-1.5 h-1.5 rounded-full bg-[#1F7A63] animate-pulse" />
                        )}
                     </div>
                  </motion.div>

                  {/* Tab Content */}
                  {activeTab === 'list' ? (
                     <>
                        {/* Pending stops */}
                        {pendingStops.length > 0 && (
                           <div key="pending">
                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">
                                 {isSlotActive ? `Upcoming — ${pendingStops.length} stops` : `${slotLabel} Preview — ${pendingStops.length} stops`}
                              </p>
                              <div className="space-y-3">
                                 {pendingStops.map((stop, idx) => (
                                    <StopCard
                                       key={stop.id || `${stop.orderId}-${stop.type}`}
                                       stop={stop}
                                       index={idx}
                                       isFirst={idx === 0}
                                       isSlotActive={isSlotActive}
                                       onClick={() => handleStopClick(stop)}
                                    />
                                 ))}
                              </div>
                           </div>
                        )}

                        {/* Completed stops */}
                        {completedStops.length > 0 && (
                           <div key="completed">
                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1 mt-2">
                                 Completed — {completedStops.length} stops
                              </p>
                              <div className="space-y-3">
                                 {completedStops.map((stop, idx) => (
                                    <StopCard
                                       key={`${stop.id || stop.orderId}-done`}
                                       stop={stop}
                                       index={idx}
                                       isFirst={false}
                                       isSlotActive={isSlotActive}
                                       onClick={() => handleStopClick(stop)}
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
                           Map View — {slotLabel} Route
                        </p>
                        <RoutesMap stops={stops.map(s => ({
                           ...s,
                           lat: s.lat || s.vendorLat || s.customerLat,
                           lng: s.lng || s.vendorLng || s.customerLng,
                           latitude: s.lat || s.vendorLat,
                           longitude: s.lng || s.vendorLng
                        }))} />
                     </motion.div>
                  )}
               </AnimatePresence>
            )}
         </div>

         {/* ── Slot Timing Modal ───────────────────────────────────────────── */}
         <AnimatePresence>
            {timingModal && (
               <SlotTimingModal
                  stop={timingModal.stop}
                  slot={activeSlot}
                  nextSlotStartTime={nextSlotStartTime}
                  onClose={() => setTimingModal(null)}
               />
            )}
         </AnimatePresence>
      </div>
   );
};

export default RoutesView;
