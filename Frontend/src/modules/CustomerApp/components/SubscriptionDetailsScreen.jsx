import { useState, useEffect } from "react";
import { dmbCustomerAPI } from "@food/api";
import { ClipboardList, PauseCircle, XCircle, PlayCircle, AlertTriangle, Loader2, ArrowLeft } from 'lucide-react';
import useDeliverySlots from "../../../shared/hooks/useDeliverySlots";
import { Trans, useTranslation } from "react-i18next";

export function SubscriptionDetailsScreen({ onGoBack, onGoToPlans, onShowNotificationToast }) {
  const { t } = useTranslation("customer");
  const { label: slotName } = useDeliverySlots();
  const [subscriptions, setSubscriptions] = useState([]);
  const [pantryOrders, setPantryOrders] = useState([]);
  const [activeTab, setActiveTab] = useState("meals");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  // Modals for pause & cancel actions
  const [showPauseModal, setShowPauseModal] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  // Input states for actions
  const [pauseDays, setPauseDays] = useState(1);
  const [pauseReason, setPauseReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const fetchSubscriptions = async () => {
    setLoading(true);
    setError("");
    try {
      const [subsRes, pantryRes] = await Promise.all([
        dmbCustomerAPI.getMySubscriptions().catch(err => { throw err; }),
        dmbCustomerAPI.getMyPantryOrders().catch(() => ({ data: { success: false } }))
      ]);

      if (subsRes.data?.success) {
        setSubscriptions(subsRes.data.subscriptions || []);
      } else {
        setError(t("Failed to load subscription details."));
      }

      if (pantryRes?.data?.success) {
        setPantryOrders(pantryRes.data.orders || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || t("Failed to load subscriptions."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const handlePause = async (e) => {
    e.preventDefault();
    if (!showPauseModal) return;
    setActionLoading(true);
    try {
      await dmbCustomerAPI.pauseSubscription(
        showPauseModal.subscriptionId,
        pauseDays,
        pauseReason
      );
      onShowNotificationToast(t("⏸️ Subscription paused successfully!"));
      setShowPauseModal(null);
      setPauseReason("");
      setPauseDays(1);
      fetchSubscriptions();
    } catch (err) {
      onShowNotificationToast(err.response?.data?.message || err.message || t("Failed to pause subscription."));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async (e) => {
    e.preventDefault();
    if (!showCancelModal) return;
    setActionLoading(true);
    try {
      await dmbCustomerAPI.cancelSubscription(
        showCancelModal.subscriptionId,
        cancelReason
      );
      onShowNotificationToast(" " + t("Subscription cancelled successfully."));
      setShowCancelModal(null);
      setCancelReason("");
      fetchSubscriptions();
    } catch (err) {
      onShowNotificationToast(err.response?.data?.message || err.message || t("Failed to cancel subscription."));
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async (sub) => {
    setActionLoading(true);
    try {
      await dmbCustomerAPI.resumeSubscription(sub.subscriptionId);
      onShowNotificationToast(t("▶️ Subscription resumed successfully!"));
      fetchSubscriptions();
    } catch (err) {
      onShowNotificationToast(err.response?.data?.message || err.message || t("Failed to resume subscription."));
    } finally {
      setActionLoading(false);
    }
  };

  // Helper to calculate Expiry Date based on startDate and duration
  const getExpiryDate = (sub) => {
    if (sub.endDate) {
      return new Date(sub.endDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    }
    if (!sub.startDate) return "N/A";
    const start = new Date(sub.startDate);
    const dur = sub.duration || "weekly";
    const end = new Date(start);
    if (dur === "weekly") {
      end.setDate(start.getDate() + 7);
    } else if (dur === "monthly") {
      end.setDate(start.getDate() + 30);
    } else if (dur === "one_day") {
      end.setDate(start.getDate() + 1);
    } else {
      end.setDate(start.getDate() + 7);
    }
    return end.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  // Compute how many calendar days remain in the subscription
  const getRemainingDays = (sub) => {
    const endRaw = sub.endDate
      ? new Date(sub.endDate)
      : (() => {
          if (!sub.startDate) return null;
          const s = new Date(sub.startDate);
          const e = new Date(s);
          if (sub.duration === "monthly") e.setDate(s.getDate() + 30);
          else if (sub.duration === "one_day") e.setDate(s.getDate() + 1);
          else e.setDate(s.getDate() + 7);
          return e;
        })();
    if (!endRaw) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endRaw);
    end.setHours(0, 0, 0, 0);
    return Math.round((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case "active":
        return "bg-[#E8F3F0] text-primary border-[#1f7a63]/20";
      case "paused":
        return "bg-amber-50 text-amber-700 border-amber-200/50";
      case "cancelled":
        return "bg-red-50 text-brand-red border-red-200/50";
      case "expired":
        return "bg-gray-100 text-gray-500 border-gray-200";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const handleDownloadInvoice = async (sub) => {
    try {
      setDownloadingId(sub._id);
      const token = localStorage.getItem("user_accessToken");
      const url = `${import.meta.env.VITE_API_BASE_URL || "/api"}/food/user/invoices/${sub._id}/download`;
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
  
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to download invoice. Check VAT profile settings.");
      }
  
      const blob = await response.blob();
      const objUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objUrl;
      link.download = `Invoice-${sub.subscriptionId || sub._id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objUrl);
      onShowNotificationToast(t("🧾 Invoice downloaded successfully!"));
    } catch (error) {
      onShowNotificationToast(error.message);
    } finally {
      setDownloadingId(null);
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "active":
        return t("Active");
      case "paused":
        return t("Paused");
      case "cancelled":
        return t("Cancelled");
      case "expired":
        return t("Expired");
      case "pending_payment":
        return t("Pending Payment");
      default:
        return status;
    }
  };

  return (
    <div className="bg-[#F5F5F0] text-[#1b1c1c] min-h-[880px] pb-32">
      {/* Header */}
      <header className="fixed top-0 left-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
        <button onClick={onGoBack} className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"><ArrowLeft size={24} /></button>
        <h1 className="text-xl font-extrabold text-primary text-center">{t("My Subscriptions")}</h1>
        <div className="w-8" />
      </header>

      <main className="pt-20 pb-12 px-4 sm:px-8 lg:px-10 w-full max-w-7xl mx-auto space-y-6">
        {/* Tabs */}
        <section className="flex bg-white rounded-full p-1 shadow-sm border border-[#e4e2e1]/30">
          <button 
            onClick={() => setActiveTab('meals')}
            className={`flex-1 py-2 text-[14px] font-bold rounded-full transition-all ${activeTab === 'meals' ? 'bg-primary text-white shadow-md' : 'text-on-surface hover:bg-[#f6f3f2]'}`}
          >
            {t("Meal Box")}
          </button>
          <button 
            onClick={() => setActiveTab('pantry')}
            className={`flex-1 py-2 text-[14px] font-bold rounded-full transition-all ${activeTab === 'pantry' ? 'bg-primary text-white shadow-md' : 'text-on-surface hover:bg-[#f6f3f2]'}`}
          >
            {t("Pantry")}
          </button>
        </section>

        {error && (
          <div className="p-3 bg-red-50 text-brand-red rounded-xl text-xs font-semibold border border-red-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center pt-20 gap-3 text-on-surface-variant">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold uppercase tracking-wider">{t("Loading subscriptions...")}</p>
          </div>
        ) : activeTab === "meals" ? (
          subscriptions.length === 0 ? (
            <section className="bg-white rounded-3xl p-8 text-center border border-[#bec9c3]/20 shadow-sm max-w-sm mx-auto mt-8 space-y-6">
            <div className="w-16 h-16 bg-[#E8F3F0] text-primary rounded-full flex items-center justify-center mx-auto shadow-inner">
              <ClipboardList className="text-[32px]" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-extrabold text-on-surface">{t("No Active Subscriptions")}</h2>
              <p className="text-xs text-[#6e7a74] leading-relaxed">
                {t("Subscribe to a meal plan to enjoy fresh, vendor-prepared meals delivered daily to your door.")}
              </p>
            </div>
            <button
              onClick={onGoToPlans}
              className="w-full bg-primary hover:bg-[#155a49] text-white py-3.5 rounded-2xl font-bold text-sm shadow-md active:scale-95 transition-transform"
            >
              {t("Browse Meal Plans")}
            </button>
          </section>
        ) : (
          <div className="space-y-5">
            {subscriptions.map((sub) => {
              const durationLabel = sub.duration ? sub.duration.charAt(0).toUpperCase() + sub.duration.slice(1) : "Weekly";
              const mealList = (sub.meals && sub.meals.length > 0) 
                ? sub.meals.map(m => `${m.mealPlanId?.name || "Meal Plan"} x${m.quantity || 1}`).join(", ") 
                : (sub.mealPlanId?.name || "Standard Plan");

              return (
                <div key={sub._id} className="bg-white rounded-2xl p-5 shadow-sm border border-[#bec9c3]/20 space-y-4 hover:shadow-md transition-shadow">
                  {/* Card Top / Header */}
                  <div className="flex justify-between items-start gap-2 border-b border-[#f2eff0] pb-3">
                    <div>
                      <h2 className="text-base font-extrabold text-on-surface">
                        {sub.vendorId?.restaurantName || t("DailyMealBox Vendor")}
                      </h2>
                      <span className="text-[10px] font-bold text-[#6e7a74] uppercase tracking-wider">
                        {t("ID:")} {sub.subscriptionId || t("N/A")}
                      </span>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getStatusBadgeClass(sub.status)}`}>
                      {getStatusLabel(sub.status)}
                    </span>
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs font-medium">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-[#6e7a74] uppercase tracking-wider block font-bold">{t("Plan Details")}</span>
                      <span className="text-[#1b1c1c] font-bold block">{t("{{durationLabel}} Plan", { durationLabel })}</span>
                      <span className="text-[11px] text-on-surface-variant block">{mealList}</span>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] text-[#6e7a74] uppercase tracking-wider block font-bold">{t("Delivery Preferences")}</span>
                      <span className="text-[#1b1c1c] font-bold block">
                        {sub.deliverySlots && sub.deliverySlots.length > 0
                          ? sub.deliverySlots.map(s => slotName(s)).join(", ")
                          : (sub.deliverySlot ? slotName(sub.deliverySlot) : "")}
                      </span>
                      <span className="text-[11px] text-on-surface-variant block">
                        {sub.deliveryDays === "mon_fri" ? t("Monday - Friday") : t("Full Week")}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] text-[#6e7a74] uppercase tracking-wider block font-bold">{t("Dates")}</span>
                      <div className="text-[11px] text-on-surface-variant space-y-0.5">
                        <div>{t("Purchase:")} <span className="text-[#1b1c1c] font-bold">{formatDate(sub.createdAt)}</span></div>
                        <div>{t("Start:")} <span className="text-[#1b1c1c] font-bold">{formatDate(sub.startDate)}</span></div>
                        <div>{t("Expiry:")} <span className="text-[#1b1c1c] font-bold">{getExpiryDate(sub)}</span></div>
                      </div>
                    </div>

                    <div className="space-y-0.5 text-right">
                      <span className="text-[10px] text-[#6e7a74] uppercase tracking-wider block font-bold">{t("Amount Paid")}</span>
                      <span className="text-lg font-extrabold text-primary block mt-1">
                        {sub.pricing?.totalPrice ? Number(sub.pricing.totalPrice).toFixed(2) : "0.00"} {sub.pricing?.currency || t("PLN")}
                      </span>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex flex-wrap gap-3 pt-3 border-t border-[#f2eff0]">
                    {(sub.status === "active" || sub.status === "paused") && (
                      <>
                        {sub.status === "active" ? (
                          <>
                            <button
                              onClick={() => {
                                setPauseDays(1);
                                setPauseReason("");
                                setShowPauseModal(sub);
                              }}
                              title={getRemainingDays(sub) <= 1 ? t("Cannot pause: only 1 day remaining") : undefined}
                              className={`flex-1 py-2.5 rounded-xl border text-xs font-bold active:scale-95 transition-all text-center flex items-center justify-center gap-1 shadow-sm ${
                                getRemainingDays(sub) <= 1
                                  ? "border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed"
                                  : "border-amber-200 text-amber-700 bg-amber-50/20 hover:bg-amber-50"
                              }`}
                              disabled={actionLoading || getRemainingDays(sub) <= 1}
                            >
                              <PauseCircle className="text-[16px]" />
                              {t("Pause")}
                            </button>
                            <button
                              onClick={() => {
                                setCancelReason("");
                                setShowCancelModal(sub);
                              }}
                              className="flex-1 py-2.5 rounded-xl border border-red-200 text-brand-red bg-red-50/10 hover:bg-red-50 text-xs font-bold active:scale-95 transition-all text-center flex items-center justify-center gap-1 shadow-sm"
                              disabled={actionLoading}
                            >
                              <XCircle className="text-[16px]" />
                              {t("Cancel")}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleResume(sub)}
                              className="flex-1 py-2.5 rounded-xl bg-primary text-white hover:bg-[#155a49] text-xs font-bold active:scale-95 transition-all text-center flex items-center justify-center gap-1 shadow-md"
                              disabled={actionLoading}
                            >
                              <PlayCircle className="text-[16px]" />
                              {t("Resume Plan")}
                            </button>
                            <button
                              onClick={() => {
                                setCancelReason("");
                                setShowCancelModal(sub);
                              }}
                              className="flex-1 py-2.5 rounded-xl border border-red-200 text-brand-red bg-red-50/10 hover:bg-red-50 text-xs font-bold active:scale-95 transition-all text-center flex items-center justify-center gap-1 shadow-sm"
                              disabled={actionLoading}
                            >
                              <XCircle className="text-[16px]" />
                              {t("Cancel")}
                            </button>
                          </>
                        )}
                      </>
                    )}
                    <button
                      onClick={() => handleDownloadInvoice(sub)}
                      disabled={downloadingId === sub._id}
                      className="w-full py-2.5 rounded-xl border border-[#bec9c3] text-[#1b1c1c] bg-white hover:bg-surface-container-low text-xs font-bold active:scale-95 transition-all text-center flex items-center justify-center gap-1 shadow-sm mt-1"
                    >
                      <span className={`material-symbols-outlined text-[16px] ${downloadingId === sub._id ? "animate-spin" : ""}`}>
                        {downloadingId === sub._id ? "autorenew" : "receipt_long"}
                      </span>
                      {downloadingId === sub._id ? t("Generating...") : t("Download Invoice")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          )
        ) : (
          pantryOrders.length === 0 ? (
            <section className="bg-white rounded-3xl p-8 text-center border border-[#bec9c3]/20 shadow-sm max-w-sm mx-auto mt-8 space-y-6">
              <div className="w-16 h-16 bg-[#E8F3F0] text-primary rounded-full flex items-center justify-center mx-auto shadow-inner">
                <ClipboardList className="text-[32px]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-extrabold text-on-surface">{t("No Pantry Subscriptions")}</h2>
                <p className="text-xs text-[#6e7a74] leading-relaxed">
                  {t("You haven't subscribed to any pantry items yet.")}
                </p>
              </div>
            </section>
          ) : (
            <div className="space-y-5">
              {pantryOrders.map((po, idx) => (
                <div key={po._id || po.orderId || idx} className="bg-white rounded-2xl p-5 shadow-sm border border-[#bec9c3]/20 space-y-4 hover:shadow-md transition-shadow">
                  {/* Card Top / Header */}
                  <div className="flex justify-between items-start gap-2 border-b border-[#f2eff0] pb-3">
                    <div>
                      <h2 className="text-base font-extrabold text-on-surface">
                        {po.vendorId?.restaurantName || t("Pantry Vendor")}
                      </h2>
                      <span className="text-[10px] font-bold text-[#6e7a74] uppercase tracking-wider">
                        {t("ORDER ID:")} {po.orderId || t("N/A")}
                      </span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-slate-100 text-slate-600 border-slate-200 capitalize">
                      {po.status || t("Active")}
                    </span>
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs font-medium">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-[#6e7a74] uppercase tracking-wider block font-bold">{t("Items")}</span>
                      {po.items?.map((item, i) => (
                        <div key={i} className="text-[#1b1c1c] block">
                          {item.quantity}x {item.title}
                        </div>
                      ))}
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] text-[#6e7a74] uppercase tracking-wider block font-bold">{t("Dates")}</span>
                      <div className="text-[11px] text-on-surface-variant space-y-0.5">
                        <div><Trans t={t} i18nKey={"Delivery: <0>{{deliveryDates}}</0>"} defaults={"Delivery: <0>{{deliveryDates}}</0>"} values={{ deliveryDates: po.deliveryDates?.join(", ") }} components={[<span className="text-[#1b1c1c] font-bold" />]} /></div>
                        <div><Trans t={t} i18nKey={"Slots: <0>{{deliverySlots}}</0>"} defaults={"Slots: <0>{{deliverySlots}}</0>"} values={{ deliverySlots: po.deliverySlots?.join(", ") }} components={[<span className="text-[#1b1c1c] font-bold capitalize" />]} /></div>
                      </div>
                    </div>

                    <div className="space-y-0.5 mt-2">
                      <span className="text-[10px] text-[#6e7a74] uppercase tracking-wider block font-bold">{t("Total Amount")}</span>
                      <span className="text-lg font-extrabold text-primary block mt-1">
                        {po.items?.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0).toFixed(2)} {t("PLN")}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </main>

      {/* PAUSE CONFIRMATION WARNING MODAL */}
      {showPauseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-[100] animate-in fade-in duration-300">
          <form onSubmit={handlePause} className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-left">
            <h3 className="text-lg font-extrabold text-[#F59E0B] flex items-center gap-2">
              <AlertTriangle />
              {t("Confirm Subscription Pause")}
            </h3>

            <p className="text-xs text-on-surface-variant font-medium leading-relaxed">
              <Trans t={t} i18nKey={"Are you sure you want to pause subscription <0>{{subscriptionId}}</0>? You can pause for up to 2 days, and billing will be adjusted accordingly."} defaults={"Are you sure you want to pause subscription <0>{{subscriptionId}}</0>? You can pause for up to 2 days, and billing will be adjusted accordingly."} values={{ subscriptionId: showPauseModal.subscriptionId }} components={[<strong />]} />
            </p>

            {/* Remaining days info */}
            {(() => {
              const rem = getRemainingDays(showPauseModal);
              if (rem !== null && rem <= 3) {
                return (
                  <div className="p-2.5 bg-amber-50 border border-amber-100 rounded-xl text-[11px] text-amber-700 font-semibold">
                    <Trans t={t} i18nKey={"⚠️ Your subscription has <0>{{count}} day</0> remaining."} defaults={"⚠️ Your subscription has <0>{{count}} day</0> remaining."} count={rem} components={[<strong />]} />
                    {rem <= 2 ? " " + t("You can pause for up to 1 day only.") : " " + t("Max 2-day pause applies.")}
                  </div>
                );
              }
              return null;
            })()}

            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">{t("Pause Duration")}</label>
                <div className="flex gap-2">
                  {[1, 2]
                    .filter((days) => {
                      const rem = getRemainingDays(showPauseModal);
                      // Hide options that would hit or exceed remaining days
                      if (rem !== null && days >= rem) return false;
                      return true;
                    })
                    .map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setPauseDays(days)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-colors ${pauseDays === days ? "border-primary bg-[#E8F3F0] text-primary" : "border-[#bec9c3] bg-white text-on-surface-variant"}`}
                    >
                      {t("{{count}} Day", { count: days })}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">{t("Reason for Pause (Optional)")}</label>
                <input
                  type="text"
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                  placeholder={t("e.g. Out of town, sick...")}
                  className="w-full text-xs p-3 bg-[#F5F5F0] border border-[#bec9c3]/30 rounded-xl focus:outline-none focus:border-primary/50 font-medium"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-[#f2eff0]">
              <button
                type="button"
                onClick={() => setShowPauseModal(null)}
                className="flex-1 border border-[#bec9c3] text-[#3e4945] py-2.5 rounded-xl font-bold text-xs active:scale-95 transition-transform"
                disabled={actionLoading}
              >
                {t("Cancel")}
              </button>
              <button
                type="submit"
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl font-bold text-xs active:scale-95 transition-transform shadow-md flex items-center justify-center gap-1"
                disabled={actionLoading}
              >
                {actionLoading && <Loader2 className="text-xs animate-spin" />}
                {t("Confirm Pause")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CANCEL CONFIRMATION WARNING MODAL */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-[100] animate-in fade-in duration-300">
          <form onSubmit={handleCancel} className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-left">
            <h3 className="text-lg font-extrabold text-brand-red flex items-center gap-2">
              <AlertTriangle />
              {t("Cancel Subscription?")}
            </h3>

            <p className="text-xs text-on-surface-variant font-medium leading-relaxed">
              <Trans t={t} i18nKey={"Are you sure you want to cancel subscription <0>{{subscriptionId}}</0>?"} defaults={"Are you sure you want to cancel subscription <0>{{subscriptionId}}</0>?"} values={{ subscriptionId: showCancelModal.subscriptionId }} components={[<strong />]} />
            </p>

            <div className="p-3 bg-red-50 border border-red-100 rounded-2xl text-[11px] text-brand-red font-semibold leading-relaxed">
              {t("⚠️ Warning: This is an immediate action. Auto-renewal will be turned off and upcoming deliveries for this cycle will stop.")}
            </div>

            <div className="space-y-1 pt-2">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase">{t("Reason for Cancelling (Optional)")}</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t("e.g. Too expensive, changing plans...")}
                className="w-full text-xs p-3 bg-[#F5F5F0] border border-[#bec9c3]/30 rounded-xl focus:outline-none focus:border-primary/50 font-medium"
              />
            </div>

            <div className="flex gap-3 pt-4 border-t border-[#f2eff0]">
              <button
                type="button"
                onClick={() => setShowCancelModal(null)}
                className="flex-1 border border-[#bec9c3] text-[#3e4945] py-2.5 rounded-xl font-bold text-xs active:scale-95 transition-transform"
                disabled={actionLoading}
              >
                {t("Cancel")}
              </button>
              <button
                type="submit"
                className="flex-1 bg-brand-red hover:bg-[#c93b3b] text-white py-2.5 rounded-xl font-bold text-xs active:scale-95 transition-transform shadow-md flex items-center justify-center gap-1"
                disabled={actionLoading}
              >
                {actionLoading && <Loader2 className="text-xs animate-spin" />}
                {t("Confirm Cancellation")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
