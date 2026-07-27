import React, { useState, useEffect } from 'react';
import { serviceManagementAPI } from '@food/api';
import { toast } from 'sonner';
import { Truck, Check, X, Search, Users, MapPin, Clock, Calendar, Filter, ChevronDown, Loader2, AlertTriangle, RefreshCw, Eye } from 'lucide-react';

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  completed: 'bg-blue-100 text-blue-800 border-blue-200',
};

export default function AdminDeliveryService() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(null);
  const [viewTransfersModal, setViewTransfersModal] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [selectedDrivers, setSelectedDrivers] = useState([]);
  const [driverSearch, setDriverSearch] = useState('');
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await serviceManagementAPI.getAdminDeliveryRequests(statusFilter ? { status: statusFilter } : {});
      setRequests(res.data?.data || []);
    } catch (err) {
      toast.error('Failed to load delivery requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, [statusFilter]);

  const handleApprove = async (id) => {
    setActionLoading(id);
    try {
      await serviceManagementAPI.approveDeliveryRequest(id);
      toast.success('Request approved');
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id) => {
    setActionLoading(id);
    try {
      await serviceManagementAPI.rejectDeliveryRequest(id);
      toast.success('Request rejected');
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject');
    } finally {
      setActionLoading(null);
    }
  };

  const openAssignModal = async (request) => {
    setShowAssignModal(request);
    setLoadingDrivers(true);
    setSelectedDrivers([]);
    try {
      const filters = {
        date: request.date,
        slot: request.slot
      };
      if (request.zoneId) {
        filters.zoneId = request.zoneId._id || request.zoneId;
      }
      
      const res = await serviceManagementAPI.getAvailableDrivers(filters);
      setDrivers(res.data?.data || []);
    } catch {
      toast.error('Failed to load drivers');
    } finally {
      setLoadingDrivers(false);
    }
  };

  const handleAssignRides = async () => {
    if (selectedDrivers.length === 0) return toast.error('Select at least one driver');
    setActionLoading('assign');
    try {
      const assignments = selectedDrivers.map(d => ({ driverId: d._id, orderCount: showAssignModal.orderCount || 0 }));
      await serviceManagementAPI.assignRides(showAssignModal._id, assignments);
      toast.success(`${assignments.length} ride transfer(s) sent`);
      setShowAssignModal(null);
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign rides');
    } finally {
      setActionLoading(null);
    }
  };

  const toggleDriverSelection = (driver) => {
    setSelectedDrivers(prev =>
      prev.find(d => d._id === driver._id)
        ? prev.filter(d => d._id !== driver._id)
        : [...prev, driver]
    );
  };

  const filteredDrivers = drivers.filter(d => {
    const name = `${d.firstName || ''} ${d.lastName || ''}`.toLowerCase();
    return name.includes(driverSearch.toLowerCase());
  });

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Truck className="w-5 h-5 text-blue-600" />
            </div>
            Delivery Service
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage delivery partner unavailability requests</p>
        </div>
        <button onClick={fetchRequests} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-200">
        <Filter className="w-4 h-4 text-gray-400" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border-0 bg-transparent focus:ring-0 text-gray-700 font-medium cursor-pointer"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <AlertTriangle className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No delivery service requests found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Delivery Partner</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Zone</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Slot</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Orders</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Reason</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map((req) => (
                <tr key={req._id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {req.requesterId?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {req.requesterId?.zoneIds && req.requesterId.zoneIds.length > 0 
                      ? req.requesterId.zoneIds.map(z => z?.name).join(', ') 
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(req.date)}</td>
                  <td className="px-4 py-3">
                    <span className="capitalize bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md text-xs font-medium">{req.slot}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-semibold">{req.orderCount || 0}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{req.reason}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase border ${req.transferStatus === 'accepted' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : STATUS_COLORS[req.status]}`}>
                      {req.transferStatus === 'accepted' ? 'ACCEPTED' : req.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {req.status === 'pending' && (
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleApprove(req._id)}
                          disabled={actionLoading === req._id}
                          className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors"
                          title="Approve"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleReject(req._id)}
                          disabled={actionLoading === req._id}
                          className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                          title="Reject"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {req.status === 'approved' && (
                      req.transferStatus === 'accepted' ? (
                        <button
                          onClick={() => setViewTransfersModal(req)}
                          className="p-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                          title="View Assignments"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => openAssignModal(req)}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Assign Rides
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Assign Rides Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Assign Replacement Drivers</h2>
              <p className="text-sm text-gray-500 mt-1">
                Select drivers to cover deliveries on {formatDate(showAssignModal.date)} — {showAssignModal.slot}
              </p>
            </div>

            <div className="p-4 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search drivers..."
                  value={driverSearch}
                  onChange={(e) => setDriverSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingDrivers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              ) : filteredDrivers.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No drivers available</p>
              ) : (
                filteredDrivers.map(driver => {
                  const isSelected = selectedDrivers.find(d => d._id === driver._id);
                  return (
                    <button
                      key={driver._id}
                      onClick={() => toggleDriverSelection(driver)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {isSelected ? <Check className="w-4 h-4" /> : (driver.firstName?.[0] || 'D')}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 text-sm">{driver.firstName} {driver.lastName}</p>
                        <p className="text-xs text-gray-500">{driver.phone}</p>
                      </div>
                      {driver.zoneId?.name && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {driver.zoneId.name}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t border-gray-200 flex items-center justify-between">
              <span className="text-sm text-gray-500">{selectedDrivers.length} driver(s) selected</span>
              <div className="flex gap-3">
                <button onClick={() => setShowAssignModal(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleAssignRides}
                  disabled={selectedDrivers.length === 0 || actionLoading === 'assign'}
                  className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {actionLoading === 'assign' && <Loader2 className="w-4 h-4 animate-spin" />}
                  Send Ride Requests
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Transfers Modal */}
      {viewTransfersModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Assigned Riders</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {formatDate(viewTransfersModal.date)} — {viewTransfersModal.slot}
                </p>
              </div>
              <button onClick={() => setViewTransfersModal(null)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {viewTransfersModal.transfers?.map(transfer => (
                <div key={transfer._id} className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
                    {transfer.assignedDriverId?.name?.[0] || 'D'}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-gray-900">{transfer.assignedDriverId?.name}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                      {transfer.assignedDriverId?.phone}
                    </p>
                  </div>
                  <div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md border ${
                      transfer.status === 'accepted' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                      transfer.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                      'bg-amber-100 text-amber-700 border-amber-200'
                    }`}>
                      {transfer.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setViewTransfersModal(null);
                  openAssignModal(viewTransfersModal);
                }}
                className="w-full py-2 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors text-sm"
              >
                Assign More Riders
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
