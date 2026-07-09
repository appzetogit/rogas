import React, { useState, useEffect } from "react";
import { Search, Loader2, ChevronDown, ChevronLeft, ChevronRight, Eye, Calendar, Clock, CreditCard, Activity, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { adminAPI } from "@food/api";

export default function VendorSubscribers({ vendorId }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [subscribers, setSubscribers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
  const [filters, setFilters] = useState({ status: "", planType: "", mealType: "", search: "" });

  const fetchSummary = async () => {
    try {
      const res = await adminAPI.getVendorSubscribersSummary(vendorId);
      setSummary(res?.data?.data || null);
    } catch (err) {
      console.error("Failed to fetch summary:", err);
    }
  };

  const fetchSubscribers = async () => {
    try {
      setLoading(true);
      const params = { page: pagination.page, limit: pagination.limit, ...filters };
      const res = await adminAPI.getVendorSubscribers(vendorId, params);
      const data = res?.data?.data || {};
      setSubscribers(data.subscribers || []);
      setPagination({
        page: data.page || 1,
        limit: pagination.limit,
        total: data.total || 0,
        pages: data.pages || 1,
      });
    } catch (err) {
      console.error("Failed to fetch subscribers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (vendorId) {
      fetchSummary();
      fetchSubscribers();
    }
  }, [vendorId, pagination.page, filters]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.pages) {
      setPagination((prev) => ({ ...prev, page: newPage }));
    }
  };

  if (!vendorId) return <div>No vendor selected</div>;

  return (
    <div className="space-y-6 pt-20 lg:pt-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center">
          <p className="text-sm text-slate-500 font-medium">Total Subs</p>
          <p className="text-2xl font-bold text-slate-900">{summary?.totalSubscribers || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm flex flex-col items-center text-center bg-emerald-50/50">
          <p className="text-sm text-emerald-600 font-medium">Active</p>
          <p className="text-2xl font-bold text-emerald-700">{summary?.activeSubscribers || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex flex-col items-center text-center bg-amber-50/50">
          <p className="text-sm text-amber-600 font-medium">Paused</p>
          <p className="text-2xl font-bold text-amber-700">{summary?.pausedSubscribers || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center text-center bg-slate-50/50">
          <p className="text-sm text-slate-500 font-medium">Expired/Cancelled</p>
          <p className="text-2xl font-bold text-slate-700">{(summary?.expiredSubscribers || 0) + (summary?.cancelledSubscribers || 0)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-sm flex flex-col items-center text-center bg-indigo-50/50">
          <p className="text-sm text-indigo-600 font-medium">Revenue</p>
          <p className="text-2xl font-bold text-indigo-700">₹{(summary?.totalRevenue || 0).toFixed(2)}</p>
        </div>
      </div>

      {/* Filters and List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-800">Subscriber List</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                name="search"
                value={filters.search}
                onChange={handleFilterChange}
                placeholder="Search..."
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full lg:w-48"
              />
            </div>
            <select
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              className="py-2 px-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              name="planType"
              value={filters.planType}
              onChange={handleFilterChange}
              className="py-2 px-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All Plans</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center p-12 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span>Loading subscribers...</span>
            </div>
          ) : subscribers.length === 0 ? (
            <div className="text-center p-12 text-slate-500">
              No subscribers found matching your criteria.
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-semibold">Customer</th>
                  <th className="py-3 px-4 font-semibold">Subscription ID</th>
                  <th className="py-3 px-4 font-semibold">Plan</th>
                  <th className="py-3 px-4 font-semibold">Meals</th>
                  <th className="py-3 px-4 font-semibold">Days Left</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Revenue</th>
                  <th className="py-3 px-4 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subscribers.map((sub) => (
                  <tr key={sub._id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-slate-900">{sub.customerName}</p>
                        <p className="text-xs text-slate-500">{sub.customerPhone}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200 font-mono">
                        {sub.subscriptionId}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-800">{sub.planName}</p>
                      <p className="text-xs text-slate-500 capitalize">{sub.planType}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-slate-700 capitalize">{sub.mealTypes}</p>
                    </td>
                    <td className="py-3 px-4">
                      {sub.status === "active" ? (
                        <span className="font-medium text-slate-800">{sub.remainingDays} days</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                          sub.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : sub.status === "paused"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : sub.status === "expired"
                            ? "bg-slate-50 text-slate-700 border-slate-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}
                      >
                        {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">
                      ₹{sub.totalRevenue?.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Link
                        to={`/admin/food/vendors/${vendorId}/subscribers/${sub._id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-medium transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && pagination.pages > 1 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
            <span className="text-sm text-slate-600">
              Showing page {pagination.page} of {pagination.pages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-600"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.pages}
                className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-600"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
