import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, MessageCircle, Mail } from "lucide-react";
import { dmbExtraCustomerAPI } from "@food/api";
import { tKey } from "@/shared/i18n";
import usePlatformConfig from "../../../../shared/platform/usePlatformConfig";
import { getAnalyticsConsent, setAnalyticsConsent } from "../../../../shared/analytics/ga4";
import { ScreenHeader, Section, Toggle, Notice, PrimaryButton, Spinner, Chip, errorText } from "./ui";

const LABELS = {
  delivery_updates: tKey("Delivery updates"),
  subscription: tKey("Subscription"),
  pantry: tKey("Pantry Box"),
  promotions: tKey("Promotions"),
  driver_assigned: tKey("Driver assigned"),
  arriving: tKey("Driver arriving"),
  order_delivered: tKey("Order delivered"),
  delivery_failed: tKey("Delivery problem"),
  tomorrow_preview: tKey("Tomorrow's meal preview"),
  menu_confirmed: tKey("Menu confirmed for an upcoming day"),
  platform_closure: tKey("Platform holidays & closures"),
  renewal_reminder: tKey("Renewal reminders"),
  review_response: tKey("A vendor replied to my review"),
  payment_failed: tKey("Payment failed"),
  subscription_cancelled: tKey("Subscription cancelled"),
  slot_change_required: tKey("Delivery slot discontinued"),
  window_open: tKey("Pantry ordering window open"),
  pantry_order_updates: tKey("Pantry order updates"),
  flash_deals: tKey("Flash deals"),
  new_vendors: tKey("New makers near me"),
  subscribe_offers: tKey("Subscription offers"),
  preorder_launches: tKey("New meal launches & pre-orders"),
};

/**
 * CA-15 Notification settings (Gap W) + marketing e-mail consent (Gap I, GDPR: off by default, timestamped) +
 * eco-packaging preference (Gap AI) + analytics cookies (Gap H).
 */
export function NotificationSettingsScreen({ onGoBack, onShowToast, currentUser }) {
  const { t } = useTranslation("customer");
  const { get } = usePlatformConfig();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [eco, setEco] = useState(Boolean(currentUser?.ecoPreference));
  const [analytics, setAnalytics] = useState(getAnalyticsConsent() === "granted");

  useEffect(() => {
    dmbExtraCustomerAPI
      .getNotificationPreferences()
      .then((res) => setData(res.data))
      .catch((err) => setError(errorText(err, t("Could not load your settings"))));
  }, [t]);

  const label = (key, fallback) => (LABELS[key] ? t(LABELS[key]) : fallback);

  const setPref = async (category, type, value) => {
    const prev = data;
    setData((d) => ({ ...d, preferences: { ...d.preferences, [category]: { ...d.preferences[category], [type]: value } } }));
    setSaving(`${category}.${type}`);
    try {
      const res = await dmbExtraCustomerAPI.saveNotificationPreferences({ preferences: { [category]: { [type]: value } } });
      setData((d) => ({ ...d, preferences: res.data.preferences }));
    } catch (err) {
      setData(prev);
      setError(errorText(err, t("Could not save")));
    } finally {
      setSaving("");
    }
  };

  const setMarketing = async (value) => {
    setSaving("marketing");
    try {
      const res = await dmbExtraCustomerAPI.saveNotificationPreferences({ marketingEmailConsent: value });
      setData((d) => ({ ...d, marketingEmailConsent: res.data.marketingEmailConsent }));
      onShowToast?.(value ? t("You will receive our offers by e-mail") : t("You will no longer receive marketing e-mails"));
    } catch (err) {
      setError(errorText(err, t("Could not save")));
    } finally {
      setSaving("");
    }
  };

  const setEcoPref = async (value) => {
    setEco(value);
    try {
      await dmbExtraCustomerAPI.setEcoPreference(value);
    } catch (err) {
      setEco(!value);
      setError(errorText(err, t("Could not save")));
    }
  };

  const ga = get("googleAnalytics");
  return (
    <div className="bg-[#F5F5F0] min-h-screen pb-28">
      <ScreenHeader title={t("Notifications & privacy")} onBack={onGoBack} />
      <main className="px-5 pt-5 max-w-xl mx-auto space-y-6">
        {error && <Notice tone="error">{error}</Notice>}
        {!data ? (
          <Spinner />
        ) : (
          <>
            {data.catalogue.map((cat) => (
              <Section key={cat.category} title={label(cat.category, cat.label)}>
                {cat.types.map((type) =>
                  type.locked ? (
                    <div key={type.type} className="flex items-center gap-3 bg-white border border-[#e4e2e1] rounded-xl p-3">
                      <div className="flex-1">
                        <p className="font-extrabold text-[13px]">{label(type.type, type.label)}</p>
                        <p className="text-[11px] text-[#6e7a74]">{t("Always on — important for your orders")}</p>
                      </div>
                      <Lock size={16} className="text-[#6e7a74]" />
                    </div>
                  ) : (
                    <Toggle
                      key={type.type}
                      checked={data.preferences?.[cat.category]?.[type.type]}
                      disabled={saving === `${cat.category}.${type.type}`}
                      onChange={(v) => setPref(cat.category, type.type, v)}
                      label={label(type.type, type.label)}
                    />
                  ),
                )}
              </Section>
            ))}

            <Section title={t("Marketing e-mails")}>
              <Toggle
                checked={Boolean(data.marketingEmailConsent?.granted)}
                disabled={saving === "marketing"}
                onChange={setMarketing}
                label={t("Send me offers and news by e-mail")}
                hint={
                  data.marketingEmailConsent?.granted && data.marketingEmailConsent?.at
                    ? t("Consent given on {{date}}. You can withdraw it any time.", { date: new Date(data.marketingEmailConsent.at).toLocaleDateString() })
                    : t("Off unless you switch it on. We never share your e-mail.")
                }
              />
            </Section>
          </>
        )}

        <Section title={t("Packaging")}>
          <Toggle checked={eco} onChange={setEcoPref} label={t("I prefer eco-friendly packaging")} hint={t("Makers with verified eco packaging are shown first for you.")} />
        </Section>

        {ga?.enabled && (
          <Section title={t("Cookies")}>
            <Toggle
              checked={analytics}
              onChange={(v) => {
                setAnalytics(v);
                setAnalyticsConsent(v ? "granted" : "denied");
              }}
              label={t("Analytics cookies")}
              hint={t("Help us improve the app with anonymous usage statistics (Google Analytics).")}
            />
          </Section>
        )}
      </main>
    </div>
  );
}

/** CA-v2-07 Invoice delivery: e-mail, WhatsApp or both (Gap J, ACM-156). */
export function InvoiceDeliveryCard({ onShowToast }) {
  const { t } = useTranslation("customer");
  const [data, setData] = useState(null);
  const [method, setMethod] = useState("email");
  const [number, setNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    dmbExtraCustomerAPI
      .getInvoiceDelivery()
      .then((res) => {
        setData(res.data);
        setMethod(res.data.invoiceDeliveryMethod || "email");
        setNumber(res.data.whatsappNumber || "");
      })
      .catch(() => setData({ whatsappEnabled: false }));
  }, []);

  if (!data || !data.whatsappEnabled) return null;
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await dmbExtraCustomerAPI.saveInvoiceDelivery({ invoiceDeliveryMethod: method, whatsappNumber: number });
      onShowToast?.(t("Invoice delivery saved"));
    } catch (err) {
      setError(errorText(err, t("Could not save")));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Section title={t("How should we send your invoices?")} className="bg-white rounded-2xl p-4 border border-[#e4e2e1]">
      <div className="flex gap-2 flex-wrap">
        <Chip active={method === "email"} onClick={() => setMethod("email")}><span className="inline-flex items-center gap-1"><Mail size={14} /> {t("E-mail")}</span></Chip>
        <Chip active={method === "whatsapp"} onClick={() => setMethod("whatsapp")}><span className="inline-flex items-center gap-1"><MessageCircle size={14} /> {t("WhatsApp")}</span></Chip>
        <Chip active={method === "both"} onClick={() => setMethod("both")}>{t("Both")}</Chip>
      </div>
      {method !== "email" && (
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          inputMode="tel"
          placeholder="+48600123456"
          className="w-full bg-[#f9f9f7] border border-[#e4e2e1] rounded-xl px-3 py-2.5 text-[13px]"
          aria-label={t("WhatsApp number")}
        />
      )}
      {method !== "email" && <p className="text-[11px] text-[#6e7a74]">{t("We send the PDF invoice to this WhatsApp number after each payment.")}</p>}
      {!data.hasEmail && method !== "whatsapp" && <Notice tone="warn">{t("Add an e-mail address to your profile to receive invoices by e-mail.")}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <PrimaryButton busy={saving} onClick={save}>{t("Save")}</PrimaryButton>
    </Section>
  );
}
