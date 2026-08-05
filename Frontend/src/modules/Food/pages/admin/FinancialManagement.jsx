import { useState, useEffect, useCallback } from "react";
import { 
  DollarSign, TrendingUp, Store, Bike, Repeat, 
  Receipt, RefreshCw, ShieldCheck, Wallet 
} from "lucide-react";
import { adminClient } from "@food/api/axios";

export default function FinancialManagement() {
  const [financialData, setFinancialData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFinancialOverview = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await adminClient.get("/food/admin/reports/financial-overview");
      if (res?.data?.success) {
        setFinancialData(res.data.data);
      }
    } catch (e) {
      console.error("Failed to fetch financial overview:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFinancialOverview();
  }, [fetchFinancialOverview]);

  const formatCurrency = (val) => {
    const num = Number(val) || 0;
    return `₹ ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin w-9 h-9 border-3 border-[#00604c] border-t-transparent rounded-full" />
      </div>
    );
  }

  const {
    adminTotalEarnings = 0,
    vendorStats = {},
    deliveryStats = {},
    subscriptionStats = {},
    summary = {}
  } = financialData || {};

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 font-sans">
      {/* Header bar with Refresh Button */}
      <div className="flex items-center justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <Wallet className="w-7 h-7 text-[#00604c]" />
            Financial Management Overview
          </h1>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            Real-time platform revenue, vendor payouts, driver earnings & customer subscription taxes.
          </p>
        </div>
        <button
          onClick={fetchFinancialOverview}
          disabled={refreshing}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00604c] hover:bg-[#004b3b] text-white font-extrabold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Financials</span>
        </button>
      </div>

      {/* Main Admin Earnings Hero Card - Fixed High Contrast Theme */}
      <div className="bg-[#00604c] rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-[#00604c] bg-white px-3 py-1 rounded-full shadow-xs">
              Platform Revenue
            </span>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight text-white mt-3">
              {formatCurrency(adminTotalEarnings)}
            </h2>
            <p className="text-xs text-emerald-100 font-semibold">
              Total Admin Net Commission & Platform Share Earned
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 bg-black/25 backdrop-blur-md p-4 rounded-2xl border border-white/20 text-left md:w-80">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-100">Total User Payments</p>
              <p className="text-xl font-black text-white mt-1">{formatCurrency(summary.totalCustomerPayments)}</p>
            </div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-100">Food Tax Collected</p>
              <p className="text-xl font-black text-white mt-1">{formatCurrency(summary.totalFoodTaxCollected)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* 1. Vendors Financials */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#00604c] flex items-center justify-center font-bold">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-800">Vendor Earnings & Payouts</h3>
                <p className="text-xs font-semibold text-slate-400">Total vendor share vs Admin payments</p>
              </div>
            </div>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-[#00604c] border border-emerald-200">
              Vendors
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
              <span className="text-xs font-bold text-slate-600">Total Vendor Earnings</span>
              <span className="text-sm font-black text-slate-800">{formatCurrency(vendorStats.totalEarned)}</span>
            </div>
            <div className="flex justify-between items-center bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-200/80">
              <span className="text-xs font-bold text-emerald-900">Paid by Admin to Vendors</span>
              <span className="text-sm font-black text-[#00604c]">{formatCurrency(vendorStats.totalPaidByAdmin)}</span>
            </div>
            <div className="flex justify-between items-center bg-amber-50/60 p-3.5 rounded-2xl border border-amber-200/80">
              <span className="text-xs font-bold text-amber-900">Vendor Wallet Balance (Pending Payout)</span>
              <span className="text-sm font-black text-amber-700">{formatCurrency(vendorStats.walletBalance ?? vendorStats.pendingBalance)}</span>
            </div>
          </div>
        </div>

        {/* 2. Delivery Boys Financials */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Bike className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-800">Delivery Boys Earnings & Payouts</h3>
                <p className="text-xs font-semibold text-slate-400">Total driver fees vs Admin payouts</p>
              </div>
            </div>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
              Delivery
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
              <span className="text-xs font-bold text-slate-600">Total Delivery Boys Earned</span>
              <span className="text-sm font-black text-slate-800">{formatCurrency(deliveryStats.totalEarned)}</span>
            </div>
            <div className="flex justify-between items-center bg-blue-50/60 p-3.5 rounded-2xl border border-blue-200/80">
              <span className="text-xs font-bold text-blue-900">Paid by Admin to Drivers</span>
              <span className="text-sm font-black text-blue-700">{formatCurrency(deliveryStats.totalPaidByAdmin)}</span>
            </div>
            <div className="flex justify-between items-center bg-amber-50/60 p-3.5 rounded-2xl border border-amber-200/80">
              <span className="text-xs font-bold text-amber-900">Driver Wallet Balance (Pending Payout)</span>
              <span className="text-sm font-black text-amber-700">{formatCurrency(deliveryStats.walletBalance ?? deliveryStats.pendingBalance)}</span>
            </div>
          </div>
        </div>

        {/* 3. Customer Subscriptions (with Tax) */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                <Repeat className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-800">Customer Subscriptions (With Tax)</h3>
                <p className="text-xs font-semibold text-slate-400">Total user subscription payments received</p>
              </div>
            </div>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-50 text-purple-600 border border-purple-200">
              Subscriptions
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center bg-purple-50/60 p-3.5 rounded-2xl border border-purple-200/80">
              <span className="text-xs font-bold text-purple-900">Subscription Pay (With Tax)</span>
              <span className="text-sm font-black text-purple-700">{formatCurrency(subscriptionStats.totalRevenueWithTax)}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
              <span className="text-xs font-bold text-slate-600">Total Subscriptions Purchased</span>
              <span className="text-sm font-black text-slate-800">{subscriptionStats.totalSubscriptions || 0} Plans</span>
            </div>
          </div>
        </div>

        {/* 4. Overall Tax & Platform Summary */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-800">Tax & Total Collection Summary</h3>
                <p className="text-xs font-semibold text-slate-400">Gross user payments & tax overview</p>
              </div>
            </div>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
              Taxes
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center bg-amber-50/60 p-3.5 rounded-2xl border border-amber-200/80">
              <span className="text-xs font-bold text-amber-900">Total Food Tax Collected</span>
              <span className="text-sm font-black text-amber-700">{formatCurrency(summary.totalFoodTaxCollected)}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
              <span className="text-xs font-bold text-slate-600">Total Gross Payments Collected</span>
              <span className="text-sm font-black text-slate-800">{formatCurrency(summary.totalCustomerPayments)}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
