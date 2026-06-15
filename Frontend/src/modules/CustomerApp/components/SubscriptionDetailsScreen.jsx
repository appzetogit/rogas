import { useState, useEffect } from "react";
import { dmbCustomerAPI } from "@food/api";

export function SubscriptionDetailsScreen({ onGoBack, onGoToPlans, onShowNotificationToast }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  // Modals for pause & cancel actions
  const [showPauseModal, setShowPauseModal] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(null);

  // Input states for actions
  const [pauseDays, setPauseDays] = useState(1);
  const [pauseReason, setPauseReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const fetchSubscriptions = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await dmbCustomerAPI.getMySubscriptions();
      if (res.data?.success) {
        setSubscriptions(res.data.subscriptions || []);
      } else {
        setError("Failed to load subscription details.");
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load subscriptions.");
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
      onShowNotificationToast("⏸️ Subscription paused successfully!");
      setShowPauseModal(null);
      setPauseReason("");
      setPauseDays(1);
      fetchSubscriptions();
    } catch (err) {
      onShowNotificationToast(err.response?.data?.message || err.message || "Failed to pause subscription.");
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
      onShowNotificationToast(" Subscription cancelled successfully.");
      setShowCancelModal(null);
      setCancelReason("");
      fetchSubscriptions();
    } catch (err) {
      onShowNotificationToast(err.response?.data?.message || err.message || "Failed to cancel subscription.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async (sub) => {
    setActionLoading(true);
    try {
      await dmbCustomerAPI.resumeSubscription(sub.subscriptionId);
      onShowNotificationToast("▶️ Subscription resumed successfully!");
      fetchSubscriptions();
    } catch (err) {
      onShowNotificationToast(err.response?.data?.message || err.message || "Failed to resume subscription.");
    } finally {
      setActionLoading(false);
    }
  };

  // Helper to calculate Expiry Date based on startDate and duration
  const getExpiryDate = (sub) => {
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

  const getStatusLabel = (status) => {
    switch (status) {
      case "active":
        return "Active";
      case "paused":
        return "Paused";
      case "cancelled":
        return "Cancelled";
      case "expired":
        return "Expired";
      case "pending_payment":
        return "Pending Payment";
      default:
        return status;
    }
  };

  return (
    <div className="bg-[#F5F5F0] text-[#1b1c1c] min-h-[880px] pb-32">
      {/* Header */}
      <header className="bg-white flex justify-between items-center w-full px-5 h-14 sticky top-0 z-40 border-b border-[#bec9c3]/20 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onGoBack} className="material-symbols-outlined text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low">
            arrow_back
          </button>
          <h1 className="text-[18px] font-extrabold text-primary">My Subscriptions</h1>
        </div>
      </header>

      <main className="px-5 pb-12 pt-6 space-y-6">
        {error && (
          <div className="p-3 bg-red-50 text-brand-red rounded-xl text-xs font-semibold border border-red-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center pt-20 gap-3 text-on-surface-variant">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold uppercase tracking-wider">Loading subscriptions...</p>
          </div>
        ) : subscriptions.length === 0 ? (
          <section className="bg-white rounded-3xl p-8 text-center border border-[#bec9c3]/20 shadow-sm max-w-sm mx-auto mt-8 space-y-6">
            <div className="w-16 h-16 bg-[#E8F3F0] text-primary rounded-full flex items-center justify-center mx-auto shadow-inner">
              <span className="material-symbols-outlined text-[32px]">assignment</span>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-extrabold text-on-surface">No Active Subscriptions</h2>
              <p className="text-xs text-[#6e7a74] leading-relaxed">
                Subscribe to a meal plan to enjoy fresh, vendor-prepared meals delivered daily to your door.
              </p>
            </div>
            <button
              onClick={onGoToPlans}
              className="w-full bg-primary hover:bg-[#155a49] text-white py-3.5 rounded-2xl font-bold text-sm shadow-md active:scale-95 transition-transform"
            >
              Browse Meal Plans
            </button>
          </section>
        ) : (
          <div className="space-y-5">
            {subscriptions.map((sub) => {
              const durationLabel = sub.duration ? sub.duration.charAt(0).toUpperCase() + sub.duration.slice(1) : "Weekly";
              const mealList = sub.meals?.map(m => `${m.mealPlanId?.name || "Meal Plan"} x${m.quantity || 1}`).join(", ") || "Standard Plan";

              return (
                <div key={sub._id} className="bg-white rounded-2xl p-5 shadow-sm border border-[#bec9c3]/20 space-y-4 hover:shadow-md transition-shadow">
                  {/* Card Top / Header */}
                  <div className="flex justify-between items-start gap-2 border-b border-[#f2eff0] pb-3">
                    <div>
                      <h2 className="text-base font-extrabold text-on-surface">
                        {sub.vendorId?.restaurantName || "DailyMealBox Vendor"}
                      </h2>
                      <span className="text-[10px] font-bold text-[#6e7a74] uppercase tracking-wider">
                        ID: {sub.subscriptionId || "N/A"}
                      </span>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getStatusBadgeClass(sub.status)}`}>
                      {getStatusLabel(sub.status)}
                    </span>
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs font-medium">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-[#6e7a74] uppercase tracking-wider block font-bold">Plan Details</span>
                      <span className="text-[#1b1c1c] font-bold block">{durationLabel} Plan</span>
                      <span className="text-[11px] text-on-surface-variant block">{mealList}</span>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] text-[#6e7a74] uppercase tracking-wider block font-bold">Delivery Preferences</span>
                      <span className="text-[#1b1c1c] font-bold block">
                        {sub.deliverySlot ? sub.deliverySlot.charAt(0).toUpperCase() + sub.deliverySlot.slice(1) : "Lunch"}
                      </span>
                      <span className="text-[11px] text-on-surface-variant block">
                        {sub.deliveryDays === "mon_fri" ? "Monday - Friday" : "Full Week"}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[10px] text-[#6e7a74] uppercase tracking-wider block font-bold">Dates</span>
                      <div className="text-[11px] text-on-surface-variant space-y-0.5">
                        <div>Purchase: <span className="text-[#1b1c1c] font-bold">{formatDate(sub.createdAt)}</span></div>
                        <div>Start: <span className="text-[#1b1c1c] font-bold">{formatDate(sub.startDate)}</span></div>
                        <div>Expiry: <span className="text-[#1b1c1c] font-bold">{getExpiryDate(sub)}</span></div>
                      </div>
                    </div>

                    <div className="space-y-0.5 text-right">
                      <span className="text-[10px] text-[#6e7a74] uppercase tracking-wider block font-bold">Amount Paid</span>
                      <span className="text-lg font-extrabold text-primary block mt-1">
                        {sub.pricing?.totalPrice || "0"} {sub.pricing?.currency || "PLN"}
                      </span>
                    </div>
                  </div>

                  {/* Actions Row */}
                  {(sub.status === "active" || sub.status === "paused") && (
                    <div className="flex gap-3 pt-3 border-t border-[#f2eff0]">
                      {sub.status === "active" ? (
                        <>
                          <button
                            onClick={() => {
                              setPauseDays(1);
                              setPauseReason("");
                              setShowPauseModal(sub);
                            }}
                            className="flex-1 py-2.5 rounded-xl border border-amber-200 text-amber-700 bg-amber-50/20 hover:bg-amber-50 text-xs font-bold active:scale-95 transition-all text-center flex items-center justify-center gap-1 shadow-sm"
                            disabled={actionLoading}
                          >
                            <span className="material-symbols-outlined text-[16px]">pause_circle</span>
                            Pause
                          </button>
                          <button
                            onClick={() => {
                              setCancelReason("");
                              setShowCancelModal(sub);
                            }}
                            className="flex-1 py-2.5 rounded-xl border border-red-200 text-brand-red bg-red-50/10 hover:bg-red-50 text-xs font-bold active:scale-95 transition-all text-center flex items-center justify-center gap-1 shadow-sm"
                            disabled={actionLoading}
                          >
                            <span className="material-symbols-outlined text-[16px]">cancel</span>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleResume(sub)}
                            className="flex-1 py-2.5 rounded-xl bg-primary text-white hover:bg-[#155a49] text-xs font-bold active:scale-95 transition-all text-center flex items-center justify-center gap-1 shadow-md"
                            disabled={actionLoading}
                          >
                            <span className="material-symbols-outlined text-[16px]">play_circle</span>
                            Resume Plan
                          </button>
                          <button
                            onClick={() => {
                              setCancelReason("");
                              setShowCancelModal(sub);
                            }}
                            className="flex-1 py-2.5 rounded-xl border border-red-200 text-brand-red bg-red-50/10 hover:bg-red-50 text-xs font-bold active:scale-95 transition-all text-center flex items-center justify-center gap-1 shadow-sm"
                            disabled={actionLoading}
                          >
                            <span className="material-symbols-outlined text-[16px]">cancel</span>
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* PAUSE CONFIRMATION WARNING MODAL */}
      {showPauseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-[100] animate-in fade-in duration-300">
          <form onSubmit={handlePause} className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-left">
            <h3 className="text-lg font-extrabold text-[#F59E0B] flex items-center gap-2">
              <span className="material-symbols-outlined">warning</span>
              Confirm Subscription Pause
            </h3>

            <p className="text-xs text-on-surface-variant font-medium leading-relaxed">
              Are you sure you want to pause subscription <strong>{showPauseModal.subscriptionId}</strong>?
              You can pause for up to 2 days, and billing will be adjusted accordingly.
            </p>

            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Pause Duration</label>
                <div className="flex gap-2">
                  {[1, 2].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setPauseDays(days)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-colors ${pauseDays === days ? "border-primary bg-[#E8F3F0] text-primary" : "border-[#bec9c3] bg-white text-on-surface-variant"}`}
                    >
                      {days} Day{days > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Reason for Pause (Optional)</label>
                <input
                  type="text"
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                  placeholder="e.g. Out of town, sick..."
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
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl font-bold text-xs active:scale-95 transition-transform shadow-md flex items-center justify-center gap-1"
                disabled={actionLoading}
              >
                {actionLoading && <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>}
                Confirm Pause
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
              <span className="material-symbols-outlined">warning</span>
              Cancel Subscription?
            </h3>

            <p className="text-xs text-on-surface-variant font-medium leading-relaxed">
              Are you sure you want to cancel subscription <strong>{showCancelModal.subscriptionId}</strong>?
            </p>

            <div className="p-3 bg-red-50 border border-red-100 rounded-2xl text-[11px] text-brand-red font-semibold leading-relaxed">
              ⚠️ Warning: This is an immediate action. Auto-renewal will be turned off and upcoming deliveries for this cycle will stop.
            </div>

            <div className="space-y-1 pt-2">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase">Reason for Cancelling (Optional)</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Too expensive, changing plans..."
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
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-brand-red hover:bg-[#c93b3b] text-white py-2.5 rounded-xl font-bold text-xs active:scale-95 transition-transform shadow-md flex items-center justify-center gap-1"
                disabled={actionLoading}
              >
                {actionLoading && <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>}
                Confirm Cancellation
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
