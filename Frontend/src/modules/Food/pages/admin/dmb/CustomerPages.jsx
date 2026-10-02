import { useState } from "react";
import { Send, Trash2, UserPlus, UserMinus } from "lucide-react";
import { dmbExtraAdminAPI, adminAPI } from "@food/api";
import { Page, Card, Btn, Badge, Table, Field, ErrorBox, inputCls, useLoad, useAction, fmtDate, money } from "./ui";

/** Gap F — customers flagged by the bad-debt rules; CS actions are logged on the customer and in the audit log. */
export function BadDebtPage() {
  const { data, error, reload } = useLoad(() => dmbExtraAdminAPI.badDebt({ limit: 100 }), []);
  const { busy, run } = useAction();
  const [noteFor, setNoteFor] = useState(null);
  const [note, setNote] = useState("");
  const act = (c, action, extra = {}) => run(`${c.userId}${action}`, async () => { await dmbExtraAdminAPI.badDebtAction(c.userId, { action, ...extra }); await reload(); }, "Saved");
  const r = data?.rules;
  return (
    <Page
      title="Bad-debt customers"
      subtitle={r ? `Flagged automatically every night: ${r.paymentFailures}+ failed payments in ${r.paymentFailureDays} days, ${r.refundRequests}+ refund requests in ${r.refundDays} days, or ${r.chargebacks}+ chargeback. City Managers see their cities only.` : ""}
      actions={<Btn variant="outline" busy={busy === "run"} onClick={() => run("run", async () => { await dmbExtraAdminAPI.runBadDebt(); await reload(); }, "Check finished")}>Run check now</Btn>}
    >
      <ErrorBox error={error} />
      <Card>
        <Table
          rows={data?.customers}
          rowKey={(c) => c.userId}
          columns={[
            { label: "Customer", render: (c) => <div><p className="font-semibold">{c.alias}</p><p className="text-xs text-slate-500">•••{c.phoneTail}</p></div> },
            { label: "Failed payments", key: "failures", right: true },
            { label: "Refunds", key: "refunds", right: true },
            { label: "Chargebacks", key: "chargebacks", right: true },
            { label: "Debt", right: true, render: (c) => money(c.debtAmount) },
            { label: "Last active", render: (c) => fmtDate(c.lastActive) },
            { label: "State", render: (c) => (
              <div className="flex flex-wrap gap-1">
                {c.codBlocked && <Badge tone="red">COD blocked</Badge>}
                {c.subscriptionBlocked && <Badge tone="red">No new subscriptions</Badge>}
                {c.escalated && <Badge tone="violet">Escalated</Badge>}
                <Badge tone="amber">Recommended: {c.recommendedAction}</Badge>
              </div>
            ) },
            { label: "Actions", render: (c) => (
              <div className="flex flex-wrap gap-1 max-w-xs">
                <Btn size="sm" variant="outline" busy={busy === `${c.userId}${c.codBlocked ? "cod_unblock" : "cod_block"}`} onClick={() => act(c, c.codBlocked ? "cod_unblock" : "cod_block")}>{c.codBlocked ? "Allow COD" : "Block COD"}</Btn>
                <Btn size="sm" variant="outline" busy={busy === `${c.userId}${c.subscriptionBlocked ? "subscription_unblock" : "subscription_block"}`} onClick={() => act(c, c.subscriptionBlocked ? "subscription_unblock" : "subscription_block")}>{c.subscriptionBlocked ? "Allow subscriptions" : "Block subscriptions"}</Btn>
                {!c.escalated && <Btn size="sm" variant="outline" onClick={() => act(c, "escalate", { note: window.prompt("Why escalate to Super Admin?") || "" })}>Escalate</Btn>}
                <Btn size="sm" variant="ghost" onClick={() => { setNoteFor(c); setNote(""); }}>Notes ({c.notes.length})</Btn>
                <Btn size="sm" variant="ghost" onClick={() => window.confirm("Clear the flag and all blocks?") && act(c, "clear")}>Clear</Btn>
              </div>
            ) },
          ]}
          empty="No flagged customers."
        />
      </Card>
      {noteFor && (
        <Card title={`Notes · ${noteFor.alias}`} actions={<Btn size="sm" variant="ghost" onClick={() => setNoteFor(null)}>Close</Btn>}>
          <div className="space-y-2 mb-3">
            {noteFor.notes.length === 0 && <p className="text-sm text-slate-400">No notes yet.</p>}
            {noteFor.notes.map((n, i) => <p key={i} className="text-sm"><span className="text-slate-400">{fmtDate(n.at)} · {n.by}:</span> {n.text}</p>)}
          </div>
          <div className="flex gap-2">
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (not visible to the customer)" />
            <Btn disabled={!note.trim()} busy={busy === `${noteFor.userId}note`} onClick={async () => { await act(noteFor, "note", { note }); setNoteFor(null); }}>Add</Btn>
          </div>
          <div className="flex gap-2 mt-3">
            <Btn size="sm" variant="outline" onClick={() => { const amount = window.prompt("Chargeback amount (PLN)"); if (amount !== null) act(noteFor, "chargeback", { amount: Number(amount) || 0, reference: window.prompt("Reference (optional)") || "" }); }}>Record chargeback</Btn>
          </div>
        </Card>
      )}
    </Page>
  );
}

/** Gap Y — named customer segments (ACM-160) with push messages to a segment. */
export function SegmentsPage() {
  const { data, error, reload } = useLoad(() => dmbExtraAdminAPI.segments(), []);
  const { busy, run } = useAction();
  const [form, setForm] = useState({ name: "", description: "", color: "#6366f1" });
  const [open, setOpen] = useState(null);
  return (
    <Page title="Customer segments" subtitle="Group customers (e.g. VIP, corporate, at-risk) to target push messages and Mailchimp tags.">
      <ErrorBox error={error} />
      {data && !data.enabled && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Segments are switched off (ACM-160). Turn them on in Admin controls → Marketing.</div>}
      <Card title="New segment">
        <div className="grid md:grid-cols-4 gap-3 items-end">
          <Field label="Name"><input className={inputCls} maxLength={40} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Description"><input className={inputCls} maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Colour"><input type="color" className="h-10 w-16 rounded" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></Field>
          <Btn busy={busy === "create"} disabled={!form.name.trim()} onClick={() => run("create", async () => { await dmbExtraAdminAPI.createSegment(form); setForm({ name: "", description: "", color: "#6366f1" }); await reload(); }, "Segment created")}>Create</Btn>
        </div>
      </Card>
      <Card title="Segments">
        <Table
          rows={data?.segments}
          columns={[
            { label: "Segment", render: (s) => <span className="inline-flex items-center gap-2 font-semibold"><span className="w-3 h-3 rounded-full" style={{ background: s.color }} />{s.name}</span> },
            { label: "Description", key: "description" },
            { label: "Members", key: "members", right: true },
            { label: "", right: true, render: (s) => (
              <div className="flex gap-1 justify-end">
                <Btn size="sm" variant="outline" onClick={() => setOpen(s)}>Manage</Btn>
                <Btn size="sm" variant="ghost" busy={busy === `d${s._id}`} onClick={() => window.confirm(`Delete segment ${s.name}?`) && run(`d${s._id}`, async () => { await dmbExtraAdminAPI.deleteSegment(s._id); await reload(); }, "Deleted")}><Trash2 className="w-3.5 h-3.5" /></Btn>
              </div>
            ) },
          ]}
          empty="No segments yet."
        />
      </Card>
      {open && <SegmentDetail segment={open} onClose={() => { setOpen(null); reload(); }} />}
    </Page>
  );
}

function SegmentDetail({ segment, onClose }) {
  const { data, reload } = useLoad(() => dmbExtraAdminAPI.segmentMembers(segment._id, { limit: 200 }), [segment._id]);
  const { busy, run } = useAction();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [push, setPush] = useState({ title: "", body: "" });
  const find = async () => {
    try {
      const res = await adminAPI.getCustomers({ search, limit: 20 });
      const list = res.data?.data?.customers || res.data?.data?.users || res.data?.customers || res.data?.data || [];
      setResults(Array.isArray(list) ? list : []);
    } catch {
      setResults([]);
    }
  };
  return (
    <Card title={`Segment · ${segment.name}`} actions={<Btn size="sm" variant="ghost" onClick={onClose}>Close</Btn>}>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h3 className="text-sm font-bold">Members ({data?.total ?? "…"})</h3>
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
            {(data?.members || []).map((m) => (
              <div key={m._id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{m.name || "—"} <span className="text-slate-400">{m.phone}</span></span>
                <Btn size="sm" variant="ghost" busy={busy === `r${m._id}`} onClick={() => run(`r${m._id}`, async () => { await dmbExtraAdminAPI.editSegmentMembers(segment._id, { remove: [m._id] }); await reload(); })}><UserMinus className="w-3.5 h-3.5" /></Btn>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find customer by name or phone" onKeyDown={(e) => e.key === "Enter" && find()} />
            <Btn variant="outline" onClick={find}>Search</Btn>
          </div>
          {results.map((u) => (
            <div key={u._id} className="flex items-center justify-between text-sm px-1">
              <span>{u.name || "—"} <span className="text-slate-400">{u.phone}</span></span>
              <Btn size="sm" busy={busy === `a${u._id}`} onClick={() => run(`a${u._id}`, async () => { await dmbExtraAdminAPI.editSegmentMembers(segment._id, { add: [u._id] }); await reload(); }, "Added")}><UserPlus className="w-3.5 h-3.5" /> Add</Btn>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-bold">Push message to this segment</h3>
          <Field label="Title"><input className={inputCls} maxLength={80} value={push.title} onChange={(e) => setPush({ ...push, title: e.target.value })} /></Field>
          <Field label="Message"><textarea className={inputCls} maxLength={300} rows={3} value={push.body} onChange={(e) => setPush({ ...push, body: e.target.value })} /></Field>
          <p className="text-xs text-slate-500">Respects each customer's notification preferences (promotions).</p>
          <Btn busy={busy === "push"} disabled={!push.title.trim() || !push.body.trim()} onClick={() => run("push", async () => { const res = await dmbExtraAdminAPI.pushSegment(segment._id, push); setPush({ title: "", body: "" }); return res; }, "Message sent")}><Send className="w-3.5 h-3.5" /> Send</Btn>
        </div>
      </div>
    </Card>
  );
}

const LANGS = ["pl", "en", "de", "uk", "ru"];

/** Gap AC — AP-13 legal documents: versions, languages, re-acceptance tracking. */
export function LegalPage() {
  const { data, error, reload } = useLoad(() => dmbExtraAdminAPI.legal(), []);
  const [editing, setEditing] = useState(null);
  return (
    <Page title="Legal documents" subtitle="Publish new versions without an app release. With “Requires re-acceptance”, every affected user sees a blocking acceptance screen on next use; the Cook Agreement must always be accepted before a Track 1 cook can trade.">
      <ErrorBox error={error} />
      {data && !data.enforcement && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Re-acceptance enforcement (ACM-168) is off — only the Cook Agreement is enforced.</div>}
      <Card>
        <Table
          rows={data?.documents}
          rowKey={(d) => d.docType}
          columns={[
            { label: "Document", render: (d) => <div><p className="font-semibold">{d.label}</p><p className="text-xs text-slate-500">{d.audiences.join(", ")}{d.alwaysRequired ? " · always required" : ""}</p></div> },
            { label: "Current", render: (d) => (d.current ? <div><Badge tone="green">v{d.current.version}</Badge><p className="text-xs text-slate-500 mt-1">{(d.current.translations || []).map((t) => t.language).join(", ")} · effective {fmtDate(d.current.effectiveDate || d.current.publishedAt)}</p></div> : <Badge>not published</Badge>) },
            { label: "Acceptance", render: (d) => (d.stats ? `${d.stats.accepted} accepted · ${d.stats.pending} pending` : "—") },
            { label: "Draft", render: (d) => (d.draft ? <Badge tone="amber">v{d.draft.version} draft</Badge> : "—") },
            { label: "", right: true, render: (d) => <Btn size="sm" variant="outline" onClick={() => setEditing(d)}>{d.draft ? "Edit draft" : "New version"}</Btn> },
          ]}
        />
      </Card>
      {editing && <LegalEditor doc={editing} onClose={() => { setEditing(null); reload(); }} />}
    </Page>
  );
}

function LegalEditor({ doc, onClose }) {
  const base = doc.draft || doc.current;
  const [lang, setLang] = useState("pl");
  const [translations, setTranslations] = useState(() => Object.fromEntries((base?.translations || []).map((t) => [t.language, { title: t.title, body: t.body, contentUrl: t.contentUrl || "" }])));
  const [effectiveDate, setEffectiveDate] = useState(base?.effectiveDate ? String(base.effectiveDate).slice(0, 10) : "");
  const [requiresReacceptance, setReq] = useState(Boolean(doc.draft?.requiresReacceptance));
  const [changeNote, setChangeNote] = useState(doc.draft?.changeNote || "");
  const { data: hist } = useLoad(() => dmbExtraAdminAPI.legalHistory(doc.docType), [doc.docType]);
  const { busy, run } = useAction();
  const cur = translations[lang] || { title: "", body: "", contentUrl: "" };
  const set = (patch) => setTranslations({ ...translations, [lang]: { ...cur, ...patch } });
  const payload = () => ({ translations: Object.entries(translations).filter(([, t]) => t.title?.trim()).map(([language, t]) => ({ language, ...t })), effectiveDate: effectiveDate || null, requiresReacceptance, changeNote });

  const save = () => run("save", () => dmbExtraAdminAPI.saveLegalDraft(doc.docType, payload()), "Draft saved");
  const publish = () => run("publish", async () => {
    const res = await dmbExtraAdminAPI.saveLegalDraft(doc.docType, payload());
    await dmbExtraAdminAPI.publishLegal(res.data.document._id);
    onClose();
  }, "Published");
  return (
    <Card title={`${doc.label} · ${doc.draft ? `draft v${doc.draft.version}` : "new version"}`} actions={<Btn size="sm" variant="ghost" onClick={onClose}>Close</Btn>}>
      <div className="flex gap-1 mb-3">
        {LANGS.map((l) => <Btn key={l} size="sm" variant={lang === l ? "primary" : "outline"} onClick={() => setLang(l)}>{l.toUpperCase()}{translations[l]?.title ? " ✓" : ""}</Btn>)}
      </div>
      <div className="space-y-3">
        <Field label="Title"><input className={inputCls} value={cur.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Text" hint="Plain text. Shown in full on the acceptance screen."><textarea className={inputCls} rows={12} value={cur.body} onChange={(e) => set({ body: e.target.value })} /></Field>
        <Field label="Link to the full PDF (optional)"><input className={inputCls} value={cur.contentUrl} onChange={(e) => set({ contentUrl: e.target.value })} placeholder="https://…" /></Field>
        <div className="grid md:grid-cols-3 gap-3 items-end">
          <Field label="Effective date"><input type="date" className={inputCls} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="w-4 h-4 accent-emerald-700" checked={requiresReacceptance || doc.alwaysRequired} disabled={doc.alwaysRequired} onChange={(e) => setReq(e.target.checked)} /> Requires re-acceptance</label>
          <Field label="Change note (internal)"><input className={inputCls} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} /></Field>
        </div>
        <div className="flex gap-2 justify-end">
          {doc.draft && <Btn variant="ghost" busy={busy === "discard"} onClick={() => window.confirm("Discard this draft?") && run("discard", async () => { await dmbExtraAdminAPI.discardLegal(doc.draft._id); onClose(); }, "Draft discarded")}>Discard draft</Btn>}
          <Btn variant="outline" busy={busy === "save"} onClick={save}>Save draft</Btn>
          <Btn busy={busy === "publish"} onClick={() => window.confirm("Publish this version now?") && publish()}>Publish</Btn>
        </div>
      </div>
      {hist && (
        <div className="mt-6">
          <h3 className="text-sm font-bold mb-2">History</h3>
          <div className="max-h-56 overflow-y-auto text-xs space-y-1">
            {(hist.revisions || []).map((r) => <p key={r._id} className="text-slate-600">{fmtDate(r.at)} · v{r.version} · {r.action.replace(/_/g, " ")} ({r.status})</p>)}
          </div>
        </div>
      )}
    </Card>
  );
}
