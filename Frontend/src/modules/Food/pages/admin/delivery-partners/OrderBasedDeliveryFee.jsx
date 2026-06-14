import React, { useState, useEffect, useCallback } from "react";
import { adminAPI } from "@food/api";
import { toast } from "sonner";
import { Save, Loader2, IndianRupee, History, Settings } from "lucide-react";

export default function OrderBasedDeliveryFee() {
  const [activeTab, setActiveTab] = useState("settings");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings State
  const [settings, setSettings] = useState({
    feePerOrder: 0,
    commissionPerDay: 0,
    commissionPerWeek: 0,
    commissionPerMonth: 0,
  });

  // Audit State
  const [auditData, setAuditData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getDeliveryOrderFeeSettings();
      if (response.data?.success) {
        setSettings({
          feePerOrder: response.data.data.feePerOrder || 0,
          commissionPerDay: response.data.data.commissionPerDay || 0,
          commissionPerWeek: response.data.data.commissionPerWeek || 0,
          commissionPerMonth: response.data.data.commissionPerMonth || 0,
        });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to fetch settings");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAuditData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getDeliveryCommissionAudit({
        page: pagination.page,
        limit: pagination.limit,
      });
      if (response.data?.success) {
        setAuditData(response.data.data.auditData || []);
        setPagination((prev) => ({
          ...prev,
          total: response.data.data.total || 0,
        }));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to fetch audit data");
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit]);

  useEffect(() => {
    if (activeTab === "settings") {
      fetchSettings();
    } else {
      fetchAuditData();
    }
  }, [activeTab, fetchSettings, fetchAuditData]);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await adminAPI.updateDeliveryOrderFeeSettings(settings);
      if (response.data?.success) {
        toast.success("Settings saved successfully!");
      } else {
        toast.error("Failed to save settings");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  if (loading && activeTab === "settings") {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const totalPages = Math.ceil(pagination.total / pagination.limit) || 1;

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen w-full max-w-full overflow-x-hidden">
      <div className="w-full mx-auto max-w-6xl">
        {/* Page Header */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center">
              <IndianRupee className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Order-Based Delivery Fee
              </h1>
              <p className="text-sm text-slate-600">
                Configure delivery boy earnings per order and periodic commissions
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg mb-6 w-fit border border-slate-200">
          <button
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "settings"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <Settings className="w-4 h-4" />
            Configuration Settings
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === "audit"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <History className="w-4 h-4" />
            Commission Audit
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "settings" ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-6 border-b pb-3">
              Fee & Commission Settings
            </h2>
            <form onSubmit={handleSaveSettings} className="space-y-6 max-w-2xl">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Earning Per Order (PLN/INR)
                </label>
                <p className="text-sm text-slate-500 mb-2">
                  This amount will be directly credited to the delivery boy's wallet for every successfully delivered order. Setting this greater than 0 will override the default distance-based logic.
                </p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <IndianRupee className="w-4 h-4" />
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settings.feePerOrder}
                    onChange={(e) =>
                      setSettings({ ...settings, feePerOrder: e.target.value })
                    }
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-100">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Commission Per Day
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settings.commissionPerDay}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        commissionPerDay: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Commission Per Week
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settings.commissionPerWeek}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        commissionPerWeek: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Commission Per Month
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settings.commissionPerMonth}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        commissionPerMonth: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-0 overflow-hidden">
            {loading && auditData.length === 0 ? (
              <div className="p-10 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">
                          SI
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">
                          Delivery Boy
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">
                          Zone
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-slate-700 uppercase text-blue-700">
                          Daily Owed
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-slate-700 uppercase text-indigo-700">
                          Weekly Owed
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-slate-700 uppercase text-purple-700">
                          Monthly Owed
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditData.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                            No active delivery boys found.
                          </td>
                        </tr>
                      ) : (
                        auditData.map((row, index) => (
                          <tr key={row.partnerId} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-sm text-slate-700">
                              {(pagination.page - 1) * pagination.limit + index + 1}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">
                                {row.partnerName}
                              </div>
                              <div className="text-xs text-slate-500">{row.phone}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-700">
                              {row.zone}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  row.currentStatus === "online"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-slate-100 text-slate-800"
                                }`}
                              >
                                {row.currentStatus}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-blue-700 text-right">
                              {Number(row.dailyCommissionOwed).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-indigo-700 text-right">
                              {Number(row.weeklyCommissionOwed).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-purple-700 text-right">
                              {Number(row.monthlyCommissionOwed).toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="p-4 border-t border-slate-200 flex justify-between items-center bg-white">
                    <p className="text-sm text-slate-600">
                      Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                      {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                      {pagination.total} records
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page === 1}
                        className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50 hover:bg-slate-50"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={pagination.page === totalPages}
                        className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50 hover:bg-slate-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
