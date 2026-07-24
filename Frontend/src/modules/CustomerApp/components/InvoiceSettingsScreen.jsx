import { useState } from "react";
import { IMAGES } from "../types";
import { ArrowLeft } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { dmbCustomerAPI } from "@food/api";
export function InvoiceSettingsScreen({ onGoBack, onSave, initialSettings, currentUser, selectedPlanDetails }) {
    const [receiptType, setReceiptType] = useState(initialSettings.receiptType);
    const [companyName, setCompanyName] = useState(initialSettings.companyName || currentUser?.companyName || '');
    const [nipVat, setNipVat] = useState(initialSettings.nipVat || currentUser?.companyNip || '');
    const [companyAddress, setCompanyAddress] = useState(initialSettings.companyAddress || currentUser?.registeredAddress || '');
    const [billingEmail, setBillingEmail] = useState(initialSettings.billingEmail || currentUser?.billingEmail || currentUser?.email || '');
    const handleSave = () => {
        onSave({
            receiptType,
            companyName,
            nipVat,
            companyAddress,
            billingEmail
        });
    };

    const handleDownload = async () => {
        // Also save preference first
        handleSave();
        
        // Try to fetch actual active subscription if selectedPlanDetails is missing (e.g. accessed from Profile)
        let planData = selectedPlanDetails;
        if (!planData) {
            try {
                const res = await dmbCustomerAPI.getMySubscriptions();
                if (res.data?.success && res.data.subscriptions?.length > 0) {
                    const activeSub = res.data.subscriptions.find(s => s.status === 'active') || res.data.subscriptions[0];
                    // Map it to match the expected structure
                    planData = {
                        mealPlan: { 
                            name: activeSub.meals?.[0]?.mealPlanName || "Standard Box Plan",
                            type: activeSub.duration || "Weekly"
                        },
                        startDate: activeSub.startDate,
                        endDate: activeSub.expiryDate,
                        days: activeSub.deliveryDays === 'full_week' ? 7 : 5,
                        pricing: {
                            totalPrice: activeSub.amountPaid || activeSub.pricing?.totalPrice || 150.00
                        }
                    };
                }
            } catch (err) {
                console.error("Failed to fetch active subscription for receipt", err);
            }
        }

        // Generate PDF using jsPDF
        const doc = new jsPDF();
        const invoiceNumber = `INV-DMB-SUB-${Math.floor(Math.random() * 1000000000)}`;
        
        // 1. Title & Header
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.text(receiptType === 'vat' ? "VAT INVOICE" : "SUBSCRIPTION RECEIPT", 14, 22);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Invoice Number: ${invoiceNumber}`, 14, 30);
        doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, 14, 35);
        
        // 2. Vendor & Customer Details Table (Side by Side layout)
        const finalCustName = currentUser?.name || 'Customer Name';
        const finalCustEmail = currentUser?.email || 'customer@example.com';
        
        let customerLines = [];
        if (receiptType === 'vat') {
             customerLines = [
                 `Customer Name: ${finalCustName}`,
                 `Company Name: ${companyName || 'Not Provided'}`,
                 `NIP/VAT: ${nipVat || 'Not Provided'}`,
                 `Email: ${billingEmail || 'Not Provided'}`,
                 `Address: ${companyAddress || 'Not Provided'}`
             ];
        } else {
             customerLines = [
                 `Name: ${finalCustName}`,
                 `Email: ${finalCustEmail}`
             ];
        }

        autoTable(doc, {
            startY: 45,
            theme: 'plain',
            head: [['Vendor Details', receiptType === 'vat' ? 'Company Details' : 'Customer Details']],
            body: [[
                "Test home6\nContact: +48987654321\nAddress: Corporate House, 103,\nFilm Colony Rd, Flim Colony,\nChhoti Gwaltoli, Indore,\nMadhya Pradesh 452001, India",
                customerLines.join('\n')
            ]],
            headStyles: { fillColor: false, textColor: [40, 121, 101], fontStyle: 'bold', fontSize: 12 },
            styles: { cellPadding: 1, fontSize: 10, valign: 'top' },
            columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 90 } }
        });

        // 3. Subscription Details Table
        const planName = planData?.mealPlan?.name || "Standard Box Plan";
        const planType = planData?.mealPlan?.type || "Weekly";
        const startDate = planData?.startDate ? new Date(planData.startDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
        const endDate = planData?.endDate ? new Date(planData.endDate).toLocaleDateString('en-GB') : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB');
        const validityDays = planData?.days || 7;
        const totalPrice = planData?.pricing?.totalPrice || 150.00;

        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 15,
            theme: 'striped',
            head: [['Plan Name', 'Type', 'Start Date', 'End Date', 'Validity', 'Status']],
            body: [
                [planName, planType, startDate, endDate, `${validityDays} days`, "Active"]
            ],
            headStyles: { fillColor: [40, 121, 101] }, // Brand primary color
        });

        // 4. Billing Details Table
        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 15,
            theme: 'grid',
            head: [['Description', 'Payment Method', 'Amount']],
            body: [
                ['Subscription Amount', 'Prepaid/Wallet', `INR ${totalPrice.toFixed(2)}`]
            ],
            foot: [['Total Paid Amount', '', `INR ${totalPrice.toFixed(2)}`]],
            headStyles: { fillColor: [40, 121, 101] },
            footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' }
        });

        // Footer Message
        doc.setFontSize(10);
        doc.setFont("helvetica", "italic");
        doc.text("Thank you for choosing DailyMealBox!", 14, doc.lastAutoTable.finalY + 20);

        // Save the PDF
        doc.save(`${invoiceNumber}.pdf`);
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
        {receiptType === 'vat' && (
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
                <input type="text" readOnly value={companyName} placeholder="Acme Corp Sp. z o.o." className="w-full h-12 px-4 bg-[#f4f6f5] border border-[#bec9c3] rounded-xl text-sm text-[#6e7a74] cursor-not-allowed outline-none"/>
              </div>

              {/* Input 2 */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-wider ml-1">
                  NIP VAT Number
                </label>
                <input type="text" readOnly value={nipVat} placeholder="123-456-78-90" className="w-full h-12 px-4 bg-[#f4f6f5] border border-[#bec9c3] rounded-xl text-sm text-[#6e7a74] cursor-not-allowed outline-none"/>
              </div>

              {/* Input 3 */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-wider ml-1">
                  Company Address
                </label>
                <input type="text" readOnly value={companyAddress} placeholder="ul. Wiejska 10, Warsaw" className="w-full h-12 px-4 bg-[#f4f6f5] border border-[#bec9c3] rounded-xl text-sm text-[#6e7a74] cursor-not-allowed outline-none"/>
              </div>

              {/* Input 4 */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-wider ml-1">
                  Billing Email
                </label>
                <input type="email" readOnly value={billingEmail} placeholder="accounting@acmecorp.pl" className="w-full h-12 px-4 bg-[#f4f6f5] border border-[#bec9c3] rounded-xl text-sm text-[#6e7a74] cursor-not-allowed outline-none"/>
              </div>
            </div>
          </section>
        )}

        {/* Buttons Action bar */}
        <div className="pt-4">
          <button onClick={handleDownload} className="w-full bg-[#287965] hover:bg-[#1f6050] text-white font-bold py-4 rounded-xl shadow-md active:scale-95 transition-transform duration-200 text-sm flex items-center justify-center gap-2">
            <Download className="text-[20px]" />
            {receiptType === 'simple' ? 'Download Subscription Receipt' : 'Download VAT Invoice'}
          </button>
        </div>
      </main>
    </div>);
}
