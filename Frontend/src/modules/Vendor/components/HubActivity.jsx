import { useState, useEffect, useCallback } from "react";
import { Boxes, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Lock, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { dmbExtraVendorAPI } from "../../../services/api";

/** The vendor's own hub board, or null when this vendor is not a hub. Refreshes by itself. */
const useHub = () => {
  const [state, setState] = useState(null);
  const load = useCallback(() => {
    dmbExtraVendorAPI.hub().then((res) => setState(res?.data || { isHub: false })).catch(() => setState((s) => s || { isHub: false }));
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [load]);
  return { state, reload: load };
};

/** VM-HUB-01: a card on the vendor home that opens the Hub Activity screen. Shown only to hub vendors. */
const HubEntry = ({ onOpen }) => {
  const { t } = useTranslation("vendor");
  const { state } = useHub();
  if (!state?.isHub) return null;
  const waiting = (state.board?.incoming?.length || 0) + (state.board?.holding?.length || 0);
  return (
    <button type="button" onClick={onOpen} className="w-full flex items-center justify-between gap-3 bg-white border border-outline-variant/20 rounded-2xl px-4 py-3 shadow-sm text-left">
      <span className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Boxes size={20} /></span>
        <span>
          <span className="block font-bold text-sm text-on-surface">{t("Hub Activity")}</span>
          <span className="block text-xs text-on-surface-variant">{t("{{count}} item(s) to hand over", { count: waiting })}</span>
        </span>
      </span>
      {waiting > 0 && <span className="min-w-6 h-6 px-2 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">{waiting}</span>}
    </button>
  );
};

const itemsText = (items) => (items || []).map((i) => `${i.quantity}× ${i.description}`).join(", ");

function PinBox({ label, pin, locked, expires }) {
  const { t } = useTranslation("vendor");
  return (
    <div className="mt-2 rounded-xl bg-primary/5 border border-primary/20 px-3 py-2 flex items-center justify-between gap-3">
      <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{label}</span>
      {locked
        ? <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600"><Lock size={13} /> {t("PIN locked - ask admin for a new one")}</span>
        : <span className="text-2xl font-black tracking-[0.3em] text-primary" aria-label={label}>{pin}</span>}
      {!locked && expires && <span className="text-[10px] text-on-surface-variant flex items-center gap-1"><Clock size={11} />{new Date(expires).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
    </div>
  );
}

function Section({ icon: Icon, title, count, empty, children }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-on-surface-variant px-1"><Icon size={14} /> {title} <span className="text-primary">{count}</span></h3>
      {count === 0 ? <div className="bg-white rounded-2xl border border-dashed border-outline-variant/40 p-5 text-center text-sm text-on-surface-variant">{empty}</div> : children}
    </section>
  );
}

const HubActivity = () => {
  const { t } = useTranslation("vendor");
  const { state } = useHub();
  if (state === null) return <div className="p-8 text-center text-on-surface-variant">{t("Loading...")}</div>;
  if (!state.isHub) return <div className="p-8 text-center text-on-surface-variant">{t("This kitchen is not a hub.")}</div>;
  const { incoming, holding, expected, completedToday } = state.board;

  return (
    <div className="px-4 md:px-8 py-4 max-w-3xl w-full space-y-6">
      <div>
        <h1 className="text-xl font-black text-on-surface">{t("Hub Activity")}</h1>
        <p className="text-xs text-on-surface-variant">{t("{{count}} item(s) handled today", { count: completedToday })}</p>
      </div>

      <Section icon={ArrowDownToLine} title={t("Incoming")} count={incoming.length} empty={t("Nothing incoming")}>
        {incoming.map((x) => (
          <div key={String(x.transferId)} className="bg-white rounded-2xl border border-outline-variant/20 p-4 shadow-sm">
            <p className="font-bold text-sm text-on-surface">{itemsText(x.items)}</p>
            <p className="text-xs text-on-surface-variant">{t("From {{vendor}}", { vendor: x.from })}{x.sourceDriver?.name ? ` · ${t("Driver on the way: {{name}}", { name: x.sourceDriver.name })}` : ""}</p>
            <PinBox label={t("Drop-off PIN")} pin={x.dropPin} locked={x.locked} expires={x.pinExpiresAt} />
            <p className="mt-2 text-[11px] text-on-surface-variant">{t("The driver enters this PIN when handing over the item.")}</p>
          </div>
        ))}
      </Section>

      <Section icon={ArrowUpFromLine} title={t("Holding")} count={holding.length} empty={t("Nothing waiting at the hub")}>
        {holding.map((x) => (
          <div key={String(x.transferId)} className="bg-white rounded-2xl border border-outline-variant/20 p-4 shadow-sm">
            <p className="font-bold text-sm text-on-surface">{itemsText(x.items)}</p>
            <p className="text-xs text-on-surface-variant">{x.zoneDriver?.name ? t("Zone driver: {{name}}", { name: x.zoneDriver.name }) : t("Waiting for a zone driver")}</p>
            <PinBox label={t("Pickup PIN")} pin={x.pickupPin} locked={x.locked} expires={x.pinExpiresAt} />
            <p className="mt-2 text-[11px] text-on-surface-variant">{t("Give this PIN to the zone driver when they arrive.")}</p>
          </div>
        ))}
      </Section>

      {expected.length > 0 && (
        <Section icon={CheckCircle2} title={t("Expected later")} count={expected.length} empty="">
          {expected.map((x) => (
            <div key={String(x.transferId)} className="bg-white/70 rounded-2xl border border-outline-variant/20 p-3 text-sm text-on-surface-variant">
              {itemsText(x.items)} · {t("From {{vendor}}", { vendor: x.from })}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
};

export { HubEntry };
export default HubActivity;
