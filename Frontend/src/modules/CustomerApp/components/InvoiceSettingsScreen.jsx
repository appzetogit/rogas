import { useState, useEffect, useRef } from "react";
import { IMAGES } from "../types";
import { ArrowLeft, Download } from 'lucide-react';
import { dmbCustomerAPI, dmbExtraCustomerAPI } from "@food/api";
import { useTranslation } from "react-i18next";
const fieldCls = "w-full h-12 px-4 bg-white border border-[#bec9c3] focus:border-primary rounded-xl text-sm text-on-surface outline-none";

// The address is kept as one line on the profile and on invoices; the screen edits it as street, post code and city.
const splitAddress = (raw) => {
  const text = String(raw || "").trim();
  const m = text.match(/(\d{2}-\d{3})\s+(.+)$/);
  if (!m) return { street: text, postCode: "", city: "" };
  return { street: text.slice(0, m.index).replace(/[,\s]+$/, "").trim(), postCode: m[1], city: m[2].trim() };
};
const joinAddress = ({ street, postCode, city }) =>
  [street.trim(), [postCode.trim(), city.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
const digitsOf = (value) => String(value || "").replace(/\D/g, "");
export function InvoiceSettingsScreen({ onGoBack, onSave, initialSettings, currentUser, selectedPlanDetails }) {
  const { t } = useTranslation("customer");
  const [receiptType, setReceiptType] = useState(initialSettings.receiptType);
  const [companyName, setCompanyName] = useState(initialSettings.companyName || currentUser?.companyName || '');
  const [nipVat, setNipVat] = useState(initialSettings.nipVat || currentUser?.companyNip || '');
  const [address, setAddress] = useState(() => splitAddress(initialSettings.companyAddress || currentUser?.registeredAddress || ''));
  const [billingEmail, setBillingEmail] = useState(initialSettings.billingEmail || currentUser?.billingEmail || currentUser?.email || '');
  const handleSave = () => {
    onSave({
      receiptType,
      companyName,
      nipVat,
      companyAddress: joinAddress(address),
      billingEmail
    });
  };

  // NIP -> company details from the official VAT registry. Runs only when the customer changes the NIP (never on the
  // number that was already saved), and fills fields that stay editable.
  const [nipState, setNipState] = useState({ status: "idle", message: "" }); // idle | loading | found | error
  const lastLookedUp = useRef(digitsOf(initialSettings.nipVat || currentUser?.companyNip));
  const autoFilledFor = useRef(""); // the NIP whose registry details are currently in the form
  useEffect(() => {
    const nip = digitsOf(nipVat);
    if (nip.length !== 10) {
      // Still typing: an old message about a previous number no longer applies.
      setNipState((state) => (state.status === "idle" ? state : { status: "idle", message: "" }));
      return undefined;
    }
    if (receiptType !== "vat" || nip === lastLookedUp.current) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      lastLookedUp.current = nip;
      setNipState({ status: "loading", message: "" });
      try {
        const res = await dmbExtraCustomerAPI.nipLookup(nip);
        if (cancelled) return;
        const c = res.data?.company || {};
        autoFilledFor.current = nip;
        setCompanyName(c.companyName || "");
        setAddress({ street: c.street || c.address || "", postCode: c.postCode || "", city: c.city || "" });
        const status = c.vatStatus;
        setNipState({
          status: "found",
          message: status && status !== "Czynny"
            ? t("Details loaded from the official registry (VAT status: {{status}}). You can edit them.", { status })
            : t("Details loaded from the official registry. You can edit them."),
        });
      } catch (err) {
        if (cancelled) return;
        lastLookedUp.current = ""; // let the customer try the same number again
        if (autoFilledFor.current && autoFilledFor.current !== nip) {
          // The form still holds another company's details: leaving them next to this NIP would invoice the wrong company.
          autoFilledFor.current = "";
          setCompanyName("");
          setAddress({ street: "", postCode: "", city: "" });
        }
        const code = err?.response?.status;
        setNipState({
          status: "error",
          message: code === 400 ? t("This NIP number is not valid. Please check the 10 digits.")
            : code === 404 ? t("No company found for this NIP in the VAT registry.")
            : code === 429 ? t("Too many company lookups. Please try again later.")
            : t("The company registry is not reachable right now. Please type the details manually."),
        });
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nipVat, receiptType]);

  // The invoice that can be downloaded is the one of a real, paid subscription (built by the server from what was charged).
  const [invoiceSub, setInvoiceSub] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let alive = true;
    dmbCustomerAPI.getMySubscriptions()
      .then((res) => {
        const list = (res.data?.subscriptions || []).filter((s) => s.status !== "pending_payment");
        if (alive) setInvoiceSub(list.find((s) => s.status === "active") || list[0] || null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const handleDownload = async () => {
    if (!invoiceSub?._id) return;
    setDownloading(true);
    setMessage("");
    try {
      handleSave(); // the VAT details typed here are what the next invoice uses
      const res = await dmbCustomerAPI.downloadInvoice(invoiceSub._id);
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Invoice-${invoiceSub.subscriptionId || invoiceSub._id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      // A failed download comes back as a blob holding the server's JSON message.
      let text = "";
      try { text = JSON.parse(await err?.response?.data?.text?.())?.message || ""; } catch { /* not JSON */ }
      setMessage(text || t("Could not download the invoice. Please try again."));
    } finally {
      setDownloading(false);
    }
  };
  return (<div className="bg-[#F5F5F0] text-on-surface min-h-[880px] pb-32">
    {/* Header element bar */}
    <header className="fixed top-0 left-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
      <button onClick={onGoBack} className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"><ArrowLeft size={24} /></button>
      <h1 className="text-xl font-extrabold text-primary text-center">{t("Invoice Preferences")}</h1>
      <div className="w-8" />
    </header>

    <main className="pt-20 pb-12 px-4 sm:px-8 lg:px-10 w-full max-w-7xl mx-auto space-y-6">
      {/* Intro */}
      <section className="space-y-1">
        <h2 className="text-[18px] font-extrabold text-on-surface">{t("Receipt & Invoice Preferences")}</h2>
        <p className="text-xs text-[#6e7a74] leading-relaxed">
          {t("Manage how you receive your billing documents for your daily subscription meals.")}
        </p>
      </section>

      {/* RECEIPT TYPE SECTION */}
      <section className="space-y-3">
        <h3 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest font-sans">
          {t("RECEIPT TYPE")}
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
              <p className="text-sm font-bold text-on-surface">{t("Simple Receipt")}</p>
              <p className="text-xs text-on-surface-variant font-medium">{t("B2C personal use. Shows total price only.")}</p>
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
              <p className="text-sm font-bold text-on-surface">{t("Full VAT Invoice")}</p>
              <p className="text-xs text-on-surface-variant font-medium">{t("B2B business use. Full VAT breakdown.")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* COMPANY DETAILS SPECIFICATIONS */}
      {receiptType === 'vat' && (
        <section className="space-y-4">
          <h3 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest font-sans">
            {t("COMPANY DETAILS")}
          </h3>

          <div className="space-y-4">
            {/* Input 1 */}
            <div className="space-y-1.5 focus-within:text-primary">
              <label className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-wider ml-1">
                {t("Company Name")}
              </label>
              <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={fieldCls} />
            </div>

            {/* Input 2 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-wider ml-1">
                {t("NIP VAT Number")}
              </label>
              <input type="text" inputMode="numeric" autoComplete="off" value={nipVat} onChange={(e) => setNipVat(e.target.value)} className={fieldCls} />
              {nipState.status === "loading" && <p className="text-xs text-[#6e7a74] ml-1">{t("Looking up the company…")}</p>}
              {nipState.status === "found" && <p className="text-xs text-[#287965] font-semibold ml-1">{nipState.message}</p>}
              {nipState.status === "error" && <p className="text-xs text-red-600 font-semibold ml-1">{nipState.message}</p>}
            </div>

            {/* Input 3 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-wider ml-1">
                {t("Company Address")}
              </label>
              <div className="space-y-2">
                <input type="text" value={address.street} onChange={(e) => setAddress((a) => ({ ...a, street: e.target.value }))} placeholder={t("Street and number")} className={fieldCls} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={address.postCode} onChange={(e) => setAddress((a) => ({ ...a, postCode: e.target.value }))} placeholder={t("Postcode")} className={fieldCls} />
                  <input type="text" value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} placeholder={t("City")} className={fieldCls} />
                </div>
              </div>
            </div>

            {/* Input 4 */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-wider ml-1">
                {t("Billing Email")}
              </label>
              <input type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} className={fieldCls} />
            </div>
          </div>
        </section>
      )}

      {/* Buttons Action bar */}
      <div className="pt-4 space-y-3">
        <button onClick={() => { handleSave(); setMessage(t("Invoice preferences saved.")); }} className="w-full bg-[#287965] hover:bg-[#1f6050] text-white font-bold py-4 rounded-xl shadow-md active:scale-95 transition-transform duration-200 text-sm">
          {t("Save preferences")}
        </button>
        {invoiceSub ? (
          <button onClick={handleDownload} disabled={downloading} className="w-full border border-[#287965] text-[#287965] font-bold py-4 rounded-xl active:scale-95 transition-transform duration-200 text-sm flex items-center justify-center gap-2 disabled:opacity-60">
            <Download className="text-[20px]" />
            {downloading ? t("Preparing...") : (receiptType === 'simple' ? t("Download Subscription Receipt") : t("Download VAT Invoice"))}
          </button>
        ) : (
          <p className="text-xs text-center text-[#6e7a74]">{t("Your invoice is available for download once your subscription is paid.")}</p>
        )}
        {message && <p className="text-xs text-center font-semibold text-[#287965]">{message}</p>}
      </div>
    </main>
  </div>);
}
