import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Star, X, MessageSquareReply } from "lucide-react";
import { dmbCustomerAPI } from "@food/api";
import usePlatformConfig from "../../../../shared/platform/usePlatformConfig";
import { Notice, PrimaryButton, errorText } from "./ui";

function Stars({ value, onChange, disabled, label }) {
  const { t } = useTranslation("customer");
  return (
    <div className="space-y-1">
      <p className="text-[12px] font-bold text-[#1b1c1c]">{label}</p>
      <div className="flex gap-2" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" disabled={disabled} aria-label={t("{{n}} stars", { n })} onClick={() => onChange(n)} className="active:scale-90 transition-transform">
            <Star className={`w-7 h-7 ${n <= (value || 0) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** A maker's public reply to a review (Gap T). */
export function VendorReply({ response, vendorName }) {
  const { t } = useTranslation("customer");
  if (!response?.text) return null;
  return (
    <div className="mt-2 rounded-xl bg-[#f5f5f0] p-3 text-left">
      <p className="text-[11px] font-bold text-[#6e7a74] flex items-center gap-1">
        <MessageSquareReply size={12} /> {t("Reply from {{vendor}}", { vendor: vendorName || t("the maker") })}
      </p>
      <p className="text-[12.5px] text-[#1b1c1c] mt-1 whitespace-pre-wrap">{response.text}</p>
    </div>
  );
}

/**
 * Rate a delivered order. With ACM-159 on, meal quality (goes to the maker) and delivery experience (goes to the driver,
 * never shown to the maker) are rated separately; otherwise one rating counts for both. Comment max 200 characters.
 */
export function RatingDialog({ order, onClose, onRated }) {
  const { t } = useTranslation("customer");
  const { isOn } = usePlatformConfig(order?.zoneId ? String(order.zoneId) : undefined);
  const split = isOn("splitRatings");
  const rated = Boolean(order.isRated);
  const [meal, setMeal] = useState(order.ratings?.mealQuality || 0);
  const [delivery, setDelivery] = useState(order.ratings?.deliveryExperience || 0);
  const [overall, setOverall] = useState(order.ratings?.overall || order.deliveryRating || 0);
  const [comment, setComment] = useState(order.ratingFeedback || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const body = split
        ? { mealQuality: meal || undefined, deliveryExperience: delivery || undefined, overall: overall || undefined, comment }
        : { rating: overall, comment };
      const res = await dmbCustomerAPI.rateOrder(order._id, body);
      const ratings = res.data?.ratings || { mealQuality: meal || null, deliveryExperience: delivery || null, overall: overall || null };
      onRated?.({
        ...order,
        isRated: true,
        ratings,
        deliveryRating: ratings.deliveryExperience ?? ratings.overall,
        ratingFeedback: comment,
      });
    } catch (err) {
      setError(errorText(err, t("Failed to submit rating")));
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = split ? meal || delivery || overall : overall;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[380px] p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label={t("Close")} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
        <div className="text-center">
          <h3 className="text-lg font-bold text-gray-900">{rated ? t("Your rating") : t("How was it?")}</h3>
          <p className="text-xs text-gray-500 font-medium">{t("For order #{{orderId}}", { orderId: order.orderId })}</p>
        </div>
        {split ? (
          <>
            <Stars label={t("Meal quality")} value={meal} onChange={setMeal} disabled={rated} />
            <Stars label={t("Delivery experience")} value={delivery} onChange={setDelivery} disabled={rated} />
            <Stars label={t("Overall")} value={overall} onChange={setOverall} disabled={rated} />
            {!rated && <p className="text-[11px] text-[#6e7a74]">{t("The delivery rating goes to our delivery team only — the maker sees the meal rating.")}</p>}
          </>
        ) : (
          <Stars label={t("Your rating")} value={overall} onChange={setOverall} disabled={rated} />
        )}
        <div>
          <textarea
            value={comment}
            maxLength={200}
            disabled={rated || saving}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("Tell us more (optional)")}
            className="w-full min-h-[80px] p-3 text-sm border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#006a5c] resize-none"
          />
          {!rated && <p className="text-[10px] text-right text-[#6e7a74]">{comment.length}/200</p>}
        </div>
        <VendorReply response={order.vendorResponse} vendorName={order.vendorName} />
        {error && <Notice tone="error">{error}</Notice>}
        {!rated ? (
          <PrimaryButton busy={saving} disabled={!canSubmit} onClick={submit}>{t("Submit Rating")}</PrimaryButton>
        ) : (
          <div className="w-full bg-slate-50 border border-gray-200 py-3 rounded-2xl text-center text-sm font-semibold text-gray-500">{t("Rating Submitted")}</div>
        )}
      </div>
    </div>
  );
}
