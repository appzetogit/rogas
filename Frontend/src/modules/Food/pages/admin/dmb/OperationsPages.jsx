import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, Play, Download } from "lucide-react";
import { dmbExtraAdminAPI } from "@food/api";
import { Page, Card, Btn, Badge, Table, Field, ErrorBox, CitySelect, inputCls, useLoad, useAction, fmtDate, fmtDateTime, money } from "./ui";

const SEVERITY = { critical: "red", warning: "amber", info: "blue" };

/** Alerts raised by the platform (driver no-shows, failed deliveries, thresholds, escalations…). */
export function AlertsPage() {
  const [status, setStatus] = useState("open");
  const { data, error, reload } = useLoad(() => dmbExtraAdminAPI.alerts({ status, limit: 200 }), [status]);
  const { busy, run } = useAction();
  const set = (a, next) => run(a._id, async () => { await dmbExtraAdminAPI.updateAlert(a._id, next); await reload(); });
  return (
    <Page title="Alerts" subtitle="Things that need an admin: unconfirmed driver shifts, no-shows, failed deliveries, home-cook thresholds, bad-debt escalations and more.">
      <ErrorBox error={error} />
      <div className="flex gap-2">
        {["open", "acknowledged", "resolved", "all"].map((s) => <Btn key={s} size="sm" variant={status === s ? "primary" : "outline"} onClick={() => setStatus(s)}>{s}</Btn>)}
        {data && <Badge tone="red">{data.openCount} open</Badge>}
      </div>
      <Card>
        <Table
          rows={data?.alerts}
          columns={[
            { label: "When", render: (a) => <span className="whitespace-nowrap text-slate-500">{fmtDateTime(a.createdAt)}</span> },
            { label: "Severity", render: (a) => <Badge tone={SEVERITY[a.severity]}>{a.severity}</Badge> },
            { label: "Alert", render: (a) => (<div><p className="font-semibold text-slate-800">{a.title}</p><p className="text-xs text-slate-500">{a.message}</p>{a.link && <Link to={a.link} className="text-xs text-emerald-700 underline">Open</Link>}</div>) },
            { label: "Status", render: (a) => <Badge tone={a.status === "open" ? "amber" : a.status === "resolved" ? "green" : "gray"}>{a.status}</Badge> },
            { label: "", right: true, render: (a) => (
              <div className="flex gap-1 justify-end">
                {a.status === "open" && <Btn size="sm" variant="outline" busy={busy === a._id} onClick={() => set(a, "acknowledged")}>Acknowledge</Btn>}
                {a.status !== "resolved" && <Btn size="sm" busy={busy === a._id} onClick={() => set(a, "resolved")}><CheckCircle className="w-3.5 h-3.5" /> Resolve</Btn>}
              </div>
            ) },
          ]}
          empty="No alerts."
        />
      </Card>
    </Page>
  );
}

/** Scheduled jobs (cluster-safe runner) and their last runs. */
export function JobsPage() {
  const { data, error, reload } = useLoad(() => dmbExtraAdminAPI.jobs(), []);
  const { busy, run } = useAction();
  const last = (name) => (data?.runs || []).find((r) => r.name === name);
  return (
    <Page title="Scheduled jobs" subtitle="Background tasks the platform runs on a schedule (Europe/Warsaw time). Each run happens once even with several servers. Super Admins can run a job now.">
      <ErrorBox error={error} />
      <Card>
        <Table
          rows={data?.jobs}
          rowKey={(j) => j.name}
          columns={[
            { label: "Job", render: (j) => <div><p className="font-semibold">{j.name}</p><p className="text-xs text-slate-500">{j.description}</p></div> },
            { label: "Last run", render: (j) => { const r = last(j.name); return r ? <span className="text-slate-600">{fmtDateTime(r.finishedAt || r.startedAt || r.createdAt)}</span> : "—"; } },
            { label: "Result", render: (j) => { const r = last(j.name); if (!r) return "—"; return <div><Badge tone={r.status === "done" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Badge>{r.error && <p className="text-xs text-red-600 mt-1 max-w-sm truncate" title={r.error}>{r.error}</p>}</div>; } },
            { label: "", right: true, render: (j) => <Btn size="sm" variant="outline" busy={busy === j.name} onClick={() => run(j.name, async () => { await dmbExtraAdminAPI.runJob(j.name); await reload(); }, `${j.name} finished`)}><Play className="w-3.5 h-3.5" /> Run now</Btn> },
          ]}
        />
      </Card>
    </Page>
  );
}

/** Gap G — business holidays: Polish public holidays auto-import (ACM-153), manual closures, confirm → apply. */
export function HolidaysPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, error, reload } = useLoad(() => dmbExtraAdminAPI.holidays({ year }), [year]);
  const { busy, run } = useAction();
  const [form, setForm] = useState({ date: "", name: "", scope: "all", cityId: "", icon: "🎄" });

  const create = () => run("create", async () => {
    await dmbExtraAdminAPI.createHoliday({ ...form, cityId: form.scope === "city" ? form.cityId : null });
    setForm({ date: "", name: "", scope: "all", cityId: "", icon: "🎄" });
    await reload();
  }, "Holiday added — confirm it to apply");

  return (
    <Page
      title="Business holidays"
      subtitle="Confirmed holidays: no deliveries that day, subscriptions are extended by the missed day, drivers' shifts are cancelled, and customers, vendors and drivers are notified 7 and 3 days ahead."
      actions={
        <>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-slate-300 rounded-xl px-3 py-2 text-sm">
            {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <Btn variant="outline" busy={busy === "import"} onClick={() => run("import", async () => { const res = await dmbExtraAdminAPI.importPolishHolidays(year); await reload(); return res; }, `Polish holidays for ${year} imported for review`)}>Import Polish holidays {year}</Btn>
        </>
      }
    >
      <ErrorBox error={error} />
      <Card title="Add a closure">
        <div className="grid md:grid-cols-5 gap-3 items-end">
          <Field label="Date"><input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Company day off" /></Field>
          <Field label="Scope">
            <select className={inputCls} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
              <option value="all">All cities</option>
              <option value="city">One city</option>
            </select>
          </Field>
          {form.scope === "city" ? <Field label="City"><CitySelect value={form.cityId} onChange={(v) => setForm({ ...form, cityId: v })} allLabel="Choose city" /></Field> : <Field label="Icon"><input className={inputCls} value={form.icon} maxLength={4} onChange={(e) => setForm({ ...form, icon: e.target.value })} /></Field>}
          <Btn busy={busy === "create"} disabled={!form.date || !form.name.trim() || (form.scope === "city" && !form.cityId)} onClick={create}>Add</Btn>
        </div>
      </Card>
      <Card title={`Holidays ${year}`}>
        <Table
          rows={data?.holidays}
          columns={[
            { label: "Date", render: (h) => <span className="font-semibold whitespace-nowrap">{fmtDate(h.date, { weekday: "short", day: "numeric", month: "short" })}</span> },
            { label: "Holiday", render: (h) => <span>{h.icon} {h.name} {h.autoImported && <Badge tone="blue">imported</Badge>}</span> },
            { label: "Scope", render: (h) => (h.scope === "city" ? h.cityId?.name || "City" : "All cities") },
            { label: "Status", render: (h) => <Badge tone={h.status === "confirmed" ? "green" : h.status === "rejected" ? "gray" : "amber"}>{h.status}</Badge> },
            { label: "Applied", render: (h) => (h.appliedAt ? `${h.affectedSubscriptions} subscriptions extended` : "—") },
            { label: "", right: true, render: (h) => (
              <div className="flex gap-1 justify-end">
                {h.status === "pending" && <Btn size="sm" busy={busy === `c${h._id}`} onClick={() => window.confirm(`Confirm ${h.name}? Deliveries on that day will be cancelled and subscriptions extended.`) && run(`c${h._id}`, async () => { await dmbExtraAdminAPI.confirmHoliday(h._id); await reload(); }, "Holiday confirmed and applied")}>Confirm</Btn>}
                {h.status === "pending" && <Btn size="sm" variant="outline" busy={busy === `r${h._id}`} onClick={() => run(`r${h._id}`, async () => { await dmbExtraAdminAPI.rejectHoliday(h._id); await reload(); }, "Holiday rejected")}>Reject</Btn>}
                {h.status !== "confirmed" && <Btn size="sm" variant="ghost" busy={busy === `d${h._id}`} onClick={() => run(`d${h._id}`, async () => { await dmbExtraAdminAPI.deleteHoliday(h._id); await reload(); }, "Deleted")}>Delete</Btn>}
              </div>
            ) },
          ]}
          empty="No holidays for this year yet. Import the Polish public holidays or add a closure."
        />
      </Card>
    </Page>
  );
}

/** Gap K — delivery fee per zone (ACM-157); zones without an override use the platform fee. */
export function ZoneFeesPage() {
  const { data, error, reload } = useLoad(() => dmbExtraAdminAPI.zoneFees(), []);
  const { busy, run } = useAction();
  const [edit, setEdit] = useState({});
  return (
    <Page title="Zone delivery pricing" subtitle="Charge a different delivery fee per zone. Applied to new quotes and subscriptions when ACM-157 (zone delivery pricing) is on; existing subscriptions keep the price they were sold at.">
      <ErrorBox error={error} />
      <Card title="Fees per zone" subtitle={data ? `Platform fee per order: ${money(data.platformFee?.fee ?? data.platformFee)}` : ""}>
        <Table
          rows={data?.zones}
          columns={[
            { label: "Zone", render: (z) => <span className="font-semibold">{z.name || z.zoneName}</span> },
            { label: "Current", render: (z) => (z.override?.isActive ? <Badge tone="violet">{money(z.override.feePerOrder)} per order</Badge> : <Badge>platform fee</Badge>) },
            { label: "New fee (PLN)", render: (z) => <input type="number" min={0} step={0.01} className={`${inputCls} max-w-[140px]`} value={edit[z._id] ?? (z.override?.feePerOrder ?? "")} onChange={(e) => setEdit({ ...edit, [z._id]: e.target.value })} /> },
            { label: "", right: true, render: (z) => (
              <div className="flex gap-1 justify-end">
                <Btn size="sm" busy={busy === `s${z._id}`} disabled={edit[z._id] === undefined || edit[z._id] === ""} onClick={() => run(`s${z._id}`, async () => { await dmbExtraAdminAPI.setZoneFee(z._id, { feePerOrder: Number(edit[z._id]), isActive: true }); setEdit({ ...edit, [z._id]: undefined }); await reload(); }, "Zone fee saved")}>Save</Btn>
                {z.override && <Btn size="sm" variant="ghost" busy={busy === `r${z._id}`} onClick={() => run(`r${z._id}`, async () => { await dmbExtraAdminAPI.removeZoneFee(z._id); await reload(); }, "Back to platform fee")}>Remove</Btn>}
              </div>
            ) },
          ]}
        />
      </Card>
    </Page>
  );
}

/** Gap U — addresses customers tried outside every zone, grouped into hotspots (where to expand next). */
export function ExpansionDemandPage() {
  const [days, setDays] = useState(90);
  const { data, error } = useLoad(() => dmbExtraAdminAPI.expansionDemand({ days }), [days]);
  const csv = () => {
    const rows = [["lat", "lng", "attempts", "unique_customers", "city", "nearest_zone", "distance_km"], ...(data?.hotspots || []).map((h) => [h.lat, h.lng, h.attempts, h.uniqueCustomers, h.topCity, h.nearestZone, h.distanceKm])];
    const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `expansion-demand-${days}d.csv`;
    a.click();
  };
  return (
    <Page title="Expansion demand" subtitle="Addresses attempted outside all delivery zones (onboarding GPS, saved addresses, checkout). Hotspots are grouped on a ~1 km grid." actions={<><select value={days} onChange={(e) => setDays(Number(e.target.value))} className="border border-slate-300 rounded-xl px-3 py-2 text-sm">{[30, 90, 180, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select><Btn variant="outline" onClick={csv} disabled={!data?.hotspots?.length}><Download className="w-4 h-4" /> CSV</Btn></>}>
      <ErrorBox error={error} />
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><p className="text-xs text-slate-500">Attempts</p><p className="text-2xl font-bold">{data.total}</p></Card>
          {Object.entries(data.bySource || {}).map(([k, v]) => <Card key={k}><p className="text-xs text-slate-500">{k.replace(/_/g, " ")}</p><p className="text-2xl font-bold">{v}</p></Card>)}
        </div>
      )}
      <Card title="Hotspots">
        <Table
          rows={data?.hotspots}
          rowKey={(h) => `${h.lat}|${h.lng}`}
          columns={[
            { label: "Location", render: (h) => <a className="text-emerald-700 underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${h.lat},${h.lng}`}>{h.lat}, {h.lng}</a> },
            { label: "City typed", key: "topCity" },
            { label: "Attempts", key: "attempts", right: true },
            { label: "Customers", key: "uniqueCustomers", right: true },
            { label: "Nearest zone", render: (h) => (h.nearestZone ? `${h.nearestZone} (${Number(h.distanceKm || 0).toFixed(1)} km)` : "—") },
          ]}
          empty="No attempts outside the zones in this period."
        />
      </Card>
    </Page>
  );
}
