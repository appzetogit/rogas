import { useState } from "react";
import { ArrowLeft, Camera, AlertTriangle, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
const CannotDeliverReport = ({
  order,
  onGoBack,
  onSubmitFailure
}) => {
  const { t } = useTranslation("driver");
  const reasons = [
    "No one home",
    "Wrong address",
    "Customer refused",
    "Access issues (Gated/Code)"
  ];
  const disposals = [
    { id: "HOLDING", label: t("Holding"), desc: t("Keep in carrier van") },
    { id: "WITH NEIGHBOR", label: t("With Neighbor"), desc: t("Left with Apt 41") },
    { id: "RETURN", label: t("Return"), desc: t("Send to warehouse") }
  ];
  const [selectedReason, setSelectedReason] = useState(reasons[0]);
  const [selectedDisposal, setSelectedDisposal] = useState(disposals[0].id);
  const [photoUrl, setPhotoUrl] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const handleCapturePhoto = () => {
    setPhotoUrl("https://images.unsplash.com/photo-1594488651083-023b8a44d81c?auto=format&fit=crop&q=80&w=800");
  };
  const handleSubmit = () => {
    setSubmitting(true);
    setTimeout(() => {
      onSubmitFailure({
        reason: selectedReason,
        disposal: selectedDisposal,
        note,
        photoUrl
      });
    }, 1200);
  };
  return <div className="space-y-4 pb-20 animate-fadeIn text-gray-800">
      {
    /* Header Info Bar */
  }
      <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-[#e0e3e0]">
        <button
    onClick={onGoBack}
    className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors flex items-center gap-1.5 text-[#00604c] font-bold"
  >
          <ArrowLeft className="w-5 h-5" />
          <span>{t("Cancel")}</span>
        </button>
        <h2 className="text-sm font-bold text-gray-900 mx-auto">{t("Issue Reporting")}</h2>
        <div className="w-8 h-8 rounded-full overflow-hidden border border-[#bec9c3]">
          <img
    alt={t("Jan Profile")}
    className="w-full h-full object-cover"
    src="https://lh3.googleusercontent.com/aida-public/AB6AXuDEjl512Xg8gioOiKCrNkzoFsPJOBpZ_FWH1I9NLqdANkO68ioiYVbGJP0lCuEzhuJUEOH6hHaQOjc6fe9vJQ7lK3v7iR_GQv857dAWMuxS2tvAnVJK-naM5eaoWYwQcIZevQpLdYOxa0llm9zUIwUztXYbbVNoYaAJTfyk4qT0ZqGXdcFJ7JJP2-YMHekgSppjlvckmf_yIcx_Ut04Rqcuhy38-DLDk3fY2C_8AdsnIKo1wOFHFhmGrrgs8RSyMn1OhVRSMMoac1Mm"
  />
        </div>
      </div>

      {
    /* Summary Context Alert Block */
  }
      <section className="bg-white border border-[#e0e3e0] rounded-xl p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <p className="text-[10px] uppercase font-extrabold text-[#3e4945] tracking-wider">{t("ORDER #{{orderNumber}}", { orderNumber: order.orderNumber })}</p>
          <h3 className="text-sm font-bold text-gray-900 leading-snug">{t("Confirming issue for {{customerName}}", { customerName: order.customerName })}</h3>
          <p className="text-xs text-[#5d5f5b] truncate">{order.deliveryAddress}</p>
        </div>
      </section>

      {
    /* Radio Reason List Selection */
  }
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest px-1">{t("SELECT REASON")}</h3>
        <div className="bg-white border border-[#bec9c3] rounded-xl overflow-hidden divide-y divide-[#bec9c3]/50">
          {reasons.map((reason) => <label
    key={reason}
    className="flex items-center justify-between w-full p-4 cursor-pointer hover:bg-gray-50 transition-colors select-none"
  >
              <span className="text-sm font-bold text-gray-900">{reason}</span>
              <input
    type="radio"
    name="fail_reason"
    checked={selectedReason === reason}
    onChange={() => setSelectedReason(reason)}
    className="w-5 h-5 text-[#00604c] focus:ring-[#00604c]"
  />
            </label>)}
        </div>
      </section>

      {
    /* Mandatory Photo Proof Block */
  }
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest px-1 flex items-center gap-1.5">
          <span>{t("MANDATORY DOOR PHOTO")}</span>
          <span className="text-[9px] bg-[#ffdad6] text-[#ba1a1a] px-1.5 py-0.5 rounded uppercase font-extrabold tracking-wider">{t("REQUIRED")}</span>
        </h3>
        
        {photoUrl ? <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-dashed border-[#00604c] shadow-sm">
            <img
    alt={t("Verification attachment")}
    className="w-full h-full object-cover"
    src={photoUrl}
  />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="bg-emerald-600 text-white px-3 py-1 text-xs font-bold flex items-center gap-1.5 rounded-full shadow-md">
                <Check className="w-4 h-4 stroke-[3]" /> proof_doorway.jpg
              </span>
            </div>
            <button
    onClick={() => setPhotoUrl("")}
    className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2.5 py-1 rounded hover:bg-black/80"
  >
              {t("Retake")}
            </button>
          </div> : <button
    onClick={handleCapturePhoto}
    className="w-full aspect-video rounded-xl bg-white border-2 border-dashed border-[#bec9c3] flex flex-col items-center justify-center text-center p-6 hover:border-[#00604c] transition-colors focus:outline-none"
  >
            <Camera className="w-8 h-8 text-[#5d5f5b] mb-2" />
            <span className="text-xs font-bold text-gray-900 block">{t("Take a photo of delivery spot")}</span>
            <span className="text-[10px] text-[#5d5f5b] mt-1 text-center max-w-xs block leading-relaxed">
              {t("Required for proof to verify failed run to depot manager and customers.")}
            </span>
          </button>}
      </section>

      {
    /* Box Disposal Options */
  }
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest px-1">{t("WHAT DID YOU DO WITH THE BOX?")}</h3>
        <div className="grid grid-cols-3 gap-2">
          {disposals.map((disp) => <button
    key={disp.id}
    type="button"
    onClick={() => setSelectedDisposal(disp.id)}
    className={`flex flex-col items-center gap-1.5 p-3.5 border rounded-xl text-center transition-all duration-150 active:scale-95 ${selectedDisposal === disp.id ? "bg-[#9ef3d7] border-[#00604c] text-[#005140] shadow-sm" : "bg-white border-[#bec9c3] text-[#3e4945] hover:bg-gray-50"}`}
  >
              <div className="text-lg">
                {disp.id === "HOLDING" ? "\u{1F4E6}" : disp.id === "WITH NEIGHBOR" ? "\u{1F3E1}" : "\u{1F504}"}
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider block">{disp.label}</span>
              <span className="text-[8px] opacity-75 font-medium leading-none block">{disp.desc}</span>
            </button>)}
        </div>
      </section>

      {
    /* Optional Note Field */
  }
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest px-1">{t("OPTIONAL NOTE")}</h3>
        <textarea
    value={note}
    onChange={(e) => setNote(e.target.value)}
    placeholder={t("Specify if gate code didn't work, neighbor's name, or any additional context...")}
    className="w-full h-24 p-4 rounded-xl bg-white border border-[#bec9c3] focus:border-[#00604c] focus:ring-1 focus:ring-[#00604c] outline-none text-xs text-gray-800 transition-all resize-none"
  />
      </section>

      {
    /* Bottom Action Area */
  }
      <div className="pt-2">
        <button
    onClick={handleSubmit}
    disabled={submitting || !photoUrl}
    className={`w-full h-12 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-transform ${submitting ? "bg-red-400 text-white cursor-not-allowed" : photoUrl ? "bg-[#ba1a1a] hover:bg-red-700 text-white cursor-pointer active:scale-95 font-headline" : "bg-gray-200 text-gray-400 border border-gray-300 cursor-not-allowed"}`}
  >
          {submitting ? t("MARKING...") : t("Mark as Failed Delivery")}
        </button>
        <p className="text-center mt-2.5 text-[10px] font-bold text-[#ba1a1a]">
          {t("This action will alert the customer and vendor immediately. Photo proof required.")}
        </p>
      </div>
    </div>;
};
export {
  CannotDeliverReport
};
