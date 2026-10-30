import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, ChevronLeft, ChevronRight, X } from "lucide-react";
import { dmbExtraAdminAPI } from "@food/api";
import { formatPhone } from "@/shared/utils/phone";
import { Page, Card, Btn, Badge, Table, Field, ErrorBox, inputCls, useLoad, useAction, fmtDate, fmtDateTime, money } from "./ui";

/**
 * Today's Orders — every delivery of one day in one list: subscription meals, single paid meals, pre-orders and pantry
 * bags, with the customer, kitchen, driver and payment. Driver changes reuse the planner's move endpoint.
 */

const TYPES = [["", "All types"], ["subscription", "Subscription"], ["one_time_select", "Single meal"], ["pre_order", "Pre-order"], ["pantry", "Pantry"]];
const STATUSES = ["scheduled", "preparing", "ready", "hub_transit", "out_for_delivery", "delivered", "skipped", "failed"];
const STATUS_TONE = { scheduled: "gray", preparing: "amber", ready: "blue", hub_transit: "violet", out_for_delivery: "violet", delivered: "green", skipped: "gray", failed: "red" };
const statusLabel = (s) => String(s || "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const TYPE_TONE = { subscription: "blue", one_time_select: "green", pre_order: "violet", pantry: "amber" };

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const shiftDay = (dateStr, by) => {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};

function Overlay({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm border-b border-slate-50 last:border-0">
    <span className="text-slate-500">{label}</span>
    <span className="text-slate-900 font-medium text-right">{children || "—"}</span>
  </div>
);

function DetailsOverlay({ target, onClose }) {
  const { data, error } = useLoad(() => dmbExtraAdminAPI.orderDetail(target.kind, target.id), [target.kind, target.id]);
  const o = data?.order;
  const sub = data?.subscription;
  const p = o?.pricing || {};
  return (
    <Overlay title={`Order ${target.orderId}`} onClose={onClose}>
      <ErrorBox error={error} />
      {!o && !error && <p className="text-sm text-slate-400">Loading…</p>}
      {o && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge tone={TYPE_TONE[o.type || o.kind] || "gray"}>{o.typeLabel}</Badge>
            <Badge tone={STATUS_TONE[o.status] || "gray"}>{statusLabel(o.status)}</Badge>
            {o.crossZone && <Badge tone="violet">Hub transfer</Badge>}
            {o.gpsMismatch && <Badge tone="red">GPS mismatch</Badge>}
          </div>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Delivery</h3>
            <Row label="Date · slot">{fmtDate(o.date)} · {o.slot}</Row>
            <Row label="Customer">{o.customer.name}{o.customer.phone ? ` · ${formatPhone(o.customer.phone)}` : ""}</Row>
            <Row label="Address">{o.address}</Row>
            <Row label="Zone">{o.zone}</Row>
            <Row label="Kitchen">{o.vendor}</Row>
            <Row label="Driver">{o.driver ? `${o.driver.name}${o.driver.phone ? ` · ${formatPhone(o.driver.phone)}` : ""}` : "Not assigned"}</Row>
            {o.collectionPin && <Row label="Pickup PIN">{o.collectionPin}</Row>}
            {o.deliveryPin && <Row label="Delivery PIN">{o.deliveryPin}</Row>}
            {o.specialInstructions && <Row label="Customer note">{o.specialInstructions}</Row>}
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Items</h3>
            {o.items.map((i, idx) => <Row key={idx} label={`${i.name || "Item"}${i.quantity > 1 ? ` × ${i.quantity}` : ""}`}>{i.price != null ? money(i.price * i.quantity, o.currency) : i.note}</Row>)}
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Payment</h3>
            {p.foodCost != null && <Row label="Food">{money(p.foodCost, o.currency)}</Row>}
            {p.itemsTotal != null && <Row label="Items">{money(p.itemsTotal, o.currency)}</Row>}
            {p.foodVatAmount > 0 && <Row label="Food VAT">{money(p.foodVatAmount, o.currency)}</Row>}
            <Row label="Delivery">{money(p.deliveryFee, o.currency)}</Row>
            {p.deliveryVatAmount > 0 && <Row label="Delivery VAT">{money(p.deliveryVatAmount, o.currency)}</Row>}
            {p.platformFee > 0 && <Row label="Platform fee">{money(p.platformFee, o.currency)}</Row>}
            <Row label="Total"><strong>{money(p.totalPrice ?? p.total, o.currency)}</strong>{o.kind === "pantry" ? " (whole pantry order)" : ""}</Row>
            {o.paymentStatus && o.paymentStatus !== "not_required" && <Row label="Payment status">{o.paymentStatus}</Row>}
          </section>

          {sub && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Subscription</h3>
              <Row label="Plan">{sub.duration} · {sub.status}</Row>
              <Row label="Runs">{fmtDate(sub.startDate)} – {fmtDate(sub.endDate)}</Row>
              <Row label="Next delivery">{fmtDate(sub.nextDeliveryDate)}</Row>
              <Row label="Auto-renew">{sub.autoRenew ? "Yes" : "No"}</Row>
              {sub.total != null && <Row label="Subscription total">{money(sub.total, o.currency)}</Row>}
            </section>
          )}

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Timeline</h3>
            {o.timeline.map((t) => <Row key={t.label} label={t.label}>{t.at ? fmtDateTime(t.at) : ""}</Row>)}
            {o.failure && <Row label="Failed">{o.failure.reason}{o.failure.disposition ? ` (${o.failure.disposition.replace(/_/g, " ")})` : ""}</Row>}
            {o.rating && <Row label="Customer rating">{o.rating.overall ? `${o.rating.overall} / 5` : ""}{o.rating.feedback ? ` — ${o.rating.feedback}` : ""}</Row>}
          </section>
        </div>
      )}
    </Overlay>
  );
}

function AssignOverlay({ order, onClose, onDone }) {
  const { data, error } = useLoad(
    () => dmbExtraAdminAPI.assignmentCell({ zoneId: order.zoneId, date: order.date, slotKey: order.slotKey }),
    [order.id]
  );
  const { busy, run } = useAction();
  const [pick, setPick] = useState("");
  const drivers = data?.cell?.drivers;
  const save = () =>
    run("move", async () => {
      await dmbExtraAdminAPI.moveDelivery({ kind: order.kind, id: order.id, toDriverId: pick, zoneId: order.zoneId, date: order.date, slotKey: order.slotKey });
      onDone();
    }, "Driver updated");
  return (
    <Overlay title={`${order.driver ? "Reassign" : "Assign"} driver · ${order.orderId}`} onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">{order.customer.name} · {order.zone || "zone"} · {order.slot}. Only drivers who accepted this zone and slot are listed; a delivery already collected cannot be moved.</p>
      <ErrorBox error={error} />
      {!drivers && !error && <p className="text-sm text-slate-400">Loading drivers…</p>}
      {drivers && drivers.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No driver has accepted this zone and slot yet. Assign drivers to it first on <Link className="underline font-semibold" to="/admin/food/delivery-partners/assignments">Driver Assignments</Link>.
        </div>
      )}
      {drivers && drivers.length > 0 && (
        <div className="space-y-3">
          <Field label="Driver">
            <select className={inputCls} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose a driver…</option>
              {drivers.map((d) => (
                <option key={d._id} value={d._id} disabled={d._id === order.driver?.id}>
                  {d.name}{d._id === order.driver?.id ? " (current)" : ""} — {d.load ?? 0} deliveries
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Btn variant="outline" onClick={onClose}>Cancel</Btn>
            <Btn disabled={!pick} busy={busy === "move"} onClick={save}>Save</Btn>
          </div>
        </div>
      )}
    </Overlay>
  );
}

export function TodaysOrdersPage() {
  const [date, setDate] = useState(todayStr());
  const [type, setType] = useState("");
  const [slot, setSlot] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [details, setDetails] = useState(null);
  const [assigning, setAssigning] = useState(null);

  // Search runs on the server, but only once the admin pauses typing.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, error, loading, reload } = useLoad(() => dmbExtraAdminAPI.dayOrders({ date, type, slot, status, q }), [date, type, slot, status, q]);

  // Keep the day fresh while the page is open (the previous list stays on screen until the new one arrives).
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") reload(); }, 60000);
    return () => clearInterval(id);
  }, [reload]);

  const orders = data?.orders;
  const rows = useMemo(() => (orders ? orders.filter((o) => !onlyUnassigned || (!o.driver && !["delivered", "skipped", "failed"].includes(o.status))) : orders), [orders, onlyUnassigned]);
  const slots = useMemo(() => [...new Set((orders || []).map((o) => o.slot))].sort(), [orders]);
  const s = data?.summary;
  const isToday = date === todayStr();

  return (
    <Page
      title={isToday ? "Today's Orders" : `Orders · ${fmtDate(date)}`}
      subtitle="Every delivery of the day in one place: subscription meals, single paid meals, pre-orders and pantry bags. See who delivers what, change the driver, and open any order for its full details."
      actions={
        <>
          <Btn variant="outline" onClick={() => setDate(shiftDay(date, -1))} title="Previous day"><ChevronLeft className="w-4 h-4" /></Btn>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white" />
          <Btn variant="outline" onClick={() => setDate(shiftDay(date, 1))} title="Next day"><ChevronRight className="w-4 h-4" /></Btn>
          {!isToday && <Btn variant="outline" onClick={() => setDate(todayStr())}>Today</Btn>}
          <Btn variant="outline" busy={loading} onClick={reload} title="Refresh"><RefreshCw className="w-4 h-4" /></Btn>
        </>
      }
    >
      <ErrorBox error={error} />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Total", s?.total, "slate", () => { setType(""); setOnlyUnassigned(false); }],
          ["Subscription", s?.byType?.subscription, "blue", () => setType("subscription")],
          ["Single meal", s?.byType?.one_time_select, "green", () => setType("one_time_select")],
          ["Pantry", s?.byType?.pantry, "amber", () => setType("pantry")],
          ["No driver yet", s?.unassigned, "red", () => setOnlyUnassigned((v) => !v)],
        ].map(([label, n, tone, onClick]) => (
          <button key={label} type="button" onClick={onClick} className={`text-left rounded-2xl border bg-white px-4 py-3 shadow-sm hover:border-emerald-600 transition ${label === "No driver yet" && onlyUnassigned ? "border-emerald-600" : "border-slate-200"}`}>
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className={`text-2xl font-bold ${tone === "red" && n > 0 ? "text-red-600" : "text-slate-900"}`}>{n ?? "–"}</p>
          </button>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap gap-2 mb-4">
          <input className={`${inputCls} md:max-w-xs`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order, customer, kitchen or driver" aria-label="Search orders" />
          <select className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white" value={type} onChange={(e) => setType(e.target.value)} aria-label="Order type">
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white" value={slot} onChange={(e) => setSlot(e.target.value)} aria-label="Slot">
            <option value="">All slots</option>
            {slots.map((x) => <option key={x} value={x}>{x}</option>)}
            {slot && !slots.includes(slot) && <option value={slot}>{slot}</option>}
          </select>
          <select className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {STATUSES.map((x) => <option key={x} value={x}>{statusLabel(x)}</option>)}
          </select>
          {onlyUnassigned && <Btn variant="ghost" size="sm" onClick={() => setOnlyUnassigned(false)}>Showing: no driver yet ✕</Btn>}
        </div>

        <Table
          rows={rows}
          rowKey={(o) => `${o.kind}-${o.id}`}
          empty="No orders for this day."
          columns={[
            { label: "Order", className: "whitespace-nowrap", render: (o) => <div><p className="font-semibold text-slate-900">{o.orderId}</p><Badge tone={TYPE_TONE[o.type] || "gray"}>{o.typeLabel}</Badge></div> },
            { label: "Customer", render: (o) => <div><p>{o.customer.name}</p>{o.customer.phone && <p className="text-xs text-slate-500">{formatPhone(o.customer.phone)}</p>}</div> },
            { label: "Kitchen", render: (o) => <div><p>{o.vendor}</p>{o.zone && <p className="text-xs text-slate-500">{o.zone}</p>}</div> },
            { label: "Meal", render: (o) => <span className="text-slate-700">{o.items || "—"}</span> },
            { label: "Slot", key: "slot", className: "whitespace-nowrap" },
            { label: "Status", render: (o) => <Badge tone={STATUS_TONE[o.status] || "gray"}>{statusLabel(o.status)}</Badge> },
            { label: "Driver", render: (o) => (
              <div className="space-y-1">
                {o.driver ? <p className="font-medium">{o.driver.name}</p> : <Badge tone="amber">Not assigned</Badge>}
                {o.canReassign && <div><Btn size="sm" variant="outline" onClick={() => setAssigning(o)}>{o.driver ? "Reassign" : "Assign"}</Btn></div>}
              </div>
            ) },
            { label: "Payment", right: true, className: "whitespace-nowrap", render: (o) => (
              <div className="space-y-1">
                <p className="font-semibold">{money(o.amount, o.currency)}</p>
                {o.amountNote && <p className="text-[11px] text-slate-400">{o.amountNote}</p>}
                <Badge tone={o.payment.tone}>{o.payment.label}</Badge>
              </div>
            ) },
            { label: "", render: (o) => <Btn size="sm" variant="ghost" onClick={() => setDetails(o)}>Details</Btn> },
          ]}
        />
      </Card>

      {details && <DetailsOverlay target={details} onClose={() => setDetails(null)} />}
      {assigning && <AssignOverlay order={assigning} onClose={() => setAssigning(null)} onDone={() => { setAssigning(null); reload(); }} />}
    </Page>
  );
}

export default TodaysOrdersPage;
