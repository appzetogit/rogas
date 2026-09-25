import { useState } from "react";
import { Flame, Compass, HelpCircle, ZoomIn } from "lucide-react";
import { useTranslation } from "react-i18next";
const DemandHeatmapView = ({
  onNavigateToUrsynow
}) => {
  const { t } = useTranslation("driver");
  const [selectedSubzone, setSelectedSubzone] = useState("Ursynow");
  const subzones = [
    { name: "Centrum", level: "High", color: "bg-red-600/40 border-red-600 border-2", surge: "1.3x", bonus: "+20 PLN" },
    { name: "Ursynow", level: "Hottest", color: "bg-[#ff4d4d]/50 border-[#ff4d4d] border-4", surge: "1.5x", bonus: "+35 PLN" },
    { name: "Ochota", level: "Low", color: "bg-emerald-600/30 border-emerald-600 border-2", surge: "1.0x", bonus: "0 PLN" },
    { name: "Mokotow", level: "Medium", color: "bg-amber-500/40 border-amber-500 border-2", surge: "1.2x", bonus: "+15 PLN" }
  ];
  const currentZoneData = subzones.find((z) => z.name === selectedSubzone) || subzones[1];
  return <div className="space-y-4 pb-12 animate-fadeIn text-gray-800">
      {
    /* Map Canvas Section representing high-fidelity dark-themed Grid and satellite landmarks */
  }
      <div className="relative w-full h-[360px] bg-slate-900 rounded-2xl overflow-hidden shadow-inner border border-slate-700">
        {
    /* Dark Muted Coordinates Background */
  }
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px]" />
        
        {
    /* Mock Warsaw map satellite landscape */
  }
        <img
    alt={t("Satellite layout map of Warsaw corridors")}
    className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-luminosity"
    src="https://lh3.googleusercontent.com/placeholder-satellite-warsaw"
    onError={(e) => {
      e.currentTarget.src = "https://lh3.googleusercontent.com/aida-public/AB6AXuBZj95FbV95w7kgWpyWVn_134ndqLpi_aMeaGLzBLHpwR1JSq8_W9M6TZHSy4iew34s_bLFKKE14ozvY9hRdDhYygzx_0rYoD4a5RxX1qE9bWt01Aba14T2WB8RYAl-V1F6lAaGdElQU2JSfjNHbSSMH-7OwlQ9iKKcFZ9sst7UYHpjCM_9qqxNB3mVzLuFTM3SiJNdLQsh5arSD149UQf2IbdSBLX2HcWiiYMue3UFK6SdvTtW5HU-KwLoznAaPXAZgQq2tyciRIFK";
    }}
    referrerPolicy="no-referrer"
  />

        {
    /* Heatmap overlay map vector bubbles drawing matching the screenshot layout */
  }
        <div className="absolute inset-0">
          
          {
    /* Ochota bubble (Top Left) */
  }
          <button
    onClick={() => setSelectedSubzone("Ochota")}
    className={`absolute top-1/4 left-[15%] flex flex-col items-center justify-center transition-all ${selectedSubzone === "Ochota" ? "scale-110 shadow-lg" : "hover:scale-105 opacity-80"}`}
  >
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${subzones[2].color}`}>
              <span className="text-[10px] text-white font-black drop-shadow-md">{t("Ochota")}</span>
            </div>
          </button>

          {
    /* Centrum bubble (Center top-ish) */
  }
          <button
    onClick={() => setSelectedSubzone("Centrum")}
    className={`absolute top-[18%] left-[45%] flex flex-col items-center justify-center transition-all ${selectedSubzone === "Centrum" ? "scale-110 shadow-lg" : "hover:scale-105 opacity-80"}`}
  >
            <div className={`w-24 h-24 rounded-full flex items-center justify-center ${subzones[0].color}`}>
              <span className="text-xs text-white font-black drop-shadow-md">{t("Centrum")}</span>
            </div>
          </button>

          {
    /* Mokotow bubble (Bottom center) */
  }
          <button
    onClick={() => setSelectedSubzone("Mokotow")}
    className={`absolute bottom-[20%] left-[25%] flex flex-col items-center justify-center transition-all ${selectedSubzone === "Mokotow" ? "scale-110 shadow-lg" : "hover:scale-105 opacity-80"}`}
  >
            <div className={`w-20 h-20 rounded-full flex items-center justify-center ${subzones[3].color}`}>
              <span className="text-xs text-white font-black drop-shadow-md">{t("Mokotow")}</span>
            </div>
          </button>

          {
    /* Ursynow bubble (Bottom Right - Hottest spotlight!) */
  }
          <button
    onClick={() => setSelectedSubzone("Ursynow")}
    className={`absolute top-[40%] right-[10%] flex flex-col items-center justify-center transition-all ${selectedSubzone === "Ursynow" ? "scale-115 shadow-2xl relative z-10" : "hover:scale-110 animate-pulse"}`}
  >
            <div className={`w-28 h-28 rounded-full flex flex-col items-center justify-center ${subzones[1].color}`}>
              <span className="text-sm text-yellow-300 font-extrabold drop-shadow-md">{t("Ursynow")}</span>
              <span className="text-[9px] font-black text-white px-2 py-0.5 bg-red-600 rounded-full mt-1 animate-bounce">
                {t("HOTTEST")}
              </span>
            </div>
          </button>

        </div>

        {
    /* Floating Hottest Alert Banner */
  }
        <div className="absolute top-4 left-4 right-4 animate-bounce">
          <div className="bg-[#ffebe8] border border-[#a3574c]/30 text-[#3c0804] px-4 py-3 rounded-xl shadow-lg flex items-center gap-3">
            <Flame className="w-5 h-5 text-[#854036] fill-[#854036]" />
            <p className="text-xs font-black">{t("Ursynow is hottest right now! More orders pending.")}</p>
          </div>
        </div>

        {
    /* Floating map visual elements */
  }
        <div className="absolute bottom-3 right-3 bg-black/60 rounded-md p-1 backdrop-blur-xs flex items-center gap-1">
          <button className="p-1 hover:bg-white/20 rounded" title={t("Zoom in")}>
            <ZoomIn className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {
    /* Legend Card Container */
  }
      <section className="bg-white border border-[#e0e3e0] rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-extrabold text-[#181d1b] text-base">{t("District Demand Levels")}</h2>
          <HelpCircle className="w-4.5 h-4.5 text-[#bec9c3]" />
        </div>
        
        <div className="flex justify-around items-center pt-1">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-600 inline-block" />
            <span className="text-xs font-bold text-[#5d5f5b]">{t("High")}</span>
          </div>
          
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
            <span className="text-xs font-bold text-[#5d5f5b]">{t("Medium")}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-600 inline-block" />
            <span className="text-xs font-bold text-[#5d5f5b]">{t("Low")}</span>
          </div>
        </div>
      </section>

      {
    /* Surge Pricing Info Bento Card */
  }
      <section className="bg-white border border-[#bec9c3] rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-l-4 border-amber-500 flex justify-between items-center gap-4">
          <div className="space-y-1">
            <h3 className="font-extrabold text-[#181d1b] text-sm flex items-center gap-1">
              <span>{t("Earn {{surge}} in {{name}}", { surge: currentZoneData.surge, name: currentZoneData.name })}</span>
              {currentZoneData.level === "Hottest" && <Flame className="w-4 h-4 text-[#ba1a1a] fill-[#ba1a1a]" />}
            </h3>
            <p className="text-xs text-[#5d5f5b] leading-normal font-sans">
              {t("Surge multiplier premium is active due to extreme courier shortage in this sector.")}
            </p>
          </div>
          
          <div className="text-right flex-shrink-0">
            <p className="text-lg font-extrabold text-[#00604c]">{currentZoneData.bonus}</p>
            <span className="text-[10px] text-[#5d5f5b] font-bold block leading-none">{t("est. bonus")}</span>
          </div>
        </div>
      </section>

      {
    /* Main Action Navigate to District CTA */
  }
      <button
    onClick={onNavigateToUrsynow}
    className="w-full h-[52px] bg-[#00604c] hover:bg-[#1f7a63] text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md shadow-[#00604c]/20 transition-transform active:scale-[0.98] text-sm"
  >
        <Compass className="w-5 h-5 fill-white text-[#00604c]" />
        {t("Navigate to {{name}}", { name: currentZoneData.name })}
      </button>
    </div>;
};
export {
  DemandHeatmapView
};
