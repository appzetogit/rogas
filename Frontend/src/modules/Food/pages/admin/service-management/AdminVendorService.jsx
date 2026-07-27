import React, { useState, useEffect } from 'react';
import { serviceManagementAPI } from '@food/api';
import { toast } from 'sonner';
import { UtensilsCrossed, Check, X, Filter, Loader2, AlertTriangle, RefreshCw, Calendar, Clock } from 'lucide-react';

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  completed: 'bg-blue-100 text-blue-800 border-blue-200',
};

export default function AdminVendorService() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await serviceManagementAPI.getAdminVendorRequests(statusFilter ? { status: statusFilter } : {});
      setRequests(res.data?.data || []);
    } catch (err) {
      toast.error('Failed to load vendor requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, [statusFilter]);

  const handleApprove = async (id) => {
    setActionLoading(id);
    try {
      const res = await serviceManagementAPI.approveVendorRequest(id);
      const count = res.data?.customerRequestsCreated || 0;
      toast.success(`Approved! ${count} customer request(s) created.`);
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
      await serviceManagementAPI.rejectVendorRequest(id);
      toast.success('Request rejected');
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <UtensilsCrossed className="w-5 h-5 text-orange-600" />
            </div>
            Vendor Service
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage vendor meal unavailability requests</p>
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
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <AlertTriangle className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No vendor service requests found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Vendor</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Slot</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Reason</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map((req) => (
                <tr key={req._id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {req.vendorId?.restaurantName || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                    {formatDate(req.date)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="capitalize bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md text-xs font-medium flex items-center gap-1 w-fit">
                      <Clock className="w-3 h-3" /> {req.slots && req.slots.length > 0 ? req.slots.join(', ') : req.slot}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[250px] truncate">{req.reason}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase border ${STATUS_COLORS[req.status]}`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {req.status === 'pending' && (
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleApprove(req._id)}
                          disabled={actionLoading === req._id}
                          className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors disabled:opacity-50"
                          title="Approve — creates customer requests"
                        >
                          {actionLoading === req._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleReject(req._id)}
                          disabled={actionLoading === req._id}
                          className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                          title="Reject"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
