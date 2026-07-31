/**
 * EarningsManager — Live vendor earnings with dynamic commission breakdown.
 * Data source: GET /food/restaurant/earnings
 */

import { useState, useEffect } from 'react';
import { dmbVendorAPI } from '../../../services/api/index';
import { AlertCircle, Wallet, Receipt, Info, Inbox, Truck, CheckCircle, ShoppingBag, Coins, Landmark } from 'lucide-react';

function fmt(n) {
  const num = Number(n) || 0;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function EarningsManager({ transactions, onAddTransaction }) {
  const [subView, setSubView] = useState('summary');
  const [loading, setLoading] = useState(true);
  const [earningsData, setEarningsData] = useState(null);
  const [error, setError] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  useEffect(() => {
    fetchEarnings();
  }, []);

  const fetchEarnings = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await dmbVendorAPI.getVendorEarningsSummary();
      const data = res?.data?.data;
      if (data) {
        setEarningsData(data);
      } else {
        setError('No earnings data available yet.');
      }
    } catch (err) {
      console.error('Earnings fetch failed:', err);
      setError('Could not load earnings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const summary = earningsData?.summary || {};
  const rates = earningsData?.commissionRates || {};
  const recentTx = earningsData?.recentTransactions || [];

  const availableBalance = Number(summary.availableBalance ?? 0);
  const grossEarnings = Number(summary.grossEarnings ?? 0);
  const commVatDed = Number(summary.commissionVatDeduction ?? 0);
  const platVatDed = Number(summary.platformCommissionVatDeduction ?? 0);
  const foodVatDed = Number(summary.foodVatDeduction ?? 0);
  const totalDeductions = Number(summary.totalDeductions ?? 0);
  const netEarnings = Number(summary.netEarnings ?? 0);
  const totalOrders = Number(summary.totalOrders ?? 0);

  const commissionVatRate = Number(rates.commissionVatRate ?? 0);
  const platformCommissionVatRate = Number(rates.platformCommissionVatRate ?? 0);
  const foodVatRate = Number(rates.foodVatRate ?? 0);

  return (
    <div className="flex-grow pt-4 pb-[99px] md:pb-6 font-sans px-4 select-none max-w-7xl mx-auto w-full text-left relative">

      {/* Subview Toggle Tabs */}
      <div className="flex gap-2 my-3">
        <button
          onClick={() => setSubView('summary')}
          className={`flex-1 py-2 text-center text-[12px] font-bold rounded-lg border transition-all cursor-pointer ${
            subView === 'summary'
              ? 'bg-primary text-white border-primary shadow-xs'
              : 'bg-white text-primary border-primary hover:bg-primary/5'
          }`}>
          Earnings Summary
        </button>
        <button
          onClick={() => setSubView('transactions')}
          className={`flex-grow py-2 text-center text-[12px] font-bold rounded-lg border transition-all cursor-pointer ${
            subView === 'transactions'
              ? 'bg-primary text-white border-primary shadow-xs'
              : 'bg-white text-primary border-primary hover:bg-primary/5'
          }`}>
          Recent Orders
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-[13px] text-outline font-medium">Loading earnings...</p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <AlertCircle className="text-[48px] text-error/60" />
          <p className="text-[13px] text-on-surface-variant font-medium">{error}</p>
          <button
            onClick={fetchEarnings}
            className="px-4 py-2 bg-primary text-white text-[12px] font-bold rounded-lg active:scale-95 transition-transform">
            Retry
          </button>
        </div>
      )}

      {/* Summary View */}
      {!loading && !error && subView === 'summary' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 space-y-0 animate-fadeIn">
          <div className="space-y-4">
            {/* Available Balance Card */}
            <div className="bg-primary-container text-on-primary rounded-xl p-5 shadow-sm relative overflow-hidden transition-all hover:scale-[1.01] duration-300">
              <div className="absolute -right-4 -top-4 opacity-10">
                <Wallet className="!text-[100px]" style={{ fontVariationSettings: "'FILL' 1" }} />
              </div>
              <div className="relative z-10 text-left">
                <p className="text-[11px] uppercase tracking-wider text-white/80 font-bold">Available Balance</p>
                <div className="mt-2 text-3xl font-extrabold text-white">{fmt(availableBalance)}</div>
                <div className="mt-1 flex items-center text-[12px] text-white/85">
                  <Receipt className="text-[14px] mr-1" />
                  {totalOrders} total delivered orders
                </div>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Total Orders', value: totalOrders, icon: ShoppingBag },
                { label: 'Gross Earnings', value: fmt(grossEarnings), icon: Coins, small: true },
                { label: 'Net Earnings', value: fmt(netEarnings), icon: Landmark, small: true },
              ].map((stat, i) => {
                const IconComp = stat.icon;
                return (
                <div key={i} className="bg-white rounded-xl p-3 shadow-xs border border-outline-variant/15 text-center">
                  <IconComp className="text-primary w-5 h-5 mx-auto" />
                  <p className={`font-extrabold text-on-surface mt-1 ${stat.small ? 'text-[11px]' : 'text-[16px]'}`}>
                    {stat.value}
                  </p>
                  <p className="text-[9px] text-outline uppercase font-bold mt-0.5">{stat.label}</p>
                </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            {/* VAT Breakdown Card */}
            <div className="bg-surface-container-lowest rounded-xl p-4 shadow-xs border border-outline-variant/25 text-left">
              <div className="flex justify-between items-center mb-3 border-b border-outline-variant/15 pb-2">
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-outline">Earnings Breakdown</h2>
                <Info className="text-[16px] text-outline" />
              </div>

              <div className="space-y-2.5 text-[13px] font-medium">
                {/* Gross */}
                <div className="flex justify-between items-center">
                  <span className="text-on-surface-variant">Gross Meal Revenue</span>
                  <span className="font-bold text-on-surface">{fmt(grossEarnings)}</span>
                </div>

                {/* Commission VAT */}
                {(commissionVatRate > 0 || commVatDed > 0) && (
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-on-surface-variant">Commission VAT {commissionVatRate > 0 ? `${commissionVatRate}%` : ''}</span>
                      <span className="text-[10px] text-outline italic font-medium leading-none mt-0.5">(platform fee)</span>
                    </div>
                    <span className="bg-error/5 text-error px-2.5 py-0.5 rounded-full font-bold text-[12px]">
                      -{fmt(commVatDed)}
                    </span>
                  </div>
                )}

                {/* Platform Commission VAT */}
                {(platformCommissionVatRate > 0 || platVatDed > 0) && (
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-on-surface-variant">Platform Commission VAT {platformCommissionVatRate > 0 ? `${platformCommissionVatRate}%` : ''}</span>
                      <span className="text-[10px] text-outline italic font-medium leading-none mt-0.5">(platform VAT)</span>
                    </div>
                    <span className="bg-error/5 text-error px-2.5 py-0.5 rounded-full font-bold text-[12px]">
                      -{fmt(platVatDed)}
                    </span>
                  </div>
                )}

                {/* Food VAT */}
                {(foodVatRate > 0 || foodVatDed > 0) && (
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-on-surface-variant">Food VAT {foodVatRate > 0 ? `${foodVatRate}%` : ''}</span>
                      <span className="text-[10px] text-outline italic font-medium leading-none mt-0.5">(you declare)</span>
                    </div>
                    <span className="bg-secondary-container/10 text-on-secondary-container px-2.5 py-0.5 rounded-full font-bold text-[12px]">
                      -{fmt(foodVatDed)}
                    </span>
                  </div>
                )}

                {/* No deductions configured */}
                {commissionVatRate === 0 && platformCommissionVatRate === 0 && foodVatRate === 0 && totalDeductions === 0 && (
                  <div className="text-[12px] text-outline italic py-1">
                    No commission rates configured by admin yet.
                  </div>
                )}

                <hr className="border-outline-variant/20 my-2" />

                <div className="flex justify-between items-center py-0.5">
                  <span className="font-bold text-on-surface">NET PAYOUT TO YOU</span>
                  <span className="text-xl font-extrabold text-primary">{fmt(netEarnings)}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-outline">Available (after withdrawals)</span>
                  <span className="text-[12px] font-bold text-on-surface">{fmt(availableBalance)}</span>
                </div>
              </div>
            </div>

            {/* No earnings yet */}
            {totalOrders === 0 && (
              <div className="bg-white rounded-xl p-6 shadow-xs border border-outline-variant/15 text-center">
                <Receipt className="text-[40px] text-outline/60" />
                <p className="text-[13px] text-on-surface-variant font-medium mt-2">No completed orders yet.</p>
                <p className="text-[11px] text-outline mt-1">Earnings will appear here once orders are delivered.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Transactions View */}
      {!loading && !error && subView === 'transactions' && (
        <div className="space-y-4 animate-fadeIn">

          <div className="flex justify-between items-center px-1">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-outline">Recent Orders</h2>
            <span className="text-[11px] text-outline font-medium">{recentTx.length} records</span>
          </div>

          {recentTx.length === 0 ? (
            <div className="bg-white rounded-xl p-6 text-center shadow-xs border border-outline-variant/15">
              <Inbox className="text-[40px] text-outline/60" />
              <p className="text-[13px] text-on-surface-variant font-medium mt-2">No transactions yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 space-y-0 bg-transparent rounded-xl overflow-hidden">
              {recentTx.map((tx, idx) => (
                <div
                  key={tx.transactionId || idx}
                  onClick={() => triggerToast(`Order ${tx.orderId} — Net: ${fmt(tx.netAmount)} (Gross: ${fmt(tx.grossAmount)})`)}
                  className="p-4 flex justify-between items-center bg-white rounded-xl border border-outline-variant/15 active:bg-surface-container/10 hover:bg-surface-container/5 transition-all cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary/10 text-primary">
                      <Truck className="text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }} />
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="font-bold text-[13px] text-on-surface">
                        {tx.orderId ? `#${tx.orderId}` : 'Order'}
                      </span>
                      <span className="text-[11px] text-outline font-medium">{formatDate(tx.createdAt)}</span>
                      {tx.foodNames && (
                        <span className="text-[10px] text-outline/70 font-medium max-w-[160px] truncate">{tx.foodNames}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-extrabold text-[14px] text-primary">+{fmt(tx.netAmount)}</span>
                    <span className="text-[10px] text-outline font-medium">Gross: {fmt(tx.grossAmount)}</span>
                    {(tx.commissionVatAmount + tx.platformCommissionVatAmount + tx.foodVatAmount) > 0 && (
                      <span className="text-[10px] text-error font-medium">
                        -{fmt(tx.commissionVatAmount + tx.platformCommissionVatAmount + tx.foodVatAmount)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      <div
        className={`fixed bottom-24 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 transition-all duration-300 z-100 ${
          showToast ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95 pointer-events-none'
        }`}>
        <CheckCircle className="text-green-400" />
        <span className="font-bold text-[13px]">{toastMessage}</span>
      </div>
    </div>
  );
}