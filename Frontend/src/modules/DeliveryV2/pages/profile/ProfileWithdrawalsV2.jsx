import React, { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Calendar } from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

export const ProfileWithdrawalsV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [walletData, setWalletData] = useState(null);

  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const response = await deliveryAPI.getWallet();
        const resData = response?.data;
        const wallet = (resData?.success && resData?.data?.wallet) || resData?.wallet || resData?.data || resData;
        setWalletData(wallet);
      } catch (e) {
        toast.error("Failed to load details");
      } finally {
        setLoading(false);
      }
    };
    fetchWallet();
  }, []);

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-8 h-8 animate-spin text-[#00604c]" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 font-poppins">
       <div className="bg-white px-4 py-5 flex items-center gap-4 fixed top-0 w-full z-50 shadow-sm">
          <button onClick={goBack}><ArrowLeft className="w-6 h-6" /></button>
          <h1 className="text-xl font-black">Withdrawal Requests</h1>
       </div>

       <div className="pt-24 px-4 pb-10 space-y-4">
          {(() => {
            const withdrawals = (walletData?.transactions || []).filter(tx => tx.type === "withdrawal");
            if (withdrawals.length === 0) {
              return (
                <div className="bg-white rounded-2xl p-8 text-center border border-gray-100 shadow-sm flex flex-col items-center justify-center space-y-3">
                  <Calendar className="w-12 h-12 text-[#bec9c3]" />
                  <p className="text-sm text-gray-500 font-semibold">
                    No recent withdrawal requests.
                  </p>
                </div>
              );
            }
            return withdrawals.map((tx) => (
              <div key={tx.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold text-gray-950">{tx.amount.toFixed(2)} PLN</p>
                  <p className="text-[11px] text-gray-500 font-semibold mt-1">{formatDate(tx.date)}</p>
                </div>
                <span className={`text-[10px] font-extrabold px-3 py-1 rounded-lg border uppercase tracking-wider ${
                  tx.status === "Pending" ? "bg-amber-50 text-amber-700 border-amber-200/50" :
                  tx.status === "Completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200/50" :
                  "bg-red-50 text-red-700 border-red-200/50"
                }`}>
                  {tx.status === "Completed" ? "Approved" : tx.status}
                </span>
              </div>
            ));
          })()}
       </div>
    </div>
  );
};

export default ProfileWithdrawalsV2;
