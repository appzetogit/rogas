import React, { useState, useEffect } from "react";
import { Search, Loader2, ChevronDown, ChevronLeft, ChevronRight, Eye, Calendar, Clock, CreditCard, Activity, ArrowLeft, Download, FileSpreadsheet } from "lucide-react";
import { restaurantAPI } from "@food/api";
import { useNavigate } from "react-router-dom";

export default function VendorSubscribers() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [productionSummary, setProductionSummary] = useState(null);
  const [subscribers, setSubscribers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
  const [filters, setFilters] = useState({ status: "", planType: "", mealType: "", search: "" });

  const fetchSummary = async () => {
    try {
      setSummaryLoading(true);
      const res = await restaurantAPI.getVendorProductionSummary();
      setProductionSummary(res?.data?.data || null);
    } catch (err) {
      console.error("Failed to fetch production summary:", err);
    } finally {
      setSummaryLoading(false);
    }
  };

  const fetchSubscribers = async () => {
    try {
      setLoading(true);
      const params = { page: pagination.page, limit: pagination.limit, ...filters };
      const res = await restaurantAPI.getVendorSubscribers(params);
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
    fetchSummary();
  }, []);

  useEffect(() => {
    fetchSubscribers();
  }, [pagination.page, filters]);

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

  const handleExport = () => {
    // Basic CSV export
    if (subscribers.length === 0) return;
    
    const headers = ["Customer", "Phone", "Subscription ID", "Plan", "Type", "Days Left", "Status"];
    const rows = subscribers.map(sub => [
      sub.customerName || "N/A",
      sub.customerPhone || "N/A",
      sub.subscriptionId || "N/A",
      sub.planName || "Custom",
      sub.planType || "N/A",
      sub.remainingDays || 0,
      sub.status || "N/A"
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `subscribers_export_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 pt-20 lg:p-6 lg:pt-8 bg-slate-50 min-h-screen pb-24">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50"
          >
            <ArrowLeft className="w-4 h-4 text-slate-700" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Subscribers</h1>
            <p className="text-sm text-slate-500">Manage your subscription customers and today's production.</p>
          </div>
        </div>

        {/* Production Summary Cards */}
        <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden mb-6">
          <div className="p-4 border-b border-blue-100 bg-blue-50/50">
            <h2 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
              <Activity className="w-5 h-5" /> Today's Production Summary
            </h2>
            <p className="text-sm text-blue-700 mt-1">Meals required for today based on active subscriptions.</p>
          </div>
          
          <div className="p-4">
            {summaryLoading ? (
              <div className="flex justify-center p-6"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
            ) : productionSummary ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center text-center">
                  <p className="text-sm text-slate-600 font-medium">Total Meals Today</p>
                  <p className="text-3xl font-bold text-slate-900 mt-1">{productionSummary.totalMealsToday || 0}</p>
                </div>
                <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-200 flex flex-col items-center text-center">
                  <p className="text-sm text-orange-700 font-medium">Breakfast</p>
                  <p className="text-3xl font-bold text-orange-600 mt-1">{productionSummary.breakfastCount || 0}</p>
                </div>
                <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 flex flex-col items-center text-center">
                  <p className="text-sm text-amber-700 font-medium">Lunch</p>
                  <p className="text-3xl font-bold text-amber-600 mt-1">{productionSummary.lunchCount || 0}</p>
                </div>
                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-200 flex flex-col items-center text-center">
                  <p className="text-sm text-indigo-700 font-medium">Dinner</p>
                  <p className="text-3xl font-bold text-indigo-600 mt-1">{productionSummary.dinnerCount || 0}</p>
                </div>
              </div>
            ) : (
              <p className="text-center text-slate-500 py-4">Summary not available.</p>
            )}
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
                  placeholder="Search customer..."
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
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-sm font-medium transition-colors"
                title="Export to CSV"
              >
                <FileSpreadsheet className="w-4 h-4" /> Export
              </button>
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
    </div>
  );
}
