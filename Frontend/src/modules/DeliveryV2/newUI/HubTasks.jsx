import { useState, useEffect, useCallback } from "react";
import { Boxes, MapPin, Phone, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { dmbExtraDriverAPI } from "@food/api";

const itemsText = (items) => (items || []).map((i) => `${i.quantity}× ${i.description}`).join(", ");

/** DA: hub hand-overs - items to drop at a hub (PIN 1) and items to collect from one (PIN 2). Shown only when there are any. */
const HubTasks = () => {
  const { t } = useTranslation("driver");
  const [tasks, setTasks] = useState([]);
  const [pins, setPins] = useState({});
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    dmbExtraDriverAPI.hubTasks().then((res) => setTasks(res?.data?.tasks || [])).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const submit = async (task) => {
    const pin = String(pins[task.transferId] || "").trim();
    if (!/^\d{4}$/.test(pin)) { toast.error(t("Enter the 4-digit PIN")); return; }
    setBusy(task.transferId);
    try {
      if (task.type === "hub_dropoff") await dmbExtraDriverAPI.hubDrop(task.transferId, pin);
      else await dmbExtraDriverAPI.hubPickup(task.transferId, pin);
      toast.success(task.type === "hub_dropoff" ? t("Item handed over to the hub") : t("Item collected from the hub"));
      setPins((p) => ({ ...p, [task.transferId]: "" }));
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || t("Could not confirm the hand-over"));
      load();
    } finally {
      setBusy("");
    }
  };

  if (!tasks.length) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-[#3e4945] flex items-center gap-1.5 px-1">
        <Boxes className="w-3.5 h-3.5" /> {t("Hub hand-overs")}
      </h3>
      {tasks.map((task) => {
        const drop = task.type === "hub_dropoff";
        const ready = drop ? task.collected : task.atHub;
        return (
          <div key={`${task.type}-${task.transferId}`} className="bg-white p-4 rounded-xl border border-[#e0e3e0] shadow-sm space-y-2">
            <div className="flex justify-between items-start gap-2">
              <h4 className="font-bold text-gray-900 text-sm">{drop ? t("Drop at {{hub}}", { hub: task.hub.name }) : t("Collect at {{hub}}", { hub: task.hub.name })}</h4>
              <span className="text-[11px] font-semibold text-[#3e4945] shrink-0">{task.slotKey}</span>
            </div>
            <p className="text-xs text-[#3e4945]">{itemsText(task.items)}</p>
            {task.hub.address && <p className="text-xs text-[#3e4945] flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 shrink-0" />{task.hub.address}</p>}
            {task.hub.phone && <p className="text-xs text-[#3e4945] flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 shrink-0" />{task.hub.phone}</p>}
            {!ready ? (
              <p className="text-xs font-semibold text-amber-700">{drop ? t("Collect the item at the vendor first") : t("Waiting for the item to arrive at the hub")}</p>
            ) : task.locked ? (
              <p className="text-xs font-bold text-red-600">{t("PIN locked. Ask the hub to have a new PIN generated.")}</p>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  inputMode="numeric" maxLength={4} aria-label={t("PIN")}
                  value={pins[task.transferId] || ""} onChange={(e) => setPins((p) => ({ ...p, [task.transferId]: e.target.value.replace(/\D/g, "") }))}
                  placeholder={drop ? t("PIN shown at the hub") : t("PIN from the hub")}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold tracking-widest"
                />
                <button type="button" disabled={busy === task.transferId} onClick={() => submit(task)} className="bg-[#1F7A63] text-white text-xs font-bold px-4 py-2.5 rounded-lg disabled:opacity-60">
                  {busy === task.transferId ? <Loader2 className="w-4 h-4 animate-spin" /> : (drop ? t("Hand over") : t("Collect"))}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export { HubTasks };
