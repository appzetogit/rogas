/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ArrowLeft, Utensils, Flower2, ShoppingCart, Download, FileText, Plus, UtensilsCrossed, CheckCircle, CheckCircle2, Circle } from 'lucide-react';
import { useTranslation } from "react-i18next";






export default function SubViewsOverlay({
  viewType,
  onClose
}) {
  const { t } = useTranslation("vendor");
  // Ingredient Plan state
  const [chickenQty, setChickenQty] = useState(14);
  const [carrotsQty, setCarrotsQty] = useState(28);
  const [celeryQty, setCeleryQty] = useState(14);
  const [pierogiQty, setPierogiQty] = useState(50);
  const [creamQty, setCreamQty] = useState(10);

  // Food Forecast checklist checked state
  const [checklist, setChecklist] = useState({
    rosol: false,
    pierogi: false,
    salad: false
  });

  const [forecastCustoms, setForecastCustoms] = useState([]);
  const [newIngredient, setNewIngredient] = useState('');
  const [isAddingIngredient, setIsAddingIngredient] = useState(false);

  // Toast notifications
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);

  const triggerToast = (msg) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleAddCustom = (e) => {
    e.preventDefault();
    if (!newIngredient.trim()) return;
    setForecastCustoms((prev) => [...prev, newIngredient.trim()]);
    setNewIngredient('');
    setIsAddingIngredient(false);
    triggerToast(t("Custom preparation count posted! 🥣"));
  };

  return (
    <div className="w-full md:max-w-none min-h-screen bg-surface relative flex flex-col font-sans text-left mx-auto md:mx-0 shadow-xl md:shadow-none pb-10">
      
      {/* Header bar setup with close button */}
      <header className="fixed top-0 left-0 right-0 w-full md:left-64 md:right-0 md:w-auto mx-auto md:mx-0 z-50 h-14 flex items-center px-4 bg-primary text-on-primary">
        <button
          onClick={onClose}
          className="active:scale-95 transition-transform hover:opacity-90 flex items-center">
          
          <ArrowLeft />
        </button>
        <h1 className="flex-grow text-center font-semibold text-[16px] pr-8">
          {viewType === 'ingredientPlan' ? t("Ingredient Planner") : t("Food Forecast")}
        </h1>
      </header>

      {/* Main Content scroll window */}
      <main className="pt-14 px-4 py-5 flex-grow space-y-5 select-none">
        
        {viewType === 'ingredientPlan' ? (
        /* Screen 12: Ingredient Planner rendering */
        <div className="space-y-5 animate-fadeIn">
            {/* Title subheading banner details */}
            <section className="space-y-1 text-left">
              <p className="font-bold text-primary text-[13px]">
                {t("Plan your shopping list for Tuesday 13 May · 19 orders")}
              </p>
              <div className="h-1 w-12 bg-secondary-container rounded-full"></div>
            </section>

            {/* Recipe Card 1: Rosol */}
            <div className="bg-surface-container-lowest rounded-xl shadow-xs overflow-hidden border border-outline-variant/30">
              <div className="p-4 bg-surface-container-low border-b border-outline-variant/15 flex justify-between items-center text-left">
                <h2 className="font-bold text-[14px] text-on-surface">{t("Rosol z kurczaka — 14 portions")}</h2>
                <Utensils className="text-primary text-[18px]" />
              </div>
              <div className="p-4 text-left">
                <table className="w-full text-left border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-[10px] font-bold text-outline uppercase tracking-wider">
                      <th className="pb-1.5">{t("Ingredient")}</th>
                      <th className="pb-1.5 w-16 text-center">{t("Qty")}</th>
                      <th className="pb-1.5 text-right">{t("Unit")}</th>
                    </tr>
                  </thead>
                  <tbody className="text-[13px] font-semibold text-on-surface">
                    <tr className="align-middle">
                      <td className="py-1 text-on-surface-variant">{t("Chicken whole")}</td>
                      <td className="py-1">
                        <input
                        type="number"
                        value={chickenQty}
                        onChange={(e) => setChickenQty(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full text-center p-1 border border-outline-variant rounded focus:ring-1 focus:ring-primary bg-surface outline-none font-bold" />
                      
                      </td>
                      <td className="py-1 text-right text-outline">{t("pcs")}</td>
                    </tr>
                    <tr className="align-middle">
                      <td className="py-1 text-on-surface-variant">{t("Carrots")}</td>
                      <td className="py-1">
                        <input
                        type="number"
                        value={carrotsQty}
                        onChange={(e) => setCarrotsQty(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full text-center p-1 border border-outline-variant rounded focus:ring-1 focus:ring-primary bg-surface outline-none font-bold" />
                      
                      </td>
                      <td className="py-1 text-right text-outline">{t("pcs")}</td>
                    </tr>
                    <tr className="align-middle">
                      <td className="py-1 text-on-surface-variant">{t("Celery stalks")}</td>
                      <td className="py-1">
                        <input
                        type="number"
                        value={celeryQty}
                        onChange={(e) => setCeleryQty(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full text-center p-1 border border-outline-variant rounded focus:ring-1 focus:ring-primary bg-surface outline-none font-bold" />
                      
                      </td>
                      <td className="py-1 text-right text-outline">{t("pcs")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recipe Card 2: Pierogi */}
            <div className="bg-surface-container-lowest rounded-xl shadow-xs overflow-hidden border border-outline-variant/30">
              <div className="p-4 bg-surface-container-low border-b border-outline-variant/15 flex justify-between items-center text-left">
                <h2 className="font-bold text-[14px] text-on-surface">{t("Pierogi ruskie — 10 portions")}</h2>
                <Flower2 className="text-primary text-[18px]" />
              </div>
              <div className="p-4 text-left">
                <table className="w-full text-left border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-[10px] font-bold text-outline uppercase tracking-wider">
                      <th className="pb-1.5">{t("Ingredient")}</th>
                      <th className="pb-1.5 w-16 text-center">{t("Qty")}</th>
                      <th className="pb-1.5 text-right">{t("Unit")}</th>
                    </tr>
                  </thead>
                  <tbody className="text-[13px] font-semibold text-on-surface">
                    <tr className="align-middle">
                      <td className="py-1 text-on-surface-variant">{t("Pierogi frozen")}</td>
                      <td className="py-1">
                        <input
                        type="number"
                        value={pierogiQty}
                        onChange={(e) => setPierogiQty(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full text-center p-1 border border-outline-variant rounded focus:ring-1 focus:ring-primary bg-surface outline-none font-bold" />
                      
                      </td>
                      <td className="py-1 text-right text-outline">{t("pcs")}</td>
                    </tr>
                    <tr className="align-middle">
                      <td className="py-1 text-on-surface-variant">{t("Sour cream")}</td>
                      <td className="py-1">
                        <input
                        type="number"
                        value={creamQty}
                        onChange={(e) => setCreamQty(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full text-center p-1 border border-outline-variant rounded focus:ring-1 focus:ring-primary bg-surface outline-none font-bold" />
                      
                      </td>
                      <td className="py-1 text-right text-outline">{t("pcs")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Shopping Summary green block Card */}
            <div className="bg-on-primary-container/10 p-5 rounded-xl border border-primary-container/20 relative overflow-hidden text-left">
              <div className="absolute -right-4 -top-4 opacity-10">
                <ShoppingCart className="text-[100px] text-primary" />
              </div>
              <div className="relative z-10 space-y-3">
                <h3 className="text-[11px] font-bold text-primary uppercase tracking-widest">{t("Shopping Summary")}</h3>
                <p className="text-[11px] text-on-surface-variant leading-tight">{t("Consolidated shopping index for all active demands.")}</p>
                
                <div className="space-y-2 pt-2">
                  <button
                  onClick={() => triggerToast(t("Successfully generated and downloaded Excel order layout! 🛒"))}
                  className="w-full h-11 bg-primary text-on-primary rounded-lg font-bold text-[13px] flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-transform cursor-pointer">
                  
                    <Download className="text-[18px]" />
                    {t("Export consolidated list")}
                  </button>
                  <button
                  onClick={() => triggerToast(t("Compiled PDF invoice successfully queued to your default printer!"))}
                  className="w-full h-11 bg-white text-primary border border-primary-container rounded-lg font-bold text-[13px] flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
                  
                    <FileText className="text-[18px]" />
                    {t("Print consolidated PDF")}
                  </button>
                </div>
              </div>
            </div>

          </div>) : (

        /* Screen 10: Food Forecast rendering */
        <div className="space-y-4 animate-fadeIn text-left">
            {/* Header section card with green bg */}
            <section className="bg-primary text-on-primary p-4 rounded-xl shadow-xs space-y-4 -mx-4 -mt-5">
              <div>
                <p className="text-[11px] font-semibold text-white/80 uppercase">{t("Tomorrow's Production Plan")}</p>
                <h2 className="text-[17px] font-extrabold text-white mt-1">{t("Tuesday 13 May · 19 orders expected")}</h2>
              </div>
              
              {/* Bento statistics grid */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-white/10 rounded-lg p-3 text-center border border-white/15">
                  <p className="text-xl font-bold">19</p>
                  <p className="text-[9px] uppercase tracking-wider text-white/75 mt-0.5">{t("Orders")}</p>
                </div>
                <div className="bg-white/10 rounded-lg p-3 text-center border border-white/15">
                  <p className="text-xl font-bold">15</p>
                  <p className="text-[9px] uppercase tracking-wider text-white/75 mt-0.5">{t("Subs")}</p>
                </div>
                <div className="bg-white/10 rounded-lg p-3 text-center border border-white/15">
                  <p className="text-xl font-bold">4</p>
                  <p className="text-[9px] uppercase tracking-wider text-white/75 mt-0.5">{t("One-time")}</p>
                </div>
              </div>
            </section>

            {/* Portion Checklist items block */}
            <h3 className="text-[11px] font-bold text-outline uppercase tracking-wider mt-2.5 px-0.5">
              {t("WHAT TO PREPARE (item counts)")}
            </h3>
            
            <div className="space-y-3">
              {/* Rosol item */}
              <div
              onClick={() => setChecklist((prev) => ({ ...prev, rosol: !prev.rosol }))}
              className="bg-white p-4 rounded-xl border border-outline-variant/15 shadow-xs flex items-center justify-between transition-all hover:scale-[1.01] cursor-pointer">
              
                <div className="flex-1 min-w-0 pr-2">
                  <span className={`text-[14px] font-bold ${checklist.rosol ? 'line-through opacity-45' : 'text-on-surface'}`}>
                    {t("Rosol z kurczaka")}
                  </span>
                  <div className="mt-1 flex">
                    <span className="bg-primary/10 text-primary text-[11px] font-bold px-2 py-0.5 rounded-full border border-primary/15">
                      {t("14 portions")}
                    </span>
                  </div>
                </div>
                <button className="flex items-center gap-1 flex-shrink-0">
                  {checklist.rosol ? (
                    <CheckCircle2 className={`w-5 h-5 ${checklist.rosol ? 'text-primary' : 'text-outline'}`} />
                  ) : (
                    <Circle className={`w-5 h-5 ${checklist.rosol ? 'text-primary' : 'text-outline'}`} />
                  )}
                  <span className={`text-[12px] font-bold ${checklist.rosol ? 'text-primary' : 'text-outline'}`}>{t("Done")}</span>
                </button>
              </div>

              {/* Pierogi item */}
              <div
              onClick={() => setChecklist((prev) => ({ ...prev, pierogi: !prev.pierogi }))}
              className="bg-white p-4 rounded-xl border border-outline-variant/15 shadow-xs flex items-center justify-between transition-all hover:scale-[1.01] cursor-pointer">
              
                <div className="flex-1 min-w-0 pr-2">
                  <span className={`text-[14px] font-bold ${checklist.pierogi ? 'line-through opacity-45' : 'text-on-surface'}`}>
                    {t("Pierogi ruskie")}
                  </span>
                  <div className="mt-1 flex">
                    <span className="bg-primary/10 text-primary text-[11px] font-bold px-2 py-0.5 rounded-full border border-primary/15">
                      {t("10 portions")}
                    </span>
                  </div>
                </div>
                <button className="flex items-center gap-1 flex-shrink-0">
                  {checklist.pierogi ? (
                    <CheckCircle2 className={`w-5 h-5 ${checklist.pierogi ? 'text-primary' : 'text-outline'}`} />
                  ) : (
                    <Circle className={`w-5 h-5 ${checklist.pierogi ? 'text-primary' : 'text-outline'}`} />
                  )}
                  <span className={`text-[12px] font-bold ${checklist.pierogi ? 'text-primary' : 'text-outline'}`}>{t("Done")}</span>
                </button>
              </div>

              {/* Salad grecka item */}
              <div
              onClick={() => setChecklist((prev) => ({ ...prev, salad: !prev.salad }))}
              className="bg-white p-4 rounded-xl border border-outline-variant/15 shadow-xs flex items-center justify-between transition-all hover:scale-[1.01] cursor-pointer">
              
                <div className="flex-1 min-w-0 pr-2">
                  <span className={`text-[14px] font-bold ${checklist.salad ? 'line-through opacity-45' : 'text-on-surface'}`}>
                    {t("Salad grecka")}
                  </span>
                  <div className="mt-1 flex">
                    <span className="bg-primary/10 text-primary text-[11px] font-bold px-2 py-0.5 rounded-full border border-primary/15">
                      {t("7 portions")}
                    </span>
                  </div>
                </div>
                <button className="flex items-center gap-1 flex-shrink-0">
                  {checklist.salad ? (
                    <CheckCircle2 className={`w-5 h-5 ${checklist.salad ? 'text-primary' : 'text-outline'}`} />
                  ) : (
                    <Circle className={`w-5 h-5 ${checklist.salad ? 'text-primary' : 'text-outline'}`} />
                  )}
                  <span className={`text-[12px] font-bold ${checklist.salad ? 'text-primary' : 'text-outline'}`}>{t("Done")}</span>
                </button>
              </div>

              {/* Custom checklist ingredients */}
              {forecastCustoms.map((ing, idx) =>
            <div
              key={idx}
              className="bg-white p-4 rounded-xl border border-outline-variant/15 shadow-xs flex items-center justify-between opacity-80">
              
                  <span className="text-[14px] font-bold text-on-surface-variant break-all">{ing}</span>
                  <button
                onClick={() => setForecastCustoms((prev) => prev.filter((_, i) => i !== idx))}
                className="text-error font-bold text-[12px]">
                
                    {t("Remove")}
                  </button>
                </div>
            )}
            </div>

            {/* Add Custom Ingredient action */}
            {!isAddingIngredient ?
          <div className="flex justify-center pt-2">
                <button
              type="button"
              onClick={() => setIsAddingIngredient(true)}
              className="text-primary font-bold text-[13px] flex items-center gap-1 hover:underline active:scale-95 transition-transform">
              
                  <Plus className="text-[20px]" />
                  {t("Add custom ingredient")}
                </button>
              </div> :

          <form onSubmit={handleAddCustom} className="bg-white rounded-xl p-3 border border-outline-variant/20 shadow-xs space-y-2.5">
                <input
              type="text"
              required
              placeholder={t("e.g. 5x Pierogi with spinach, 1x Apple pie")}
              value={newIngredient}
              onChange={(e) => setNewIngredient(e.target.value)}
              className="w-full border border-outline-variant rounded-lg p-2 text-[12px] focus:border-primary outline-none" />
            
                <div className="flex justify-end gap-2 text-[11px] font-bold">
                  <button
                type="button"
                onClick={() => setIsAddingIngredient(false)}
                className="px-2.5 py-1.5 rounded text-outline hover:bg-slate-100">
                
                    {t("Cancel")}
                  </button>
                  <button
                type="submit"
                className="px-3.5 py-1.5 rounded bg-primary text-on-primary hover:brightness-105">
                
                    {t("Save")}
                  </button>
                </div>
              </form>
          }

            {/* Export and action triggers */}
            <div className="mt-8 pt-4">
              <button
              onClick={() => triggerToast(t("PDF Production Plan compiled! AirPrint queue initiated. 📄"))}
              className="w-full bg-primary-container text-on-primary font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:opacity-95 active:scale-[0.97] transition-all cursor-pointer text-[13px]">
              
                <Download className="text-[20px]" />
                {t("Export to PDF / Print Plan")}
              </button>
            </div>

            {/* Smart graphic disclaimer banner info */}
            <div className="bg-white rounded-2xl border border-outline-variant/20 p-4 flex gap-3 text-left relative mt-6 overflow-hidden w-full max-w-xl md:max-w-none">
              <div className="flex items-center gap-4">
                <UtensilsCrossed className="text-primary text-[32px]" />
                <div>
                  <h4 className="text-[12px] font-extrabold uppercase text-outline">{t("Plan smarter, waste less")}</h4>
                  <p className="text-[11px] text-on-surface-variant leading-normal mt-0.5">
                    {t("Pre-orders are locked and calculated dynamically based on automatic pickup routes details.")}
                  </p>
                </div>
              </div>
            </div>

          </div>)
        }
      </main>

      {/* Alert toast notification */}
      <div
        className={`fixed bottom-24 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-6 py-3 rounded-full flex items-center gap-3 transition-all duration-300 shadow-2xl z-100 ${
        showToast ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95 pointer-events-none'}`
        }>
        
        <CheckCircle className="text-green-400" />
        <span className="font-bold text-[13px]">{toastMsg}</span>
      </div>
    </div>);

}