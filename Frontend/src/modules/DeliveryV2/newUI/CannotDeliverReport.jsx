import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, AlertTriangle, Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { tKey } from "../../../shared/i18n";
import { dmbExtraDriverAPI } from "../../../services/api";

const REASON_LABELS = {
  no_one_home: tKey("No one home"),
  wrong_address: tKey("Wrong address"),
  customer_refused: tKey("Customer refused"),
  access_issue: tKey("Access issues (Gated/Code)"),
  other: tKey("Other"),
};
const DISPOSITIONS = {
  held_by_driver: { label: tKey("Holding"), desc: tKey("I keep the box"), icon: "\u{1F4E6}" },
  returned_to_vendor: { label: tKey("Back to kitchen"), desc: tKey("Returning it to the maker"), icon: "\u{1F504}" },
  left_with_neighbour: { label: tKey("With neighbour"), desc: tKey("Left with a neighbour"), icon: "\u{1F3E1}" },
  returned_to_shop: { label: tKey("Back to shop"), desc: tKey("Pantry bag returned to the shop"), icon: "\u{1F3EA}" },
};

/**
 * DA-07 "Cannot deliver" (Gap P): reason, a real photo (uploaded, mandatory) and what happened to the box. The server
 * marks the order failed, tells the customer (and the kitchen / shop when the box comes back) and alerts support.
 * "Back to shop" exists for Pantry bags only.
 */
const CannotDeliverReport = ({ order, onGoBack, onSubmitFailure }) => {
  const { t } = useTranslation("driver");
  const isPantry = order?.type === "pantry";
  const [options, setOptions] = useState({ reasons: Object.keys(REASON_LABELS), dispositions: Object.keys(DISPOSITIONS) });
  const [reason, setReason] = useState("no_one_home");
  const [disposition, setDisposition] = useState("held_by_driver");
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef(null);

  useEffect(() => {
    dmbExtraDriverAPI
      .failedDeliveryOptions()
      .then((res) => setOptions({ reasons: res.data.reasons || [], dispositions: res.data.dispositions || [] }))
      .catch(() => {});
  }, []);

  const dispositions = options.dispositions.filter((d) => DISPOSITIONS[d] && (isPantry || d !== "returned_to_shop"));

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const res = await dmbExtraDriverAPI.uploadPhoto(file);
      const url = res.data?.data?.url;
      if (!url) throw new Error(t("Upload failed"));
      setPhotoUrl(url);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || t("Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!order?.id) return;
    setSubmitting(true);
    setError("");
    try {
      await dmbExtraDriverAPI.reportFailedDelivery(order.id, { type: isPantry ? "pantry" : "dmb", reason, disposition, photoUrl, note });
      onSubmitFailure({ reason, disposal: disposition, note, photoUrl });
    } catch (err) {
      setError(err?.response?.data?.message || err.message || t("Could not report the failed delivery"));
      setSubmitting(false);
    }
  };

  if (!order) return null;
  return (
    <div className="space-y-4 pb-20 animate-fadeIn text-gray-800">
      <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-[#e0e3e0]">
        <button onClick={onGoBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors flex items-center gap-1.5 text-[#00604c] font-bold">
          <ArrowLeft className="w-5 h-5" />
          <span>{t("Cancel")}</span>
        </button>
        <h2 className="text-sm font-bold text-gray-900 mx-auto">{t("Issue Reporting")}</h2>
        <div className="w-8" />
      </div>

      <section className="bg-white border border-[#e0e3e0] rounded-xl p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase font-extrabold text-[#3e4945] tracking-wider">{t("ORDER #{{orderNumber}}", { orderNumber: order.orderNumber || "" })}</p>
          <h3 className="text-sm font-bold text-gray-900 leading-snug">{t("Confirming issue for {{customerName}}", { customerName: order.customerName || "" })}</h3>
          <p className="text-xs text-[#5d5f5b] truncate">{order.customerAddress || ""}</p>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest px-1">{t("SELECT REASON")}</h3>
        <div className="bg-white border border-[#bec9c3] rounded-xl overflow-hidden divide-y divide-[#bec9c3]/50">
          {options.reasons.filter((r) => REASON_LABELS[r]).map((r) => (
            <label key={r} className="flex items-center justify-between w-full p-4 cursor-pointer hover:bg-gray-50 transition-colors select-none">
              <span className="text-sm font-bold text-gray-900">{t(REASON_LABELS[r])}</span>
              <input type="radio" name="fail_reason" checked={reason === r} onChange={() => setReason(r)} className="w-5 h-5 text-[#00604c] focus:ring-[#00604c]" />
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest px-1 flex items-center gap-1.5">
          <span>{t("MANDATORY DOOR PHOTO")}</span>
          <span className="text-[9px] bg-[#ffdad6] text-[#ba1a1a] px-1.5 py-0.5 rounded uppercase font-extrabold tracking-wider">{t("REQUIRED")}</span>
        </h3>
        <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
        {photoUrl ? (
          <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-dashed border-[#00604c] shadow-sm">
            <img alt={t("Verification attachment")} className="w-full h-full object-cover" src={photoUrl} />
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <span className="bg-emerald-600 text-white px-3 py-1 text-xs font-bold flex items-center gap-1.5 rounded-full shadow-md">
                <Check className="w-4 h-4 stroke-[3]" /> {t("Photo attached")}
              </span>
            </div>
            <button onClick={() => fileInput.current?.click()} className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2.5 py-1 rounded hover:bg-black/80">
              {t("Retake")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="w-full aspect-video rounded-xl bg-white border-2 border-dashed border-[#bec9c3] flex flex-col items-center justify-center text-center p-6 hover:border-[#00604c] transition-colors focus:outline-none"
          >
            {uploading ? <Loader2 className="w-8 h-8 text-[#00604c] animate-spin mb-2" /> : <Camera className="w-8 h-8 text-[#5d5f5b] mb-2" />}
            <span className="text-xs font-bold text-gray-900 block">{uploading ? t("Uploading...") : t("Take a photo of delivery spot")}</span>
            <span className="text-[10px] text-[#5d5f5b] mt-1 text-center max-w-xs block leading-relaxed">{t("Required for proof to verify failed run to depot manager and customers.")}</span>
          </button>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest px-1">{t("WHAT DID YOU DO WITH THE BOX?")}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {dispositions.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDisposition(d)}
              className={`flex flex-col items-center gap-1.5 p-3.5 border rounded-xl text-center transition-all duration-150 active:scale-95 ${disposition === d ? "bg-[#9ef3d7] border-[#00604c] text-[#005140] shadow-sm" : "bg-white border-[#bec9c3] text-[#3e4945] hover:bg-gray-50"}`}
            >
              <div className="text-lg">{DISPOSITIONS[d].icon}</div>
              <span className="text-[10px] font-black uppercase tracking-wider block">{t(DISPOSITIONS[d].label)}</span>
              <span className="text-[9px] opacity-75 font-medium leading-tight block">{t(DISPOSITIONS[d].desc)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest px-1">{t("OPTIONAL NOTE")}</h3>
        <textarea
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("Specify if gate code didn't work, neighbor's name, or any additional context...")}
          className="w-full h-24 p-4 rounded-xl bg-white border border-[#bec9c3] focus:border-[#00604c] focus:ring-1 focus:ring-[#00604c] outline-none text-xs text-gray-800 transition-all resize-none"
        />
      </section>

      {error && <p className="text-[12px] font-bold text-[#ba1a1a] px-1">{error}</p>}
      <div className="pt-2">
        <button
          onClick={handleSubmit}
          disabled={submitting || uploading || !photoUrl}
          className={`w-full h-12 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-transform ${submitting ? "bg-red-400 text-white cursor-not-allowed" : photoUrl ? "bg-[#ba1a1a] hover:bg-red-700 text-white cursor-pointer active:scale-95 font-headline" : "bg-gray-200 text-gray-400 border border-gray-300 cursor-not-allowed"}`}
        >
          {submitting ? t("MARKING...") : t("Mark as Failed Delivery")}
        </button>
        <p className="text-center mt-2.5 text-[10px] font-bold text-[#ba1a1a]">{t("This action will alert the customer and vendor immediately. Photo proof required.")}</p>
      </div>
    </div>
  );
};

export { CannotDeliverReport };
