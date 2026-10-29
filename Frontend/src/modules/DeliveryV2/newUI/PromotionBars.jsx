import { useState, useEffect } from "react";
import { Gift } from "lucide-react";
import { useTranslation } from "react-i18next";
import { dmbExtraDriverAPI } from "@food/api";
import useDriverMoney from "../hooks/useDriverMoney";

/** DA-03: the driver's running promotions, each with this week's progress as a bar. */
const PromotionBars = () => {
  const { t } = useTranslation("driver");
  const { money } = useDriverMoney();
  const [promotions, setPromotions] = useState([]);

  useEffect(() => {
    let alive = true;
    dmbExtraDriverAPI.promotions()
      .then((res) => { if (alive) setPromotions(res?.data?.promotions || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!promotions.length) return null;
  const until = (d) => new Date(d).toLocaleDateString([], { day: "numeric", month: "short" });

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#3e4945] flex items-center gap-1.5 px-1">
        <Gift className="w-3.5 h-3.5" /> {t("Promotions")}
      </h3>
      {promotions.map((p) => {
        const boost = p.type === "rate_boost";
        const percent = p.target > 0 ? Math.min(100, Math.round((p.current / p.target) * 100)) : 0;
        return (
          <div key={p._id} className="bg-white p-4 rounded-xl border border-[#e0e3e0] shadow-sm">
            <div className="flex justify-between items-start gap-2 mb-2">
              <h4 className="font-bold text-gray-900 text-sm">{p.name}</h4>
              <span className="text-[11px] font-semibold text-[#3e4945] shrink-0">{t("Until {{date}}", { date: until(p.validUntil) })}</span>
            </div>
            {boost ? (
              <p className="text-xs font-bold text-[#00604c]">{t("+{{amount}} on every delivery", { amount: money(p.rateBoostPln, { compact: true }) })}</p>
            ) : (
              <>
                <div className="w-full h-3 bg-[#e5e9e5] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${p.achieved ? "bg-[#00604c]" : "bg-amber-500"}`} style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs text-[#3e4945]">
                  <span>{p.achieved ? t("Bonus earned") : t("{{current}} of {{target}}", { current: p.current, target: p.target })}</span>
                  <span className="font-bold">{t("{{amount}} bonus", { amount: money(p.bonusPln, { compact: true }) })}</span>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export { PromotionBars };
