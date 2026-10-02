import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { dmbExtraVendorAPI } from "../../../../services/api/index";

export const EMPTY_MEAL_EXTRA = { temperatureType: "", reheatInstructions: "", isPreOrder: false, launchDate: "", preorderCutoff: "" };

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Meal form additions (VM-07): Hot/Cold label (Gap AL — required to publish while ACM-183 is on, cold meals need
 * reheating instructions ≤150 chars) and Pre-order for a new dish (Gap M — future launch date, reservations close the
 * day before unless set).
 */
export default function MealAmendmentFields({ value, onChange }) {
  const { t: tr } = useTranslation("vendor");
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    dmbExtraVendorAPI.config().then((res) => setCfg(res.data.config)).catch(() => setCfg({}));
  }, []);
  const set = (patch) => onChange({ ...value, ...patch });
  const mandatory = cfg?.temperatureMandatory !== false;
  const input = "w-full border border-outline-variant rounded-lg px-3 py-2.5 text-[13px] outline-none focus:ring-1 focus:ring-primary bg-white";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-[10px] text-outline uppercase font-semibold">
          {tr("Served")} {mandatory && <span className="text-red-600">*</span>}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["hot", tr("🔥 Hot — ready to eat")],
            ["cold", tr("❄️ Cold — reheat at home")],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => set({ temperatureType: value.temperatureType === k ? "" : k })}
              className={`py-2.5 rounded-lg border text-[12px] font-bold ${value.temperatureType === k ? "border-primary bg-primary/10 text-primary" : "border-outline-variant bg-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {mandatory && !value.temperatureType && <p className="text-[11px] text-amber-700">{tr("Required before the meal can be published.")}</p>}
      </div>
      {value.temperatureType === "cold" && (
        <div className="space-y-1">
          <label className="text-[10px] text-outline uppercase font-semibold">{tr("Reheating instructions")} <span className="text-red-600">*</span></label>
          <input className={input} maxLength={150} value={value.reheatInstructions} onChange={(e) => set({ reheatInstructions: e.target.value })} placeholder={tr("e.g. Microwave 3 min at 800W, stir halfway")} />
          <p className="text-[10px] text-right text-outline">{value.reheatInstructions.length}/150</p>
        </div>
      )}
      <div className="space-y-2 border border-outline-variant rounded-xl p-3 bg-white">
        <label className="flex items-center gap-2 text-[13px] font-bold cursor-pointer">
          <input type="checkbox" checked={value.isPreOrder} onChange={(e) => set({ isPreOrder: e.target.checked, launchDate: value.launchDate || "" })} className="w-4 h-4 accent-[#00604c]" />
          {tr("New dish — take pre-orders before launch")}
        </label>
        {value.isPreOrder && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <span className="text-[10px] text-outline uppercase font-semibold">{tr("Launch date")}</span>
              <input type="date" min={tomorrow()} className={input} value={value.launchDate} onChange={(e) => set({ launchDate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-outline uppercase font-semibold">{tr("Pre-orders close")}</span>
              <input type="date" min={tomorrow()} max={value.launchDate || undefined} className={input} value={value.preorderCutoff} onChange={(e) => set({ preorderCutoff: e.target.value })} />
            </div>
            <p className="col-span-2 text-[11px] text-outline">{tr("Customers reserve now and are charged on launch day. You see the demand under More → Stock & pre-orders.")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
