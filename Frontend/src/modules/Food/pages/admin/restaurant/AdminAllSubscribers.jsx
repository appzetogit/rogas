import React, { useState, useEffect } from "react";
import { Search, Loader2, ChevronLeft, ChevronRight, Eye, Calendar, Activity, CreditCard, Clock, X } from "lucide-react";
import { Link } from "react-router-dom";
import { adminAPI } from "@food/api";
import VendorSubscriberDetails from "./VendorSubscriberDetails";

export default function AdminAllSubscribers() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [subscribers, setSubscribers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
  const [filters, setFilters] = useState({ status: "", planType: "", mealType: "", search: "" });
  const [selectedSubscriber, setSelectedSubscriber] = useState(null);

  const fetchSummary = async () => {
    try {
      const res = await adminAPI.getAllSubscribersSummary();
      setSummary(res?.data?.data || null);
    } catch (err) {
      console.error("Failed to fetch summary:", err);
    }
  };

  const fetchSubscribers = async (page = 1) => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: pagination.limit,
        status: filters.status,
        planType: filters.planType,
        mealType: filters.mealType,
        search: filters.search
      };
      const res = await adminAPI.getAllSubscribers(params);
      setSubscribers(res?.data?.data?.data || res?.data?.data?.subscribers || []);
      setPagination(prev => ({
        ...prev,
        page: res?.data?.data?.page || page,
        total: res?.data?.data?.total || 0,
        pages: res?.data?.data?.pages || 1
      }));
    } catch (err) {
      console.error("Failed to fetch subscribers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  useEffect(() => {
    fetchSubscribers(1);
    // eslint-disable-next-line
  }, [filters]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700 border-green-200';
      case 'paused': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'expired': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="p-4 pt-20 lg:p-6 lg:pt-8 bg-slate-50 min-h-screen pb-24">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Global Subscribers</h1>
          <p className="text-gray-500 text-sm">Manage all subscriptions across vendors</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { title: "Total Subscribers", value: summary?.totalSubscribers || 0, icon: <Activity size={20} />, color: "text-blue-600", bg: "bg-blue-50" },
          { title: "Active Plans", value: summary?.activeSubscribers || 0, icon: <CreditCard size={20} />, color: "text-green-600", bg: "bg-green-50" },
          { title: "Paused Plans", value: summary?.pausedSubscribers || 0, icon: <Clock size={20} />, color: "text-yellow-600", bg: "bg-yellow-50" },
          { title: "Total Revenue", value: `₹${summary?.totalRevenue?.toLocaleString() || 0}`, icon: <CreditCard size={20} />, color: "text-purple-600", bg: "bg-purple-50" }
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
            <div className={`p-3 rounded-lg ${stat.bg} ${stat.color}`}>
              {stat.icon}
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium mb-1">{stat.title}</p>
              <h3 className="text-xl font-bold text-slate-800">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by name, phone or ID..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="flex-1 md:flex-none px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 text-sm font-medium text-slate-700"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="expired">Expired</option>
          </select>

          <select
            value={filters.planType}
            onChange={(e) => handleFilterChange('planType', e.target.value)}
            className="flex-1 md:flex-none px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 text-sm font-medium text-slate-700"
          >
            <option value="">All Durations</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Customer</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Vendor</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Plan Details</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Timeline</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm">Status</th>
                <th className="px-6 py-4 font-semibold text-slate-600 text-sm text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-green-600" />
                    Loading subscribers...
                  </td>
                </tr>
              ) : subscribers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-slate-500 font-medium">
                    No subscribers found
                  </td>
                </tr>
              ) : (
                subscribers.map((sub, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-800">{sub.customerName}</span>
                        <span className="text-xs text-slate-500">{sub.customerPhone}</span>
                        <span className="text-xs text-slate-400">ID: {sub.subscriptionId}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-slate-800">{sub.vendorName}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-slate-700 capitalize">{sub.planName} • {sub.planType}</span>
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Activity size={12} /> {sub.mealTypes} ({sub.deliveryDays})
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-slate-600 flex items-center gap-1">
                          <Calendar size={12} /> {new Date(sub.startDate).toLocaleDateString()} - {new Date(sub.endDate).toLocaleDateString()}
                        </span>
                        {sub.remainingDays > 0 && (
                          <span className="text-xs text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded-full w-max">
                            {sub.remainingDays} days left
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(sub.status)} capitalize`}>
                        {sub.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedSubscriber(sub)}
                        className="inline-flex items-center justify-center p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && subscribers.length > 0 && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
            <span className="text-sm text-slate-600 font-medium">
              Showing page {pagination.page} of {pagination.pages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => fetchSubscribers(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-white disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => fetchSubscribers(pagination.page + 1)}
                disabled={pagination.page === pagination.pages}
                className="p-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-white disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal for Subscriber Details */}
      {selectedSubscriber && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl overflow-hidden shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative animate-in fade-in zoom-in-95 duration-200">
            <VendorSubscriberDetails 
              propId={selectedSubscriber.vendorId} 
              propSubId={selectedSubscriber._id} 
              isModal={true}
              onClose={() => setSelectedSubscriber(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
