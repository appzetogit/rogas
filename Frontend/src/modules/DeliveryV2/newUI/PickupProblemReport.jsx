import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, AlertTriangle, Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { tKey } from "../../../shared/i18n";
import { dmbExtraDriverAPI } from "../../../services/api";

const REASON_LABELS = {
  order_not_ready: tKey("Order is not ready yet"),
  vendor_unreachable: tKey("Nobody is answering at the vendor"),
  items_missing: tKey("Items missing or wrong"),
  vendor_closed: tKey("Vendor is closed"),
  vendor_refused: tKey("Vendor refused to hand over the order"),
  other: tKey("Other problem"),
};

/**
 * "Problem at the vendor" (before pickup). The reasons and which of them need a photo / a note / stop the pickup come from
 * the server. A blocking problem keeps the collection PIN locked until support clears it; the others only tell support and
 * the vendor and the driver can keep waiting.
 */
const PickupProblemReport = ({ order, onGoBack, onSubmitted }) => {
  const { t } = useTranslation("driver");
  const [reasons, setReasons] = useState([]);
  const [reason, setReason] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef(null);

  useEffect(() => {
    dmbExtraDriverAPI
      .pickupProblemOptions()
      .then((res) => {
        const list = res.data?.reasons || [];
        setReasons(list);
        setReason((prev) => prev || list[0]?.key || "");
      })
      .catch(() => setError(t("Could not load the list of problems. Please try again.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosen = reasons.find((r) => r.key === reason);

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

  const canSubmit = chosen && !submitting && !uploading && (!chosen.photoRequired || photoUrl) && (!chosen.noteRequired || note.trim());

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await dmbExtraDriverAPI.reportPickupProblem({
        vendorId: order?.vendorId,
        slot: order?.slot || order?.deliverySlot,
        reason,
        note,
        photoUrl,
      });
      onSubmitted({ reason, blocking: Boolean(res.data?.blocking) });
    } catch (err) {
      setError(err?.response?.data?.message || err.message || t("Could not report the problem"));
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
        <h2 className="text-sm font-bold text-gray-900 mx-auto">{t("Problem at the vendor")}</h2>
        <div className="w-8" />
      </div>

      <section className="bg-white border border-[#e0e3e0] rounded-xl p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900 leading-snug">{order.vendorName || ""}</h3>
          <p className="text-xs text-[#5d5f5b] truncate">{order.vendorAddress || ""}</p>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest px-1">{t("WHAT IS THE PROBLEM?")}</h3>
        <div className="bg-white border border-[#bec9c3] rounded-xl overflow-hidden divide-y divide-[#bec9c3]/50">
          {reasons.filter((r) => REASON_LABELS[r.key]).map((r) => (
            <label key={r.key} className="flex items-center justify-between w-full p-4 cursor-pointer hover:bg-gray-50 transition-colors select-none">
              <span className="text-sm font-bold text-gray-900">{t(REASON_LABELS[r.key])}</span>
              <input type="radio" name="pickup_problem" checked={reason === r.key} onChange={() => setReason(r.key)} className="w-5 h-5 text-[#00604c] focus:ring-[#00604c]" />
            </label>
          ))}
        </div>
        {chosen && (
          <p className={`text-xs font-semibold px-1 ${chosen.blocking ? "text-[#ba1a1a]" : "text-[#5d5f5b]"}`}>
            {chosen.blocking
              ? t("You will not be able to collect this order until support clears the problem or releases you from this pickup.")
              : t("Support and the vendor will be told. You can keep waiting and collect the order when it is handed over.")}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest px-1 flex items-center gap-1.5">
          <span>{t("PHOTO")}</span>
          {chosen?.photoRequired && <span className="text-[9px] bg-[#ffdad6] text-[#ba1a1a] px-1.5 py-0.5 rounded uppercase font-extrabold tracking-wider">{t("REQUIRED")}</span>}
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
            <span className="text-xs font-bold text-gray-900 block">{uploading ? t("Uploading...") : t("Take a photo")}</span>
          </button>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest px-1 flex items-center gap-1.5">
          <span>{t("NOTE")}</span>
          {chosen?.noteRequired && <span className="text-[9px] bg-[#ffdad6] text-[#ba1a1a] px-1.5 py-0.5 rounded uppercase font-extrabold tracking-wider">{t("REQUIRED")}</span>}
        </h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          rows={3}
          className="w-full bg-white border border-[#bec9c3] rounded-xl p-3 text-sm focus:outline-none focus:border-[#00604c]"
          placeholder={t("Tell support what happened")}
        />
      </section>

      {error && <div className="bg-[#ffdad6] text-[#93000a] text-xs font-bold p-3 rounded-lg border border-red-100">{error}</div>}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full h-[52px] bg-[#ba1a1a] hover:bg-[#93000a] disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-transform shadow-md text-base cursor-pointer"
      >
        {submitting ? t("Sending...") : t("Report problem")}
      </button>
    </div>
  );
};

export default PickupProblemReport;
