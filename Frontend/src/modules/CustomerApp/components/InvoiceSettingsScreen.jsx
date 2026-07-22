import { useState } from "react";
import { IMAGES } from "../types";
import { ArrowLeft } from 'lucide-react';
export function InvoiceSettingsScreen({ onGoBack, onSave, initialSettings }) {
    const [receiptType, setReceiptType] = useState(initialSettings.receiptType);
    const [companyName, setCompanyName] = useState(initialSettings.companyName);
    const [nipVat, setNipVat] = useState(initialSettings.nipVat);
    const [companyAddress, setCompanyAddress] = useState(initialSettings.companyAddress);
    const [billingEmail, setBillingEmail] = useState(initialSettings.billingEmail);
    const handleSave = () => {
        onSave({
            receiptType,
            companyName,
            nipVat,
            companyAddress,
            billingEmail
        });
    };
    return (<div className="bg-[#F5F5F0] text-on-surface min-h-[880px] pb-32">
      {/* Header element bar */}
      <header className="bg-white flex justify-between items-center w-full px-5 h-14 sticky top-0 z-40 border-b border-[#bec9c3]/20 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onGoBack}  className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low"><ArrowLeft size={24} /></button>
          <h1 className="text-[18px] font-extrabold text-primary">Invoice Settings</h1>
        </div>
        <div className="w-8 h-8 rounded-full overflow-hidden border border-[#bec9c3]/50 bg-primary/10 flex items-center justify-center text-primary font-bold text-[13px]">
          U
        </div>
      </header>

      <main className="px-5 pb-12 pt-6 space-y-6">
        {/* Intro */}
        <section className="space-y-1">
          <h2 className="text-[18px] font-extrabold text-on-surface">Receipt &amp; Invoice Preferences</h2>
          <p className="text-xs text-[#6e7a74] leading-relaxed">
            Manage how you receive your billing documents for your daily subscription meals.
          </p>
        </section>

        {/* RECEIPT TYPE SECTION */}
        <section className="space-y-3">
          <h3 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest font-sans">
            RECEIPT TYPE
          </h3>
          <div className="space-y-3">
            {/* Simple Card Option */}
            <div onClick={() => setReceiptType("simple")} className={`p-4 rounded-xl shadow-sm transition-all cursor-pointer flex items-start gap-4 bg-white border-2 ${receiptType === "simple"
            ? "border-primary shadow-[0_2px_12px_rgba(31,122,99,0.1)]"
            : "border-transparent"}`}>
              <div className="mt-1">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${receiptType === "simple" ? "border-primary-container" : "border-[#bec9c3]"}`}>
                  {receiptType === "simple" && (<div className="w-2.5 h-2.5 rounded-full bg-primary-container"></div>)}
                </div>
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-on-surface">Simple Receipt</p>
                <p className="text-xs text-on-surface-variant font-medium">B2C personal use. Shows total price only.</p>
              </div>
            </div>

            {/* VAT Card Option */}
            <div onClick={() => setReceiptType("vat")} className={`p-4 rounded-xl shadow-sm transition-all cursor-pointer flex items-start gap-4 bg-white border-2 ${receiptType === "vat"
            ? "border-primary shadow-[0_2px_12px_rgba(31,122,99,0.1)]"
            : "border-transparent"}`}>
              <div className="mt-1">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${receiptType === "vat" ? "border-primary-container" : "border-[#bec9c3]"}`}>
                  {receiptType === "vat" && (<div className="w-2.5 h-2.5 rounded-full bg-primary-container"></div>)}
                </div>
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-on-surface">Full VAT Invoice</p>
                <p className="text-xs text-on-surface-variant font-medium">B2B business use. Full VAT breakdown.</p>
              </div>
            </div>
          </div>
        </section>

        {/* COMPANY DETAILS SPECIFICATIONS */}
        <section className="space-y-4">
          <h3 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest font-sans">
            COMPANY DETAILS
          </h3>
          
          <div className="space-y-4">
            {/* Input 1 */}
            <div className="space-y-1.5 focus-within:text-primary">
              <label className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-wider ml-1">
                Company Name
              </label>
              <input type="text" disabled={receiptType === "simple"} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Corp Sp. z o.o." className="w-full h-12 px-4 bg-white border border-[#bec9c3] rounded-xl text-sm focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none disabled:opacity-55"/>
            </div>

            {/* Input 2 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-wider ml-1">
                NIP VAT Number
              </label>
              <input type="text" disabled={receiptType === "simple"} value={nipVat} onChange={(e) => setNipVat(e.target.value)} placeholder="123-456-78-90" className="w-full h-12 px-4 bg-white border border-[#bec9c3] rounded-xl text-sm focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none disabled:opacity-55"/>
            </div>

            {/* Input 3 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-wider ml-1">
                Company Address
              </label>
              <input type="text" disabled={receiptType === "simple"} value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} placeholder="ul. Wiejska 10, Warsaw" className="w-full h-12 px-4 bg-white border border-[#bec9c3] rounded-xl text-sm focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none disabled:opacity-55"/>
            </div>

            {/* Input 4 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-wider ml-1">
                Billing Email
              </label>
              <input type="email" disabled={receiptType === "simple"} value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} placeholder="accounting@acmecorp.pl" className="w-full h-12 px-4 bg-white border border-[#bec9c3] rounded-xl text-sm focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none disabled:opacity-55"/>
            </div>
          </div>
        </section>

        {/* Buttons Action bar */}
        <div className="pt-4">
          <button onClick={handleSave} className="w-full bg-primary-container hover:bg-[#155a49] text-white font-bold py-4 rounded-xl shadow-md active:scale-95 transition-transform duration-200 text-sm">
            Save Preferences
          </button>
        </div>
      </main>
    </div>);
}
