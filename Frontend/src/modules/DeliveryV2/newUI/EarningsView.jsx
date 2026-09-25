import { useState, useEffect } from "react";
import { Info, Gift, CalendarDays, ShieldCheck, Coins } from "lucide-react";
import { deliveryAPI } from "@food/api";
import { toast } from "sonner";
import { Trans, useTranslation } from "react-i18next";

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

const EarningsView = ({ stats }) => {
  const { t } = useTranslation("driver");
  const [activeTab, setActiveTab] = useState("today");
  const getTotalsByTab = () => {
    const periodData = stats[activeTab === "week" ? "week" : activeTab === "month" ? "month" : "today"] || {
      deliveries: 0,
      earned: 0,
      tips: 0,
      topUp: 0
    };

    const baseData = {
      total: periodData.earned + periodData.tips + periodData.topUp,
      deliveries: periodData.earned,
      tips: periodData.tips,
      topUp: periodData.topUp,
      orders: periodData.deliveries
    };

    switch (activeTab) {
      case "today":
        return {
          ...baseData,
          progressText: "Progress 4/10",
          progressPercent: 40,
          progressDesc: "Deliver 6 more orders today to earn 25 PLN extra."
        };
      case "week":
        return {
          ...baseData,
          progressText: "Progress 8/10",
          progressPercent: 80,
          progressDesc: "Deliver 8 more shifts this week to achieve Elite partner status."
        };
      case "month":
        return {
          ...baseData,
          progressText: "Progress 10/10",
          progressPercent: 100,
          progressDesc: "Monthly quest completed! Enjoy your 250 PLN bonus payout."
        };
    }
  };
  const data = getTotalsByTab();

  const [walletBalance, setWalletBalance] = useState(0);
  const [walletData, setWalletData] = useState(null);
  
  const fetchWalletBalance = async () => {
    try {
      const walletResponse = await deliveryAPI.getWallet();
      const resData = walletResponse?.data;
      const wallet = (resData?.success && resData?.data?.wallet) || resData?.wallet || resData?.data || resData;
      const balance = Number(wallet?.totalBalance || wallet?.balance || wallet?.pocketBalance || 0);
      setWalletBalance(balance);
      setWalletData(wallet);
    } catch (error) {
      console.error("Error fetching wallet balance:", error);
    }
  };

  useEffect(() => {
    fetchWalletBalance();
  }, []);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  const handleWithdrawSubmit = async () => {
    const amount = Number(withdrawAmount);
    if (!amount || amount <= 0) {
      toast.error(t("Please enter a valid amount to withdraw"));
      return;
    }

    const pocketBalance = walletData?.pocketBalance || 0;
    const minLimit = walletData?.deliveryWithdrawalLimit || 100;

    if (amount < minLimit) {
      toast.error(t("Minimum withdrawal amount is {{minLimit}} PLN", { minLimit }));
      return;
    }

    if (amount > pocketBalance) {
      toast.error(t("Insufficient balance. Max withdrawable: {{pocketBalance}} PLN", { pocketBalance: pocketBalance.toFixed(2) }));
      return;
    }

    try {
      setWithdrawLoading(true);
      const res = await deliveryAPI.createWithdrawalRequest({ amount });
      if (res.data?.success || res.status === 201 || res.status === 200) {
        toast.success(res.data?.message || t("Withdrawal request submitted successfully!"));
        setWithdrawAmount("");
        await fetchWalletBalance();
      } else {
        toast.error(res.data?.message || t("Failed to submit withdrawal request"));
      }
    } catch (error) {
      console.error("Error creating withdrawal request:", error);
      toast.error(error?.response?.data?.message || t("Error submitting request. Please try again."));
    } finally {
      setWithdrawLoading(false);
    }
  };

  const [tipsData, setTipsData] = useState({
    totalTips: 0,
    todayTips: 0,
    weeklyTips: 0,
    monthlyTips: 0,
    history: []
  });
  const [tipsLoading, setTipsLoading] = useState(true);

  useEffect(() => {
    const fetchTips = async () => {
      try {
        const res = await deliveryAPI.getTips();
        if (res.data?.success) {
          setTipsData(res.data.data);
        }
      } catch (err) {
        console.error("Error fetching tips stats:", err);
      } finally {
        setTipsLoading(false);
      }
    };
    fetchTips();
  }, []);

  const [addons, setAddons] = useState([]);
  const [addonsLoading, setAddonsLoading] = useState(true);

  useEffect(() => {
    const fetchAddons = async () => {
      try {
        const res = await deliveryAPI.getActiveEarningAddons();
        if (res?.data?.success) {
          setAddons(res.data.data?.offers || []);
        }
      } catch (err) {
        console.error("Error fetching earning addons:", err);
      } finally {
        setAddonsLoading(false);
      }
    };
    fetchAddons();
  }, []);

  return <div className="space-y-4 pb-12 animate-fadeIn text-gray-800">
      {
    /* Tab Switchers */
  }
      <div className="flex bg-[#ebefeb] rounded-2xl p-1 gap-1 border border-[#e0e3e0]">
        {["today", "week", "month"].map((tab) => <button
    key={tab}
    onClick={() => setActiveTab(tab)}
    className={`flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-200 ${activeTab === tab ? "bg-white text-[#00604c] shadow-sm" : "text-[#3e4945] hover:bg-[#e0e3e0]"}`}
  >
            {tab === "today" ? t("Today") : tab === "week" ? t("This week") : t("Month")}
          </button>)}
      </div>

      {
    /* Primary Balance Summary Card */
  }
      <section className="bg-white border border-[#e0e3e0]/80 rounded-2xl p-5 shadow-sm">
        <div className="flex justify-between items-start mb-2">
          <span className="text-[11px] font-bold text-[#3e4945] uppercase tracking-widest">
            {activeTab === "today" ? t("Today's Total") : activeTab === "week" ? t("Weekly Total") : t("Monthly Total")}
          </span>
          <Info className="w-4 h-4 text-[#bec9c3] cursor-pointer" />
        </div>
        
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-extrabold text-[#00604c] tracking-tight">{walletBalance > 0 ? walletBalance.toFixed(2) : data.total.toFixed(2)}</span>
          <span className="text-sm font-bold text-[#00604c] opacity-80 uppercase">{t("PLN")}</span>
        </div>

        <hr className="my-4 border-[#e0e3e0]" />

        <div className="space-y-3.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-[#3e4945]">{t("Delivery earnings")}</span>
            <span className="font-bold text-gray-900">{t("{{deliveries}} PLN", { deliveries: data.deliveries.toFixed(2) })}</span>
          </div>
          
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-[#3e4945]">{t("Tips")}</span>
            <div className="flex items-center gap-1.5">
              {activeTab === "today" && <span className="bg-[#9ef3d7] text-[#005140] text-[8px] font-extrabold px-1.5 py-0.5 rounded-full tracking-wider animate-pulse">
                  {t("NEW")}
                </span>}
              <span className="font-bold text-gray-900">{t("{{tips}} PLN", { tips: data.tips.toFixed(2) })}</span>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-[#3e4945]">{t("Guarantee top-up")}</span>
            <span className="font-bold text-gray-900">{t("{{topUp}} PLN", { topUp: data.topUp.toFixed(2) })}</span>
          </div>
        </div>
      </section>

      {/* Withdrawal Request Section */}
      <section className="bg-white border border-[#e0e3e0]/80 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h4 className="font-extrabold text-sm text-[#181d1b]">{t("AVAILABLE TO WITHDRAW")}</h4>
            <p className="text-[11px] text-[#3e4945] font-semibold mt-0.5">
              <Trans t={t} i18nKey={"Pocket Balance: <0>{{pocketBalance}} PLN</0>"} defaults={"Pocket Balance: <0>{{pocketBalance}} PLN</0>"} values={{ pocketBalance: walletData?.pocketBalance?.toFixed(2) || "0.00" }} components={[<span 
                className="font-bold text-[#00604c] cursor-pointer hover:underline"
                onClick={() => setWithdrawAmount(String(walletData?.pocketBalance || 0))}
                title={t("Click to fill full balance")} />]} />
            </p>
          </div>
          <span className="text-[10px] font-bold text-[#3e4945] bg-[#ebefeb] px-2.5 py-1 rounded-lg">
            {t("Min Limit: {{deliveryWithdrawalLimit}} PLN", { deliveryWithdrawalLimit: walletData?.deliveryWithdrawalLimit || 100 })}
          </span>
        </div>

        {withdrawLoading ? (
          <div className="text-center py-2 text-xs font-bold text-[#00604c] animate-pulse">{t("Processing withdrawal request...")}</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="number"
                placeholder={t("Enter amount to withdraw")}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="flex-1 px-3 py-2.5 text-xs border border-[#e0e3e0] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#00604c] font-semibold h-11"
                min="1"
              />
              <button
                onClick={handleWithdrawSubmit}
                className="bg-[#00604c] text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-[#1f7a63] cursor-pointer shadow-sm active:scale-95 transition-transform shrink-0 h-11"
              >
                {t("REQUEST WITHDRAWAL")}
              </button>
            </div>
          </div>
        )}
      </section>

      {
    /* Bonus Challenge Cards (Dynamic from API) */
  }
      {addons.length > 0 ? (
        addons.map((addon) => {
          const progressPercent = Math.min(100, Math.round((addon.currentOrders / addon.targetOrders) * 100)) || 0;
          return (
            <section key={addon.id} className="bg-white border border-[#bec9c3] rounded-2xl p-5 relative overflow-hidden shadow-sm">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-[#a3574c]" />
              
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <Gift className="w-5 h-5 text-[#854036]" />
                  <h3 className="font-extrabold text-gray-900 text-sm">{addon.title}</h3>
                </div>
                <span className="text-[10px] uppercase font-extrabold text-[#854036] bg-[#ffebe8] px-2 py-0.5 rounded">
                  {t("Progress {{currentOrders}}/{{targetOrders}}", { currentOrders: addon.currentOrders, targetOrders: addon.targetOrders })}
                </span>
              </div>

              <div className="w-full bg-[#e5e9e5] h-2.5 rounded-full overflow-hidden mb-2.5">
                <div
                  className="bg-[#a3574c] h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              
              <p className="text-xs text-[#3e4945] font-medium leading-relaxed">
                {progressPercent >= 100 
                  ? t("Completed! Enjoy your {{targetAmount}} PLN bonus payout.", { targetAmount: addon.targetAmount }) 
                  : t("Deliver {{targetOrders}} more orders to earn {{targetAmount}} PLN extra.", { targetOrders: addon.targetOrders - addon.currentOrders, targetAmount: addon.targetAmount })}
              </p>
            </section>
          );
        })
      ) : (
        <section className="bg-white border border-dashed border-[#bec9c3] rounded-2xl p-5 text-center text-[#5d5f5b] shadow-sm">
          <div className="flex justify-center mb-3">
            <Gift className="w-8 h-8 text-[#bec9c3]" />
          </div>
          <h3 className="font-extrabold text-gray-900 text-sm mb-1">{t("No Earning Addon Offers Available")}</h3>
          <p className="text-xs font-medium">{t("Check back later for new bonus challenges and earning opportunities.")}</p>
        </section>
      )}

      {
    /* 7-Day Chart Section drawing beautiful custom visual layout blocks echoing the screenshot */
  }
      <section className="bg-white border border-[#e0e3e0] rounded-2xl p-5 shadow-sm space-y-3">
        <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest mb-4">{t("7-DAY HISTORIC EARNINGS")}</h3>
        
        <div className="flex items-end justify-between h-36 gap-2 pt-2">
          {
    /* Monday */
  }
          <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div className="w-full bg-[#e0e3e0] rounded-t-lg transition-all hover:bg-[#bec9c3]" style={{ height: "35%" }} title={t("Monday: 45 PLN")} />
            <span className="text-[9px] font-bold text-[#3e4945]">{t("Mon")}</span>
          </div>
          
          {
    /* Tuesday */
  }
          <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div className="w-full bg-[#e0e3e0] rounded-t-lg transition-all hover:bg-[#bec9c3]" style={{ height: "65%" }} title={t("Tuesday: 92 PLN")} />
            <span className="text-[9px] font-bold text-[#3e4945]">{t("Tue")}</span>
          </div>
          
          {
    /* Wednesday */
  }
          <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div className="w-full bg-[#e0e3e0] rounded-t-lg transition-all hover:bg-[#bec9c3]" style={{ height: "50%" }} title={t("Wednesday: 70 PLN")} />
            <span className="text-[9px] font-bold text-[#3e4945]">{t("Wed")}</span>
          </div>
          
          {
    /* Thursday */
  }
          <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div className="w-full bg-[#e0e3e0] rounded-t-lg transition-all hover:bg-[#bec9c3]" style={{ height: "80%" }} title={t("Thursday: 115 PLN")} />
            <span className="text-[9px] font-bold text-[#3e4945]">{t("Thu")}</span>
          </div>
          
          {
    /* Friday (ACTIVE Selected Hottest!) */
  }
          <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div className="w-full bg-[#00604c] rounded-t-lg shadow-sm" style={{ height: "100%" }} title={t("Friday: 144 PLN (Hottest Day)")} />
            <span className="text-[9px] font-extrabold text-[#00604c] underline">{t("Fri")}</span>
          </div>
          
          {
    /* Saturday */
  }
          <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div className="w-full bg-[#e0e3e0] rounded-t-lg transition-all hover:bg-[#bec9c3]" style={{ height: "25%" }} title={t("Saturday: 30 PLN")} />
            <span className="text-[9px] font-bold text-[#3e4945]">{t("Sat")}</span>
          </div>
          
          {
    /* Sunday */
  }
          <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div className="w-full bg-[#e0e3e0] rounded-t-lg transition-all hover:bg-[#bec9c3]" style={{ height: "18%" }} title={t("Sunday: 22 PLN")} />
            <span className="text-[9px] font-bold text-[#3e4945]">{t("Sun")}</span>
          </div>
        </div>
      </section>

      {
    /* Payout Information Section */
  }
      <section className="bg-white border border-[#e0e3e0] rounded-2xl p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-[#9ef3d7] rounded-full flex items-center justify-center text-[#005140]">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-extrabold text-sm text-[#181d1b]">{t("AUTOMATED PAYOUT")}</h4>
            <p className="text-xs text-[#3e4945] font-medium">{t("Next payout: Friday 16 May")}</p>
          </div>
        </div>
        <button className="bg-[#00604c] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#1f7a63] cursor-pointer shadow-sm active:scale-95 transition-transform">
          {t("DETAILS")}
        </button>
      </section>

      {
    /* Min Guarantee Status Badge */
  }
      <div className="bg-[#00604c]/5 border border-[#00604c]/20 rounded-2xl p-4 flex gap-3 shadow-xs">
        <ShieldCheck className="w-5 h-5 text-[#00604c] flex-shrink-0" />
        <div className="space-y-0.5">
          <p className="font-bold text-sm text-[#00604c]">{t("Min guarantee active")}</p>
          <p className="text-xs text-[#3e4945] leading-relaxed">
            <Trans t={t} i18nKey={"You are earning a minimum of <0>32 PLN/hr guaranteed</0> for this active shift. Keep accepting assignments!"} defaults={"You are earning a minimum of <0>32 PLN/hr guaranteed</0> for this active shift. Keep accepting assignments!"} components={[<span className="font-bold" />]} />
          </p>
        </div>
      </div>

      {/* Dedicated Tips Overview & History Section */}
      <section className="bg-white border border-[#e0e3e0] rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-500 fill-amber-500" />
            <h3 className="font-extrabold text-gray-900 text-sm">{t("Tips Overview")}</h3>
          </div>
          <span className="text-xs font-bold text-gray-500 bg-slate-100 px-2.5 py-1 rounded-lg">
            {t("Total: ₹{{totalTips}}", { totalTips: tipsData.totalTips.toFixed(2) })}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-slate-50 border border-gray-100 rounded-xl p-3 text-center">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">{t("Today")}</span>
            <span className="text-sm font-extrabold text-gray-800">₹{tipsData.todayTips.toFixed(2)}</span>
          </div>
          <div className="bg-slate-50 border border-gray-100 rounded-xl p-3 text-center">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">{t("This Week")}</span>
            <span className="text-sm font-extrabold text-gray-800">₹{tipsData.weeklyTips.toFixed(2)}</span>
          </div>
          <div className="bg-slate-50 border border-gray-100 rounded-xl p-3 text-center">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">{t("This Month")}</span>
            <span className="text-sm font-extrabold text-gray-800">₹{tipsData.monthlyTips.toFixed(2)}</span>
          </div>
        </div>

        <hr className="border-[#e0e3e0]/60 my-2" />

        <div>
          <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2.5">{t("Recent Tip History")}</h4>
          {tipsLoading ? (
            <div className="py-4 text-center text-xs text-gray-400">{t("Loading tip history...")}</div>
          ) : tipsData.history.length === 0 ? (
            <div className="py-4 text-center text-xs text-gray-400 font-medium">{t("No tips received yet.")}</div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {tipsData.history.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center bg-slate-50/50 border border-slate-100 hover:border-slate-200 transition-colors p-2.5 rounded-xl text-xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-gray-700">{t("Order #{{orderId}}", { orderId: item.orderId })}</span>
                    <span className="text-[10px] text-gray-400 block">
                      {new Date(item.date).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                  </div>
                  <span className="font-extrabold text-emerald-600 font-sans">+₹{item.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {
    /* Visual Anchor Poster: Courier on the road */
  }
      <div className="relative w-full h-40 rounded-2xl overflow-hidden shadow-sm grayscale hover:grayscale-0 transition-all duration-700">
        <img
    alt={t("Driver on bike delivering food")}
    className="w-full h-full object-cover"
    src="https://images.unsplash.com/photo-1593950315186-76a92975b60c?auto=format&fit=crop&q=80&w=600"
  />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-white text-base font-extrabold tracking-wide">{t("Keep it fresh")}</p>
          <p className="text-gray-200 text-xs mt-0.5">{t("Your average delivery rating: 4.95 ★")}</p>
        </div>
      </div>
    </div>;
};
export {
  EarningsView
};
