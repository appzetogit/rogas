import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, ShieldCheck, ShieldAlert } from "lucide-react";
import { dmbExtraAdminAPI } from "@food/api";
import { Page, Card, Btn, Badge, Table, Field, ErrorBox, CitySelect, inputCls, useLoad, useAction, fmtDateTime, saveBlob } from "./ui";

/** Gap E — today's stock per meal across vendors (lowest first). */
export function StockPage() {
  const [cityId, setCityId] = useState("");
  const { data, error } = useLoad(() => dmbExtraAdminAPI.stock({ cityId: cityId || undefined }), [cityId]);
  return (
    <Page title="Live stock" subtitle="Portions left per meal today. Sold-out meals cannot be bought in Select mode; vendors get a low-stock alert." actions={<CitySelect value={cityId} onChange={setCityId} allLabel="All cities" />}>
      <ErrorBox error={error} />
      <Card title={data ? `Stock on ${data.date}` : "Stock"}>
        <Table
          rows={data?.meals}
          rowKey={(m) => m.mealPlanId}
          columns={[
            { label: "Meal", render: (m) => <div><p className="font-semibold">{m.name}</p><p className="text-xs text-slate-500">{m.vendorName}</p></div> },
            { label: "Available", key: "available", right: true },
            { label: "Ordered", key: "committed", right: true },
            { label: "Prepared", key: "prepared", right: true },
            { label: "Left", right: true, render: (m) => <b>{m.remaining}</b> },
            { label: "Status", render: (m) => <Badge tone={m.soldOut ? "red" : m.lowStock ? "amber" : "green"}>{m.soldOut ? "sold out" : m.lowStock ? "low" : "open"}</Badge> },
          ]}
          empty="No active meals."
        />
      </Card>
    </Page>
  );
}

/** Gap P — Pantry items returned by drivers, return rate per item and shop. */
export function PantryReturnsPage() {
  const [days, setDays] = useState(30);
  const { data, error } = useLoad(() => dmbExtraAdminAPI.pantryReturns({ days }), [days]);
  const { busy, run } = useAction();
  return (
    <Page
      title="Pantry returns"
      subtitle="Bags drivers could not deliver and brought back to the shop. A high return rate points to items or shops that need attention."
      actions={<><select value={days} onChange={(e) => setDays(Number(e.target.value))} className="border border-slate-300 rounded-xl px-3 py-2 text-sm">{[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select><Btn variant="outline" busy={busy === "csv"} onClick={() => run("csv", async () => saveBlob(await dmbExtraAdminAPI.pantryReturnsCsv({ days }), `pantry-returns-${days}d.csv`, "text/csv"))}><Download className="w-4 h-4" /> CSV</Btn></>}
    >
      <ErrorBox error={error} />
      <Card>
        <Table
          rows={data?.items}
          rowKey={(r) => `${r.itemName}|${r.shop}`}
          columns={[
            { label: "Item", key: "itemName" },
            { label: "Shop", key: "shop" },
            { label: "Delivered", key: "delivered", right: true },
            { label: "Returned", key: "returned", right: true },
            { label: "Return rate", right: true, render: (r) => <Badge tone={r.returnRate >= 10 ? "red" : r.returnRate >= 5 ? "amber" : "green"}>{r.returnRate}%</Badge> },
          ]}
          empty="No returns in this period."
        />
      </Card>
    </Page>
  );
}

/** Gaps AG / AK / AF / C / D — Select-mode conversion, rotation and plan mix. */
export function GrowthPage() {
  const [days, setDays] = useState(30);
  const { data, error } = useLoad(() => dmbExtraAdminAPI.growth({ days }), [days]);
  const stat = (label, value) => <Card><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold">{value}</p></Card>;
  return (
    <Page title="Growth" subtitle="Single-meal (Select) orders converting to subscriptions, and how many customers use rotation, family boxes, trials and annual plans." actions={<select value={days} onChange={(e) => setDays(Number(e.target.value))} className="border border-slate-300 rounded-xl px-3 py-2 text-sm">{[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select>}>
      <ErrorBox error={error} />
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stat("Select orders", data.select.orders)}
            {stat("Delivered", data.select.delivered)}
            {stat("Converted to subscription", data.select.converted)}
            {stat("Conversion rate", `${data.select.conversionRate}%`)}
            {stat("Active rotations", data.subscriptions.rotationActive)}
            {stat("Active family boxes", data.subscriptions.familyActive)}
            {stat("Customers in trial", data.subscriptions.trialsActive)}
            {stat("Annual plans", data.subscriptions.annualActive)}
          </div>
          <Card title="Subscribers per vendor" subtitle="Rotation subscribers count once for every maker in their rotation.">
            <Table
              rows={data.vendors}
              rowKey={(v) => v.vendorId}
              columns={[
                { label: "Vendor", render: (v) => <div><p className="font-semibold">{v.name}</p><p className="text-xs text-slate-500">{v.city}</p></div> },
                { label: "Dedicated", key: "dedicated", right: true },
                { label: "In rotations", key: "rotation", right: true },
                { label: "Total", key: "total", right: true },
              ]}
            />
          </Card>
        </>
      )}
    </Page>
  );
}

/** Gaps H, I, J — GA4 (via controls), Mailchimp sync and WhatsApp invoice delivery. */
export function IntegrationsPage() {
  const { data, error, reload } = useLoad(() => dmbExtraAdminAPI.integrations(), []);
  const { data: logs, reload: reloadLogs } = useLoad(() => dmbExtraAdminAPI.whatsAppLogs(), []);
  const { busy, run } = useAction();
  const whatsapp = data?.integrations?.find((i) => i.id === "whatsapp");
  const mailchimp = data?.integrations?.find((i) => i.id === "mailchimp");
  return (
    <Page title="Integrations" subtitle="Secrets are stored encrypted and never shown again. Values set in the server environment take precedence and cannot be changed here.">
      <ErrorBox error={error} />
      <Card title="Google Analytics 4" subtitle="Customer web app only, loaded after the customer accepts analytics cookies.">
        <p className="text-sm">
          Status: {data?.googleAnalytics?.enabled ? <Badge tone="green">on</Badge> : <Badge>off</Badge>} {data?.googleAnalytics?.measurementId && <span className="ml-2 font-mono text-xs">{data.googleAnalytics.measurementId}</span>}
        </p>
        <p className="text-xs text-slate-500 mt-2">Set the measurement ID and switch it on in <Link to="/admin/food/dmb/controls" className="text-emerald-700 underline">Admin controls → Integrations (ACM-154)</Link>. Events: page_view, checkout_began, slot_selected, subscription_started.</p>
      </Card>
      {mailchimp && (
        <IntegrationForm
          integration={mailchimp}
          onSave={(body) => run("mc", async () => { await dmbExtraAdminAPI.saveMailchimp(body); await reload(); }, "Mailchimp saved")}
          busy={busy === "mc"}
          extra={
            <div className="flex flex-wrap gap-2 items-center">
              <Btn size="sm" variant="outline" busy={busy === "mct"} onClick={() => run("mct", () => dmbExtraAdminAPI.testMailchimp(), "Mailchimp connection OK")}>Test connection</Btn>
              <Btn size="sm" variant="outline" busy={busy === "mcs"} onClick={() => run("mcs", async () => { await dmbExtraAdminAPI.syncMailchimp(); await reload(); }, "Sync finished")}>Sync now</Btn>
              {data?.mailchimp && <span className="text-xs text-slate-500">Last sync {fmtDateTime(data.mailchimp.lastSuccessAt || data.mailchimp.lastRunAt)}{data.mailchimp.lastResult ? ` · ${JSON.stringify(data.mailchimp.lastResult)}` : ""}</span>}
            </div>
          }
          note="Only customers who opted in to marketing e-mails are synced (tags: active, churned, trial, b2b and segments). Withdrawn consent unsubscribes them. Runs daily at 04:00 when ACM-155 is on."
        />
      )}
      {whatsapp && (
        <IntegrationForm
          integration={whatsapp}
          onSave={(body) => run("wa", async () => { await dmbExtraAdminAPI.saveWhatsApp(body); await reload(); }, "WhatsApp saved")}
          busy={busy === "wa"}
          extra={<WhatsAppTest onSent={reloadLogs} />}
          note="Customers who choose WhatsApp (ACM-156) get their PDF invoice after each payment. Twilio needs an approved template (Content SID); 360dialog a template name and language."
        />
      )}
      <Card title="WhatsApp delivery log">
        <Table
          rows={logs?.logs}
          columns={[
            { label: "When", render: (l) => fmtDateTime(l.createdAt) },
            { label: "To", render: (l) => <span className="font-mono text-xs">{l.to}</span> },
            { label: "Provider", key: "provider" },
            { label: "Status", render: (l) => <Badge tone={l.status === "sent" ? "green" : l.status === "failed" ? "red" : "amber"}>{l.status}{l.attempts > 1 ? ` (${l.attempts} tries)` : ""}</Badge> },
            { label: "Error", render: (l) => <span className="text-xs text-red-600">{l.lastError || ""}</span> },
          ]}
          empty="No messages yet."
        />
      </Card>
    </Page>
  );
}

function IntegrationForm({ integration, onSave, busy, extra, note }) {
  const [form, setForm] = useState({});
  useEffect(() => setForm({}), [integration]);
  const entries = Object.entries(integration.fields);
  return (
    <Card title={integration.label} subtitle={`Status: ${integration.status}${integration.lastCheckedAt ? ` · checked ${fmtDateTime(integration.lastCheckedAt)}` : ""}`}>
      {note && <p className="text-xs text-slate-500 mb-3">{note}</p>}
      <div className="grid md:grid-cols-2 gap-3">
        {entries.map(([name, f]) => (
          <Field key={name} label={name} hint={f.source === "env" ? `Set in server environment (${f.env})` : f.type === "secret" && f.set ? `Saved: ${f.masked}` : f.env ? `Env: ${f.env}` : ""}>
            {f.type === "enum" ? (
              <select className={inputCls} disabled={f.source === "env"} value={form[name] ?? f.value ?? ""} onChange={(e) => setForm({ ...form, [name]: e.target.value })}>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input className={inputCls} type={f.type === "secret" ? "password" : "text"} autoComplete="off" disabled={f.source === "env"} placeholder={f.type === "secret" && f.set ? "•••••• (leave empty to keep)" : ""} value={form[name] ?? (f.type === "secret" ? "" : f.value ?? "")} onChange={(e) => setForm({ ...form, [name]: e.target.value })} />
            )}
          </Field>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
        {extra}
        <Btn busy={busy} disabled={!Object.keys(form).length} onClick={() => onSave(form)}>Save</Btn>
      </div>
    </Card>
  );
}

function WhatsAppTest({ onSent }) {
  const [to, setTo] = useState("");
  const { busy, run } = useAction();
  return (
    <div className="flex gap-2 items-center">
      <input className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs w-40" placeholder="+48600123456" value={to} onChange={(e) => setTo(e.target.value)} />
      <Btn size="sm" variant="outline" busy={busy === "t"} disabled={!to} onClick={() => run("t", async () => { await dmbExtraAdminAPI.testWhatsApp(to); onSent?.(); }, "Test message sent")}>Send test</Btn>
    </div>
  );
}

/** Gap N — what the running deployment does for encryption (GDPR Art. 32). */
export function SecurityPage() {
  const { data, error, reload } = useLoad(() => dmbExtraAdminAPI.securityStatus(), []);
  const Row = ({ okv, label, detail }) => (
    <div className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
      {okv ? <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" /> : <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />}
      <div><p className="text-sm font-semibold">{label}</p>{detail && <p className="text-xs text-slate-500">{detail}</p>}</div>
    </div>
  );
  return (
    <Page title="Security & encryption" subtitle="Live check of the GDPR Art. 32 measures described in the Security Architecture document." actions={<Btn variant="outline" onClick={reload}>Refresh</Btn>}>
      <ErrorBox error={error} />
      {data && (
        <>
          <Card title="In transit">
            <Row okv={data.inTransit.httpsRedirect} label="HTTP → HTTPS redirect" detail={data.inTransit.note} />
            <Row okv={data.inTransit.hsts} label="HSTS header" detail="max-age 1 year, includeSubDomains, preload (production)" />
            <Row okv={data.inTransit.apiPublicUrlHttps !== false} label="Public API URL uses https" detail={data.inTransit.apiPublicUrlHttps === null ? "API_PUBLIC_URL not set" : ""} />
            <Row okv={data.inTransit.httpsRedirect} label="WebSockets" detail={data.inTransit.websocket} />
          </Card>
          <Card title="At rest">
            <Row okv={data.atRest.mongoTls} label="Database connection over TLS" />
            <Row okv={data.atRest.atlas} label="MongoDB Atlas (AES-256 encryption at rest)" detail={data.atRest.note} />
          </Card>
          <Card title="Field-level encryption" subtitle={`${data.fieldLevel.key.algorithm} · key: ${data.fieldLevel.key.source}${data.fieldLevel.key.previousKeyConfigured ? " · previous key kept for rotation" : ""}`}>
            <Row okv={data.fieldLevel.key.primaryKeyConfigured} label="PII_ENCRYPTION_KEY configured" detail={data.fieldLevel.key.primaryKeyConfigured ? "" : "Set a 32-byte key in production — the derived development key must not be used."} />
            <Table
              rows={data.fieldLevel.coverage.flatMap((c) => c.fields.map((f) => ({ ...f, label: c.label })))}
              rowKey={(r) => `${r.label}|${r.path}`}
              columns={[
                { label: "Data", key: "label" },
                { label: "Field", render: (r) => <span className="font-mono text-xs">{r.path}</span> },
                { label: "Encrypted", key: "encrypted", right: true },
                { label: "Plaintext", right: true, render: (r) => <Badge tone={r.plaintext ? "red" : "green"}>{r.plaintext}</Badge> },
              ]}
            />
          </Card>
          <Card title="Documents"><Row okv label="Invoice links" detail={data.documents.invoiceLinks} /><Row okv={false} label="Driver documents" detail={data.documents.note} /></Card>
        </>
      )}
    </Page>
  );
}
