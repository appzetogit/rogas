import React, { useState, useEffect } from 'react';
import { serviceManagementAPI } from '@food/api';
import { toast } from 'sonner';
import { ArrowLeft, Calendar, Clock, MapPin, Package, Check, X, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DeliveryRidesPage() {
  const navigate = useNavigate();
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const res = await serviceManagementAPI.getMyRideTransfers();
      setTransfers(res.data?.data || []);
    } catch {
      toast.error('Failed to load ride transfers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTransfers(); }, []);

  const handleRespond = async (id, response) => {
    setActionLoading(id);
    try {
      await serviceManagementAPI.respondToRideTransfer(id, response);
      toast.success(response === 'accepted' ? 'Ride accepted! Added to your schedule.' : 'Ride rejected.');
      fetchTransfers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update response');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="min-h-screen bg-slate-50/50">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/delivery/dashboard')} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-lg font-bold text-[#2B2B2B]">Ride Requests</h1>
          </div>
          <button onClick={fetchTransfers} className="p-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : transfers.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
            <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400 font-medium">No ride requests found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transfers.map(transfer => (
              <div key={transfer._id} className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm relative overflow-hidden">
                {transfer.status === 'pending' && (
                  <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
                )}
                
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-[#2B2B2B] text-sm">Cover Request</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      From: {transfer.originalDriverId?.name || '—'}
                    </p>
                  </div>
                  {transfer.status !== 'pending' && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      transfer.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {transfer.status}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-semibold text-gray-700">{formatDate(transfer.date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-semibold text-gray-700 capitalize">{transfer.slot}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-semibold text-gray-700">{transfer.orderCount || 0} Orders</span>
                  </div>
                  
                  {/* Zone Display */}
                  {(() => {
                    const zoneName = transfer.zoneId?.name || (transfer.originalDriverId?.zoneIds && transfer.originalDriverId.zoneIds.length > 0 ? transfer.originalDriverId.zoneIds[0]?.name : null);
                    if (!zoneName) return null;
                    return (
                      <div className="flex items-center gap-2 col-span-2 pt-1 border-t border-gray-200/60 mt-1">
                        <MapPin className="w-4 h-4 text-blue-500" />
                        <span className="text-xs font-semibold text-gray-700">{zoneName}</span>
                      </div>
                    );
                  })()}
                </div>

                {transfer.status === 'pending' && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleRespond(transfer._id, 'rejected')}
                      disabled={actionLoading === transfer._id}
                      className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <X className="w-4 h-4" /> Reject
                    </button>
                    <button
                      onClick={() => handleRespond(transfer._id, 'accepted')}
                      disabled={actionLoading === transfer._id}
                      className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {actionLoading === transfer._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Accept Ride
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
