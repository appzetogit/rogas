import { useState } from "react";
import { Download, Check, X } from "lucide-react";
import { dmbExtraAdminAPI, adminAPI } from "@food/api";
import { Page, Card, Btn, Badge, Table, ErrorBox, inputCls, useLoad, useAction, fmtDate, fmtDateTime, money, saveBlob } from "./ui";

const DOT = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500" };
const Dot = ({ s, label }) => (s ? <span className="inline-flex items-center gap-1 text-xs text-slate-600 mr-2"><span className={`w-2 h-2 rounded-full ${DOT[s] || "bg-slate-300"}`} />{label}</span> : null);

/** Gap AA — home cooks, two tracks, documents and the monthly legal threshold (ACM-161…165). */
export function HomeCooksPage() {
  const [track, setTrack] = useState("");
  const { data, error, reload } = useLoad(() => dmbExtraAdminAPI.homeCooks(track ? { track } : {}), [track]);
  const { busy, run } = useAction();
  const [photos, setPhotos] = useState(null);
  const limit = Number(data?.threshold?.legalLimit) || 3499.5;
  return (
    <Page title="Home cooks" subtitle={`Track 1 (unregistered activity, monthly limit ${money(limit)}) and Track 2 (registered business / Kitchen Partner). Approve kitchen photos, watch the threshold and send the upgrade notice.`}>
      <ErrorBox error={error} />
      <div className="flex gap-2">
        {[["", "All"], ["1", "Track 1"], ["2", "Track 2"], ["none", "Not chosen"]].map(([k, l]) => <Btn key={k} size="sm" variant={track === k ? "primary" : "outline"} onClick={() => setTrack(k)}>{l}</Btn>)}
      </div>
      <Card>
        <Table
          rows={data?.cooks}
          columns={[
            { label: "Cook", render: (c) => <div><p className="font-semibold">{c.restaurantName}</p><p className="text-xs text-slate-500">{c.ownerName} · {c.status}</p></div> },
            { label: "Track", render: (c) => (c.cookTrack ? <Badge tone={c.cookTrack === 1 ? "amber" : "green"}>Track {c.cookTrack}</Badge> : <Badge>—</Badge>) },
            { label: "This month", render: (c) => (c.cookTrack === 1 ? <div><p className="font-semibold">{money(c.monthGross)}</p><div className="w-28 h-1.5 bg-slate-100 rounded-full mt-1"><div className={`h-full rounded-full ${c.thresholdPct >= 100 ? "bg-red-500" : c.thresholdPct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, c.thresholdPct || 0)}%` }} /></div><p className="text-[11px] text-slate-500">{c.thresholdPct}%</p></div> : "—") },
            { label: "Documents", render: (c) => (c.documents ? <div><Dot s={c.documents.kitchenPhotos} label={`Kitchen (${c.kitchenPhotoCount})`} /><Dot s={c.documents.sanepid} label="Sanepid" />{c.documents.cookAgreement && <Dot s={c.documents.cookAgreement} label="Agreement" />}{c.track1Paused && <Badge tone="red">paused</Badge>}{c.sanepidDeadline && !c.sanepidDocUrl && <p className="text-[11px] text-slate-500">Sanepid due {fmtDate(c.sanepidDeadline)}</p>}</div> : "—") },
            { label: "", right: true, render: (c) => (
              <div className="flex flex-wrap gap-1 justify-end">
                {c.kitchenPhotoCount > 0 && <Btn size="sm" variant="outline" onClick={() => setPhotos(c)}>Kitchen photos{c.kitchenPhotoReview?.status === "pending" ? " (review)" : ""}</Btn>}
                {c.sanepidDocUrl && <a href={c.sanepidDocUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-700 underline self-center">Sanepid doc</a>}
                {c.cookTrack === 1 && <Btn size="sm" variant="ghost" busy={busy === `u${c._id}`} onClick={() => run(`u${c._id}`, async () => { await dmbExtraAdminAPI.sendUpgradeNotice(c._id); await reload(); }, "Upgrade notice sent")}>{c.trackUpgradeNotice?.sentAt ? "Re-send upgrade notice" : "Send upgrade notice"}</Btn>}
              </div>
            ) },
          ]}
          empty="No home cooks."
        />
      </Card>
      {photos && (
        <Card title={`Kitchen photos · ${photos.restaurantName}`} actions={<Btn size="sm" variant="ghost" onClick={() => setPhotos(null)}>Close</Btn>}>
          <div className="flex flex-wrap gap-3 mb-4">
            {photos.kitchenPhotoUrls.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="" className="w-48 h-36 object-cover rounded-xl border" /></a>)}
          </div>
          <div className="flex gap-2">
            <Btn busy={busy === "approve"} onClick={() => run("approve", async () => { await dmbExtraAdminAPI.reviewKitchen(photos._id, { approve: true }); setPhotos(null); await reload(); }, "Kitchen approved")}><Check className="w-4 h-4" /> Approve</Btn>
            <Btn variant="danger" busy={busy === "reject"} onClick={() => { const reason = window.prompt("Reason for rejection (sent to the cook)"); if (reason) run("reject", async () => { await dmbExtraAdminAPI.reviewKitchen(photos._id, { approve: false, reason }); setPhotos(null); await reload(); }, "Rejected"); }}><X className="w-4 h-4" /> Reject</Btn>
          </div>
        </Card>
      )}
    </Page>
  );
}

/** Gap AB — monthly settlement statements (cooks and fleet partners). */
export function SettlementsPage() {
  const [period, setPeriod] = useState("");
  const [entityType, setEntityType] = useState("");
  const { data, error, reload } = useLoad(() => dmbExtraAdminAPI.settlements({ period: period || undefined, entityType: entityType || undefined }), [period, entityType]);
  const { busy, run } = useAction();
  const [genPeriod, setGenPeriod] = useState("");
  return (
    <Page
      title="Settlement statements"
      subtitle="Generated on the 1st of each month for the previous month (ACM-166): Track 1 cooks receive a self-billing settlement statement, unregistered fleet partners a payout statement."
      actions={<><input type="month" className="border border-slate-300 rounded-xl px-3 py-2 text-sm" value={genPeriod} onChange={(e) => setGenPeriod(e.target.value)} /><Btn busy={busy === "gen"} onClick={() => run("gen", async () => { const res = await dmbExtraAdminAPI.generateSettlements(genPeriod || undefined); await reload(); return res; }, "Statements generated")}>Generate {genPeriod || "last month"}</Btn></>}
    >
      <ErrorBox error={error} />
      {data && !data.enabled && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Automatic monthly statements are off (ACM-166). You can still generate them here.</div>}
      <div className="flex gap-2 flex-wrap">
        <input type="month" className="border border-slate-300 rounded-xl px-3 py-2 text-sm" value={period} onChange={(e) => setPeriod(e.target.value)} />
        {[["", "All"], ["cook", "Cooks"], ["fleet_partner", "Fleet partners"]].map(([k, l]) => <Btn key={k} size="sm" variant={entityType === k ? "primary" : "outline"} onClick={() => setEntityType(k)}>{l}</Btn>)}
      </div>
      <Card>
        <Table
          rows={data?.settlements}
          columns={[
            { label: "Number", key: "number" },
            { label: "Period", key: "period" },
            { label: "Name", render: (s) => <span>{s.entityName} <Badge>{s.entityType === "cook" ? "cook" : "fleet"}</Badge></span> },
            { label: "Orders", key: "orderCount", right: true },
            { label: "Gross", right: true, render: (s) => money(s.grossAmount, s.currency) },
            { label: "Commission", right: true, render: (s) => money(s.commissionAmount, s.currency) },
            { label: "Net", right: true, render: (s) => <b>{money(s.netAmount, s.currency)}</b> },
            { label: "", right: true, render: (s) => <Btn size="sm" variant="outline" busy={busy === s._id} onClick={() => run(s._id, async () => saveBlob(await dmbExtraAdminAPI.settlementPdf(s._id), `${s.number.replace(/\//g, "-")}.pdf`))}><Download className="w-3.5 h-3.5" /> PDF</Btn> },
          ]}
          empty="No statements."
        />
      </Card>
    </Page>
  );
}

/** Gap AD — vendor-nominated delivery partners (ACM-169/170). */
export function FleetRequestsPage() {
  const [status, setStatus] = useState("pending");
  const { data, error, reload } = useLoad(() => dmbExtraAdminAPI.fleetRequests({ status }), [status]);
  const { busy, run } = useAction();
  const [pick, setPick] = useState({});
  const partners = data?.partners || [];
  return (
    <Page title="Preferred delivery partners" subtitle="Vendors can ask for their own delivery partner. Approved partners get the vendor's orders first; the platform driver pool remains the fallback.">
      <ErrorBox error={error} />
      <div className="flex gap-2">{["pending", "approved", "rejected", "withdrawn"].map((s) => <Btn key={s} size="sm" variant={status === s ? "primary" : "outline"} onClick={() => setStatus(s)}>{s}</Btn>)}</div>
      <Card title="Requests">
        <Table
          rows={data?.requests}
          columns={[
            { label: "Requested", render: (r) => fmtDateTime(r.createdAt) },
            { label: "Vendor", render: (r) => r.vendorId?.restaurantName || "—" },
            { label: "Partner", render: (r) => <div><p className="font-semibold">{r.partnerName}</p><p className="text-xs text-slate-500">{[r.contactName, r.contactPhone, r.contactEmail].filter(Boolean).join(" · ")}</p><Badge>{r.entityType === "individual_unregistered" ? "individual" : "company"}</Badge></div> },
            { label: "Note", key: "note" },
            { label: "Link to", render: (r) => (r.status === "pending" ? (
              <select className={inputCls} value={pick[r._id] ?? (r.fleetPartnerId?._id || "")} onChange={(e) => setPick({ ...pick, [r._id]: e.target.value })}>
                <option value="">Choose fleet partner…</option>
                {partners.map((p) => <option key={p._id} value={p._id}>{p.companyName} ({p.status})</option>)}
              </select>
            ) : <Badge tone={r.status === "approved" ? "green" : "gray"}>{r.status}</Badge>) },
            { label: "", right: true, render: (r) => r.status === "pending" && (
              <div className="flex gap-1 justify-end">
                <Btn size="sm" disabled={!(pick[r._id] ?? r.fleetPartnerId?._id)} busy={busy === `a${r._id}`} onClick={() => run(`a${r._id}`, async () => { await adminApprove(r._id, pick[r._id] ?? r.fleetPartnerId?._id); await reload(); }, "Approved and linked")}>Approve</Btn>
                <Btn size="sm" variant="outline" busy={busy === `r${r._id}`} onClick={() => { const reason = window.prompt("Reason (sent to the vendor)"); if (reason) run(`r${r._id}`, async () => { await dmbExtraAdminAPI.rejectFleetRequest(r._id, reason); await reload(); }, "Rejected"); }}>Reject</Btn>
              </div>
            ) },
          ]}
          empty="No requests."
        />
      </Card>
      <Card title="Fleet partners">
        <Table
          rows={partners}
          columns={[
            { label: "Partner", render: (p) => <span className="font-semibold">{p.companyName}</span> },
            { label: "City", key: "city" },
            { label: "Status", render: (p) => <Badge tone={p.status === "active" ? "green" : "gray"}>{p.status}</Badge> },
            { label: "Entity", render: (p) => (
              <select className="border border-slate-300 rounded-lg px-2 py-1 text-xs" value={p.entityType || "company"} onChange={(e) => run(`e${p._id}`, async () => { await dmbExtraAdminAPI.setFleetEntityType(p._id, e.target.value); await reload(); }, "Saved")}>
                <option value="company">Company (invoices)</option>
                <option value="individual_unregistered">Individual (settlement statement)</option>
              </select>
            ) },
            { label: "Preferred by", render: (p) => (p.preferredForVendorIds || []).map((v) => v.restaurantName).join(", ") || "—" },
          ]}
        />
      </Card>
    </Page>
  );
}
const adminApprove = (id, fleetPartnerId) => dmbExtraAdminAPI.approveFleetRequest(id, fleetPartnerId);

/** Gap AI — eco packaging declarations to verify (ACM-176). */
export function EcoVendorsPage() {
  const [status, setStatus] = useState("unverified");
  const { data, error, reload } = useLoad(() => dmbExtraAdminAPI.ecoVendors({ status }), [status]);
  const { busy, run } = useAction();
  return (
    <Page title="Eco packaging" subtitle={data?.verificationRequired ? "Badges are shown only after you verify the declaration (ACM-176)." : "Badges are shown as soon as the vendor declares eco packaging (verification is optional, ACM-176 off)."}>
      <ErrorBox error={error} />
      <div className="flex gap-2">{[["unverified", "To verify"], ["verified", "Verified"], ["", "All"]].map(([k, l]) => <Btn key={k} size="sm" variant={status === k ? "primary" : "outline"} onClick={() => setStatus(k)}>{l}</Btn>)}</div>
      <Card>
        <Table
          rows={data?.vendors}
          columns={[
            { label: "Vendor", render: (v) => <div><p className="font-semibold">{v.restaurantName}</p><p className="text-xs text-slate-500">{v.city}</p></div> },
            { label: "Packaging", render: (v) => v.ecoPackaging?.type || "—" },
            { label: "Photo", render: (v) => (v.ecoPackaging?.photoUrl ? <a href={v.ecoPackaging.photoUrl} target="_blank" rel="noopener noreferrer"><img src={v.ecoPackaging.photoUrl} alt="" className="w-16 h-16 object-cover rounded-lg" /></a> : "—") },
            { label: "Declared", render: (v) => fmtDate(v.ecoPackaging?.declaredAt) },
            { label: "Status", render: (v) => (v.ecoPackaging?.adminVerified ? <Badge tone="green">verified</Badge> : <Badge tone="amber">not verified</Badge>) },
            { label: "", right: true, render: (v) => <Btn size="sm" variant={v.ecoPackaging?.adminVerified ? "outline" : "primary"} busy={busy === v._id} onClick={() => run(v._id, async () => { await dmbExtraAdminAPI.verifyEco(v._id, { verified: !v.ecoPackaging?.adminVerified }); await reload(); }, "Saved")}>{v.ecoPackaging?.adminVerified ? "Remove verification" : "Verify"}</Btn> },
          ]}
          empty="Nothing here."
        />
      </Card>
    </Page>
  );
}

const SPECIALISM = { hashimoto: "Hashimoto's", pregnancy: "Pregnancy", low_gi: "Low GI / diabetes", menopause: "Menopause" };

/** Gap AH — dietitian-certified specialism applications (ACM-174/175). */
export function SpecialismsPage() {
  const [status, setStatus] = useState("pending");
  const { data, error, reload } = useLoad(() => dmbExtraAdminAPI.specialisms({ status }), [status]);
  const { busy, run } = useAction();
  return (
    <Page title="Medical specialisms" subtitle="Approve a specialism only with a signed collaboration agreement from a certified dietitian. Approved badges expire after the validity set in ACM-175.">
      <ErrorBox error={error} />
      <div className="flex gap-2">{["pending", "approved", "rejected", "expired"].map((s) => <Btn key={s} size="sm" variant={status === s ? "primary" : "outline"} onClick={() => setStatus(s)}>{s}</Btn>)}</div>
      <Card>
        <Table
          rows={data?.applications}
          rowKey={(a) => a._id || `${a.vendorId}-${a.specialism}`}
          columns={[
            { label: "Vendor", render: (a) => <div><p className="font-semibold">{a.vendorName}</p><p className="text-xs text-slate-500">{a.city}</p></div> },
            { label: "Specialism", render: (a) => SPECIALISM[a.specialism] || a.specialism },
            { label: "Dietitian", key: "dietitianName" },
            { label: "Documents", render: (a) => <div className="space-x-2">{a.documentUrl && <a className="text-emerald-700 underline text-xs" href={a.documentUrl} target="_blank" rel="noopener noreferrer">Agreement</a>}{a.samplePlanUrl && <a className="text-emerald-700 underline text-xs" href={a.samplePlanUrl} target="_blank" rel="noopener noreferrer">Sample plan</a>}</div> },
            { label: "Applied", render: (a) => fmtDate(a.appliedAt) },
            { label: "Expires", render: (a) => fmtDate(a.expiryDate) },
            { label: "", right: true, render: (a) => a.status === "pending" && (
              <div className="flex gap-1 justify-end">
                <Btn size="sm" busy={busy === `a${a._id}`} onClick={() => run(`a${a._id}`, async () => { await dmbExtraAdminAPI.reviewSpecialism(a.vendorId, a._id, { approve: true }); await reload(); }, "Approved")}>Approve</Btn>
                <Btn size="sm" variant="outline" busy={busy === `r${a._id}`} onClick={() => { const reason = window.prompt("Reason (sent to the vendor)"); if (reason) run(`r${a._id}`, async () => { await dmbExtraAdminAPI.reviewSpecialism(a.vendorId, a._id, { approve: false, reason }); await reload(); }, "Rejected"); }}>Reject</Btn>
              </div>
            ) },
          ]}
          empty="No applications."
        />
      </Card>
    </Page>
  );
}

/** Gap AL — how many active meals carry a Hot/Cold label; remind vendors who have not set it. */
export function TemperaturePage() {
  const { data, error, reload } = useLoad(() => dmbExtraAdminAPI.temperatureCoverage(), []);
  const { busy, run } = useAction();
  return (
    <Page title="Hot / Cold labels" subtitle="Customers see 🔥 Hot and ❄ Cold labels (ACM-182). With ACM-183 on, a meal cannot be published without one.">
      <ErrorBox error={error} />
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><p className="text-xs text-slate-500">🔥 Hot meals</p><p className="text-2xl font-bold">{data.hot}</p></Card>
          <Card><p className="text-xs text-slate-500">❄ Cold meals</p><p className="text-2xl font-bold">{data.cold}</p></Card>
          <Card><p className="text-xs text-slate-500">Without label</p><p className="text-2xl font-bold text-amber-700">{data.missing}</p></Card>
          <Card><p className="text-xs text-slate-500">Vendors to update</p><p className="text-2xl font-bold">{data.vendorsMissing}</p></Card>
        </div>
      )}
      <Btn busy={busy === "remind"} disabled={!data?.vendorsMissing} onClick={() => run("remind", async () => { const res = await dmbExtraAdminAPI.temperatureReminder(); await reload(); return res; }, "Reminder sent to vendors")}>Send reminder to vendors</Btn>
    </Page>
  );
}

/** Gap T — vendor review replies: response rate and moderation (hide / unhide / delete). */
export function ReviewModerationPage() {
  const [vendorId, setVendorId] = useState("");
  const { data: vendors } = useLoad(() => adminAPI.getRestaurants ? adminAPI.getRestaurants({ limit: 500 }) : Promise.resolve({ data: {} }), []);
  const list = vendors?.data?.restaurants || vendors?.data?.data?.restaurants || vendors?.restaurants || [];
  const { data, error, reload } = useLoad(() => (vendorId ? dmbExtraAdminAPI.vendorReviews(vendorId, { limit: 100 }) : Promise.resolve({ data: null })), [vendorId]);
  const { busy, run } = useAction();
  const act = (r, action) => {
    const reason = action === "unhide" ? "" : window.prompt(`Reason to ${action} this reply`);
    if (action !== "unhide" && !reason) return;
    run(`${r.orderId}${action}`, async () => { await dmbExtraAdminAPI.moderateReview(r.orderId, action, reason); await reload(); }, "Saved");
  };
  return (
    <Page title="Review replies" subtitle="Vendors reply publicly to reviews (ACM-158). Hide or delete replies that break the rules; the vendor sees the reason.">
      <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="border border-slate-300 rounded-xl px-3 py-2 text-sm max-w-md">
        <option value="">Choose a vendor…</option>
        {(Array.isArray(list) ? list : []).map((v) => <option key={v._id} value={v._id}>{v.restaurantName || v.name}</option>)}
      </select>
      <ErrorBox error={error} />
      {data && (
        <Card title={data.vendor?.restaurantName} subtitle={`Meal rating ${data.vendor?.mealRating?.average ?? "—"} (${data.vendor?.mealRating?.count ?? 0}) · reply rate ${data.responseRate}%`}>
          <Table
            rows={data.reviews}
            rowKey={(r) => r.orderId}
            columns={[
              { label: "Date", render: (r) => fmtDate(r.ratedAt) },
              { label: "Customer", key: "customer" },
              { label: "Ratings", render: (r) => <span className="text-xs">meal {r.ratings?.mealQuality ?? "—"} · delivery {r.ratings?.deliveryExperience ?? "—"} · overall {r.ratings?.overall ?? "—"}</span> },
              { label: "Comment", key: "comment" },
              { label: "Vendor reply", render: (r) => (r.response?.createdAt ? <div><p className={r.response.hidden ? "line-through text-slate-400" : ""}>{r.response.text}</p>{r.response.hidden && <p className="text-xs text-red-600">Hidden: {r.response.hiddenReason}</p>}</div> : "—") },
              { label: "", right: true, render: (r) => r.response?.createdAt && (
                <div className="flex gap-1 justify-end">
                  {r.response.hidden ? <Btn size="sm" variant="outline" busy={busy === `${r.orderId}unhide`} onClick={() => act(r, "unhide")}>Unhide</Btn> : <Btn size="sm" variant="outline" busy={busy === `${r.orderId}hide`} onClick={() => act(r, "hide")}>Hide</Btn>}
                  <Btn size="sm" variant="ghost" busy={busy === `${r.orderId}delete`} onClick={() => act(r, "delete")}>Delete</Btn>
                </div>
              ) },
            ]}
            empty="No reviews."
          />
        </Card>
      )}
    </Page>
  );
}

