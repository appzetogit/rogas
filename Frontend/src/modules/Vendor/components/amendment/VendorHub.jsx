import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MessageSquare, Package, ChefHat, Truck, Leaf, CalendarDays, Stethoscope, ClipboardCheck, RotateCcw, ChevronRight, Star, Download, FileText, AlertTriangle } from "lucide-react";
import { dmbExtraVendorAPI } from "../../../../services/api/index";
import { tKey } from "../../../../shared/i18n";
import { Card, Notice, Button, Spinner, Chip, UploadButton, WEEK, useDayNames, errorText, saveBlob } from "./ui";

const fmt = (d, opts = { day: "numeric", month: "short" }) => (d ? new Date(String(d).length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString(undefined, opts) : "");
const money = (n, currency = "PLN") => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(n) || 0);
  } catch {
    return `${(Number(n) || 0).toFixed(2)} ${currency}`;
  }
};

const SECTIONS = [
  { key: "reviews", icon: MessageSquare, title: tKey("Customer reviews"), hint: tKey("Read and reply to reviews") },
  { key: "stock", icon: Package, title: tKey("Stock & pre-orders"), hint: tKey("Portions left today, pre-order demand") },
  { key: "menu-coverage", icon: ClipboardCheck, title: tKey("Upcoming menus"), hint: tKey("Days your customers can already see") },
  { key: "cook-track", icon: ChefHat, title: tKey("Home cook track"), hint: tKey("Track 1 / Track 2, documents, earnings limit"), homeCook: true },
  { key: "settlements", icon: FileText, title: tKey("Settlement statements"), hint: tKey("Monthly statements (Track 1)"), homeCook: true },
  { key: "delivery-partner", icon: Truck, title: tKey("Delivery partner"), hint: tKey("Use your own delivery partner") },
  { key: "eco", icon: Leaf, title: tKey("Eco packaging"), hint: tKey("Get the eco badge") },
  { key: "delivery-days", icon: CalendarDays, title: tKey("Delivery days"), hint: tKey("Which days you cook, incl. weekends") },
  { key: "specialisms", icon: Stethoscope, title: tKey("Medical specialisms"), hint: tKey("Dietitian-certified badges") },
  { key: "pantry-returns", icon: RotateCcw, title: tKey("Returned bags"), hint: tKey("Pantry bags brought back by drivers"), pantryOnly: true },
];

/** "More" hub for the Amendment v2 Extra vendor features. Route: /vendor/more and /vendor/more/:section. */
export default function VendorHub({ profile }) {
  const { t: tr } = useTranslation("vendor");
  const navigate = useNavigate();
  const { section } = useParams();
  const [config, setConfig] = useState(null);

  useEffect(() => {
    dmbExtraVendorAPI
      .config()
      .then((res) => setConfig(res.data.config))
      .catch(() => setConfig({}));
  }, []);

  const isPantry = profile?.vendorType === "pantry_shop" || config?.vendorType === "pantry_shop";
  const isHomeCook = (config?.vendorType || profile?.vendorType) === "home_cook";
  const visible = SECTIONS.filter((s) => (s.pantryOnly ? isPantry : !isPantry || ["delivery-partner", "eco"].includes(s.key)) && (!s.homeCook || isHomeCook));

  if (!section) {
    return (
      <div className="px-4 md:px-8 py-5 max-w-3xl w-full mx-auto space-y-3">
        <MenuCoverageNudge compact onOpen={() => navigate("/vendor/more/menu-coverage")} />
        {visible.map(({ key, icon: Icon, title, hint }) => (
          <button key={key} type="button" onClick={() => navigate(`/vendor/more/${key}`)} className="w-full bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center gap-3 text-left hover:border-[#00604c]/40">
            <span className="w-10 h-10 rounded-xl bg-emerald-50 text-[#00604c] flex items-center justify-center shrink-0"><Icon size={20} /></span>
            <span className="flex-1 min-w-0">
              <span className="block font-extrabold text-[14px] text-slate-900">{tr(title)}</span>
              <span className="block text-[12px] text-slate-500">{tr(hint)}</span>
            </span>
            <ChevronRight size={18} className="text-slate-400" />
          </button>
        ))}
      </div>
    );
  }

  const Section = {
    reviews: ReviewsSection,
    stock: StockSection,
    "menu-coverage": MenuCoverageSection,
    "cook-track": CookTrackSection,
    settlements: SettlementsSection,
    "delivery-partner": DeliveryPartnerSection,
    eco: EcoSection,
    "delivery-days": DeliveryDaysSection,
    specialisms: SpecialismsSection,
    "pantry-returns": PantryReturnsSection,
  }[section];
  return <div className="px-4 md:px-8 py-5 max-w-3xl w-full mx-auto space-y-4">{Section ? <Section config={config || {}} /> : <Notice tone="warn">{tr("Page not found")}</Notice>}</div>;
}

function useLoad(fn, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const res = await fn();
      setData(res.data);
      setError("");
    } catch (err) {
      setError(errorText(err, "Error"));
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, reload: load, setData };
}

function Stars({ value }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={13} className={n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"} />)}
    </span>
  );
}

/** Gap T — VM-09 reviews. Vendors see the meal rating and overall only (never the delivery rating). */
function ReviewsSection() {
  const { t: tr } = useTranslation("vendor");
  const [filter, setFilter] = useState("all");
  const { data, error, reload } = useLoad(() => dmbExtraVendorAPI.reviews({ filter, limit: 50 }), [filter]);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState("");
  const [rowError, setRowError] = useState("");

  const send = async (r) => {
    setBusy(r.orderId);
    setRowError("");
    try {
      await dmbExtraVendorAPI.respondToReview(r.orderId, drafts[r.orderId] ?? r.response?.text ?? "");
      setDrafts((d) => ({ ...d, [r.orderId]: undefined }));
      await reload();
    } catch (err) {
      setRowError(errorText(err, tr("Could not send the reply")));
    } finally {
      setBusy("");
    }
  };

  if (!data) return error ? <Notice tone="error">{error}</Notice> : <Spinner />;
  const s = data.stats || {};
  return (
    <>
      <Card title={tr("Customer reviews")}>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-50 rounded-xl p-3"><p className="text-[11px] text-slate-500">{tr("Meal quality")}</p><p className="text-[18px] font-extrabold">{s.avgMealQuality ?? "—"}</p></div>
          <div className="bg-slate-50 rounded-xl p-3"><p className="text-[11px] text-slate-500">{tr("Reviews")}</p><p className="text-[18px] font-extrabold">{s.total || 0}</p></div>
          <div className="bg-slate-50 rounded-xl p-3"><p className="text-[11px] text-slate-500">{tr("Replied")}</p><p className="text-[18px] font-extrabold">{s.responseRate || 0}%</p></div>
        </div>
        <div className="flex gap-2">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>{tr("All")}</Chip>
          <Chip active={filter === "unanswered"} onClick={() => setFilter("unanswered")}>{tr("Not replied")}</Chip>
          <Chip active={filter === "answered"} onClick={() => setFilter("answered")}>{tr("Replied")}</Chip>
        </div>
        {!data.responsesEnabled && <Notice tone="info">{tr("Replying to reviews is switched off by the platform.")}</Notice>}
        {rowError && <Notice tone="error">{rowError}</Notice>}
      </Card>
      {(data.reviews || []).length === 0 && <Notice tone="info">{tr("No reviews yet.")}</Notice>}
      {(data.reviews || []).map((r) => {
        const canEdit = data.responsesEnabled && (!r.response || (!r.response.hidden && new Date(r.response.editableUntil) > new Date()));
        const draft = drafts[r.orderId] ?? r.response?.text ?? "";
        return (
          <Card key={r.orderId}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-[13px]">{r.customerAlias} · <span className="text-slate-500 font-medium">{fmt(r.ratedAt)}</span></p>
                <p className="text-[12px] text-slate-500">{(r.meals || []).join(", ")}</p>
              </div>
              <div className="text-right text-[11px] text-slate-500 space-y-0.5">
                <div>{tr("Meal")} <Stars value={r.mealQuality} /></div>
                {r.overall && <div>{tr("Overall")} <Stars value={r.overall} /></div>}
              </div>
            </div>
            {r.comment && <p className="text-[13px] text-slate-800">“{r.comment}”</p>}
            {r.response?.hidden && <Notice tone="warn">{tr("Your reply was hidden by the platform: {{reason}}", { reason: r.response.hiddenReason || "—" })}</Notice>}
            {canEdit ? (
              <div className="space-y-2">
                <textarea value={draft} maxLength={280} onChange={(e) => setDrafts((d) => ({ ...d, [r.orderId]: e.target.value }))} placeholder={tr("Write a public reply (max 280 characters)")} className="w-full min-h-[70px] p-3 text-[13px] border border-slate-200 rounded-xl" />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">{draft.length}/280{r.response ? ` · ${tr("editable until {{time}}", { time: new Date(r.response.editableUntil).toLocaleString() })}` : ""}</span>
                  <Button busy={busy === r.orderId} disabled={!draft.trim()} onClick={() => send(r)}>{r.response ? tr("Update reply") : tr("Reply")}</Button>
                </div>
              </div>
            ) : r.response && !r.response.hidden ? (
              <div className="bg-emerald-50 rounded-xl p-3 text-[13px]"><span className="font-bold">{tr("Your reply")}: </span>{r.response.text}</div>
            ) : null}
          </Card>
        );
      })}
    </>
  );
}

/** Gap E — live stock per meal + Gap M pre-order demand. */
function StockSection() {
  const { t: tr } = useTranslation("vendor");
  const { data, error, reload } = useLoad(() => dmbExtraVendorAPI.stock(), []);
  const { data: demand } = useLoad(() => dmbExtraVendorAPI.preorderDemand(), []);
  const [edit, setEdit] = useState({});
  const [busy, setBusy] = useState("");
  const [rowError, setRowError] = useState("");

  const act = async (id, fn) => {
    setBusy(id);
    setRowError("");
    try {
      await fn();
      await reload();
    } catch (err) {
      setRowError(errorText(err, tr("Could not save")));
    } finally {
      setBusy("");
    }
  };

  if (!data) return error ? <Notice tone="error">{error}</Notice> : <Spinner />;
  return (
    <>
      <Card title={tr("Today's stock")} subtitle={tr("Portions you can still sell today ({{date}}). Customers see “Sold out” at zero.", { date: fmt(data.date, { weekday: "long", day: "numeric", month: "long" }) })}>
        {rowError && <Notice tone="error">{rowError}</Notice>}
        {(data.meals || []).length === 0 && <p className="text-[13px] text-slate-500">{tr("No active meals.")}</p>}
        {(data.meals || []).map((m) => (
          <div key={m.mealPlanId} className="border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-[13px]">{m.name}</p>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${m.soldOut ? "bg-red-100 text-red-700" : m.lowStock ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                {m.soldOut ? tr("Sold out") : m.lowStock ? tr("Low stock") : tr("Available")}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full ${m.soldOut ? "bg-red-500" : m.lowStock ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, m.remainingPct)}%` }} />
            </div>
            <p className="text-[12px] text-slate-600">{tr("{{remaining}} left of {{available}} · {{committed}} ordered · {{prepared}} prepared", m)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <input type="number" min={0} max={1000} value={edit[m.mealPlanId] ?? m.available} onChange={(e) => setEdit((x) => ({ ...x, [m.mealPlanId]: e.target.value }))} className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-[13px]" aria-label={tr("Portions available")} />
              <Button variant="outline" busy={busy === `${m.mealPlanId}:a`} onClick={() => act(`${m.mealPlanId}:a`, () => dmbExtraVendorAPI.setStock(m.mealPlanId, { available: Number(edit[m.mealPlanId] ?? m.available) }))}>{tr("Set available")}</Button>
              <Button variant="ghost" busy={busy === `${m.mealPlanId}:p`} onClick={() => act(`${m.mealPlanId}:p`, () => dmbExtraVendorAPI.recordPrepared(m.mealPlanId, { delta: 1 }))}>{tr("+1 prepared")}</Button>
            </div>
          </div>
        ))}
      </Card>
      <Card title={tr("Pre-order demand")} subtitle={tr("Reserved portions for meals that have not launched yet")}>
        {!demand?.demand?.length ? (
          <p className="text-[13px] text-slate-500">{tr("No pre-orders yet. Set a meal to “Pre-order” with a launch date in your menu.")}</p>
        ) : (
          demand.demand.map((d) => (
            <div key={`${d.mealPlanId}-${d.date}-${d.slot}`} className="flex justify-between text-[13px] border-b border-slate-100 py-1.5">
              <span>{fmt(d.date, { weekday: "short", day: "numeric", month: "short" })} · {d.slot}</span>
              <span className="font-bold">{tr("{{portions}} portions ({{reservations}} customers)", d)}</span>
            </div>
          ))
        )}
      </Card>
    </>
  );
}

/** Gap AE nudge: fewer than 7 of the next days have a menu customers can see. */
export function MenuCoverageNudge({ compact, onOpen }) {
  const { t: tr } = useTranslation("vendor");
  const [data, setData] = useState(null);
  useEffect(() => {
    dmbExtraVendorAPI.menuCoverage().then((res) => setData(res.data)).catch(() => {});
  }, []);
  if (!data?.nudge) return null;
  return (
    <button type="button" onClick={onOpen} className={`w-full text-left rounded-2xl border border-amber-300 bg-amber-50 ${compact ? "p-3" : "p-4"} flex items-start gap-3`}>
      <AlertTriangle size={18} className="text-amber-700 mt-0.5 shrink-0" />
      <span className="text-[12.5px] text-amber-900">
        <span className="font-bold block">{tr("Customers can see your menu for only {{n}} of the next {{days}} days", { n: data.confirmedDays, days: data.days })}</span>
        {tr("Publish upcoming menus so subscribers know what's coming.")}
      </span>
    </button>
  );
}

function MenuCoverageSection() {
  const { t: tr } = useTranslation("vendor");
  const { data, error } = useLoad(() => dmbExtraVendorAPI.menuCoverage(), []);
  if (!data) return error ? <Notice tone="error">{error}</Notice> : <Spinner />;
  return (
    <Card title={tr("Upcoming menus")} subtitle={tr("{{n}} of the next {{days}} days are confirmed", { n: data.confirmedDays, days: data.days })}>
      {(data.schedule || []).map((d) => (
        <div key={d.date} className="flex items-center justify-between border-b border-slate-100 py-2 text-[13px]">
          <span className="font-bold">{fmt(d.date, { weekday: "short", day: "numeric", month: "short" })}</span>
          {d.missing.length ? (
            <span className="text-amber-700 font-bold">{tr("Missing: {{slots}}", { slots: d.missing.join(", ") })}</span>
          ) : d.neededSlots.length || d.uploadedSlots.length ? (
            <span className="text-emerald-700 font-bold">{tr("Confirmed")}</span>
          ) : (
            <span className="text-slate-400">{tr("No deliveries")}</span>
          )}
        </div>
      ))}
    </Card>
  );
}

/** Gap AA — two-track home cook: track choice, earnings tracker vs the legal limit, documents, guidance. */
function CookTrackSection() {
  const { t: tr } = useTranslation("vendor");
  const { data, error, reload } = useLoad(() => dmbExtraVendorAPI.cookTrack(), []);
  const [nip, setNip] = useState("");
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ tone: "", text: "" });

  const run = async (key, fn, ok) => {
    setBusy(key);
    setMsg({ tone: "", text: "" });
    try {
      await fn();
      await reload();
      if (ok) setMsg({ tone: "success", text: ok });
    } catch (err) {
      setMsg({ tone: "error", text: errorText(err, tr("Could not save")) });
    } finally {
      setBusy("");
    }
  };

  if (!data) return error ? <Notice tone="error">{error}</Notice> : <Spinner />;
  const tk = data.track;
  if (!tk.isHomeCook) return <Notice tone="info">{tr("The track choice applies to home cooks only.")}</Notice>;
  const e = tk.earnings;
  const docs = Object.fromEntries((tk.documents || []).map((d) => [d.key, d]));
  return (
    <>
      {msg.text && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {tk.paused && <Notice tone="error">{tr("Your account is paused until you upload your Sanepid registration.")}</Notice>}
      {tk.cookAgreement && !tk.cookAgreement.accepted && tk.cookTrack === 1 && <Notice tone="warn">{tr("Accept the current Cook Agreement (shown when you open the app) before going online.")}</Notice>}
      {tk.upgradeNotice && <Notice tone="warn">{tr("You are close to the limit for unregistered activity. Register a business (Track 2) to keep growing.")}</Notice>}

      <Card title={tr("Your track")} subtitle={tk.cookTrack ? (tk.cookTrack === 1 ? tr("Track 1 — unregistered activity (działalność nierejestrowana)") : tr("Track 2 — registered business or Kitchen Partner")) : tr("Choose how you sell on DailyMealBox")}>
        {!tk.cookTrack && (
          <div className="grid md:grid-cols-2 gap-3">
            <div className="border border-slate-200 rounded-xl p-3 space-y-2">
              <p className="font-bold text-[13px]">{tr("Track 1 — start without a company")}</p>
              <p className="text-[12px] text-slate-600">{tr("Sell from your home kitchen up to the monthly legal limit. You need kitchen photos and a Sanepid registration within the grace period. We issue your monthly settlement statement.")}</p>
              {tk.track1Available ? (
                <Button busy={busy === "t1"} onClick={() => run("t1", () => dmbExtraVendorAPI.selectTrack({ track: 1 }), tr("Track 1 selected. Check your e-mail for the GMP/GHP template."))}>{tr("Choose Track 1")}</Button>
              ) : (
                <p className="text-[12px] text-amber-700">{tr("Not available in your city.")}</p>
              )}
            </div>
            <div className="border border-slate-200 rounded-xl p-3 space-y-2">
              <p className="font-bold text-[13px]">{tr("Track 2 — registered business")}</p>
              <input value={nip} onChange={(ev) => setNip(ev.target.value)} placeholder={tr("Company NIP (10 digits)")} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px]" inputMode="numeric" />
              <Button variant="outline" busy={busy === "t2"} onClick={() => run("t2", () => dmbExtraVendorAPI.selectTrack({ track: 2, companyNip: nip }), tr("Track 2 selected."))}>{tr("Choose Track 2")}</Button>
            </div>
          </div>
        )}
        {tk.cookTrack === 1 && (
          <div className="flex flex-wrap gap-2 items-center">
            <input value={nip} onChange={(ev) => setNip(ev.target.value)} placeholder={tr("Company NIP (10 digits)")} className="border border-slate-200 rounded-lg px-3 py-2 text-[13px]" inputMode="numeric" />
            <Button variant="outline" busy={busy === "t2"} onClick={() => window.confirm(tr("Move to Track 2? You cannot return to Track 1.")) && run("t2", () => dmbExtraVendorAPI.selectTrack({ track: 2, companyNip: nip }), tr("Track 2 selected."))}>{tr("Upgrade to Track 2")}</Button>
          </div>
        )}
      </Card>

      {tk.cookTrack === 1 && (
        <>
          <Card title={tr("This month's earnings")} subtitle={tr("Gross sales count towards the monthly limit for unregistered activity")}>
            <div className="flex items-end justify-between">
              <p className="text-[22px] font-extrabold">{money(e.gross)}</p>
              <p className="text-[12px] text-slate-500">{tr("limit {{limit}}", { limit: money(e.limit) })}</p>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full ${e.level === "red" ? "bg-red-500" : e.level === "amber" ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, e.progressPct)}%` }} />
            </div>
            <p className="text-[12px] text-slate-600">{tr("{{pct}}% of the limit · {{orders}} orders", { pct: e.progressPct, orders: e.orders })}</p>
            {e.level !== "green" && <Notice tone={e.level === "red" ? "error" : "warn"}>{e.level === "red" ? tr("You have reached the limit. New orders this month count towards a registered business — register for Track 2.") : tr("You are above {{pct}}% of the limit this month.", { pct: e.warningPct })}</Notice>}
          </Card>

          <Card title={tr("Documents")}>
            <div className="space-y-3">
              <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                <p className="font-bold text-[13px]">{tr("Kitchen photos")} · <DocState state={docs.kitchen_photos?.state} review={docs.kitchen_photos?.review} /></p>
                <p className="text-[12px] text-slate-600">{tr("Upload at least {{n}} photos: the kitchen front and your main workspace.", { n: docs.kitchen_photos?.required || 2 })}</p>
                <div className="flex flex-wrap gap-2">
                  {photos.map((u) => <img key={u} src={u} alt="" className="w-16 h-16 rounded-lg object-cover" />)}
                </div>
                <div className="flex flex-wrap gap-2">
                  <UploadButton folder="kitchen-photos" label={tr("Add photo")} onUploaded={(u) => setPhotos((p) => [...p, u])} />
                  <Button disabled={photos.length < (docs.kitchen_photos?.required || 2)} busy={busy === "photos"} onClick={() => run("photos", () => dmbExtraVendorAPI.saveKitchenPhotos(photos), tr("Photos sent for review"))}>{tr("Send for review")}</Button>
                </div>
              </div>
              <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                <p className="font-bold text-[13px]">{tr("Sanepid registration")} · <DocState state={docs.sanepid?.state} /></p>
                {docs.sanepid?.deadline && !docs.sanepid?.uploaded && <p className="text-[12px] text-amber-700">{tr("Upload by {{date}}", { date: fmt(docs.sanepid.deadline, { day: "numeric", month: "long" }) })}</p>}
                {docs.sanepid?.url && <a href={docs.sanepid.url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[#00604c] underline">{tr("View uploaded document")}</a>}
                <UploadButton pdf folder="sanepid" label={tr("Upload document")} onUploaded={(u) => run("sanepid", () => dmbExtraVendorAPI.saveSanepid(u), tr("Sanepid document saved"))} />
              </div>
            </div>
          </Card>

          {(tk.guidance?.gmpTemplateUrl || tk.guidance?.sanepidChecklistUrl) && (
            <Card title={tr("Guides")}>
              {tk.guidance.gmpTemplateUrl && <a className="block text-[13px] text-[#00604c] underline" href={tk.guidance.gmpTemplateUrl} target="_blank" rel="noopener noreferrer">{tr("GMP/GHP documentation template")}</a>}
              {tk.guidance.sanepidChecklistUrl && <a className="block text-[13px] text-[#00604c] underline" href={tk.guidance.sanepidChecklistUrl} target="_blank" rel="noopener noreferrer">{tr("Sanepid registration checklist")}</a>}
            </Card>
          )}
        </>
      )}
    </>
  );
}

function DocState({ state, review }) {
  const { t: tr } = useTranslation("vendor");
  const label = review === "pending" ? tr("In review") : review === "rejected" ? tr("Rejected") : state === "green" ? tr("OK") : state === "red" ? tr("Missing") : tr("Pending");
  const color = state === "green" ? "text-emerald-700" : state === "red" || review === "rejected" ? "text-red-700" : "text-amber-700";
  return <span className={`font-bold ${color}`}>{label}</span>;
}

/** Gap AB — monthly settlement statements for Track 1 cooks. */
function SettlementsSection() {
  const { t: tr } = useTranslation("vendor");
  const { data, error } = useLoad(() => dmbExtraVendorAPI.settlements(), []);
  const [busy, setBusy] = useState("");
  const [dlError, setDlError] = useState("");
  const download = async (key, fn, name) => {
    setBusy(key);
    setDlError("");
    try {
      saveBlob(await fn(), name);
    } catch (err) {
      setDlError(errorText(err, tr("Download failed")));
    } finally {
      setBusy("");
    }
  };
  if (!data) return error ? <Notice tone="error">{error}</Notice> : <Spinner />;
  const years = [...new Set((data.settlements || []).map((s) => s.period.slice(0, 4)))];
  return (
    <>
      <Card title={tr("This month so far")}>
        <p className="text-[22px] font-extrabold">{money(data.currentMonth?.gross || 0)}</p>
        <p className="text-[12px] text-slate-500">{tr("{{n}} orders", { n: data.currentMonth?.orders || 0 })}</p>
      </Card>
      {dlError && <Notice tone="error">{dlError}</Notice>}
      <Card title={tr("Statements")} right={years.length ? (
        <div className="flex gap-1">
          {years.map((y) => <Button key={y} variant="ghost" busy={busy === `y${y}`} onClick={() => download(`y${y}`, () => dmbExtraVendorAPI.annualPdf(y), `Rozliczenie-${y}.pdf`)}><Download size={14} /> {y}</Button>)}
        </div>
      ) : null}>
        {(data.settlements || []).length === 0 && <p className="text-[13px] text-slate-500">{tr("Your first statement is generated on the 1st of next month.")}</p>}
        {(data.settlements || []).map((s) => (
          <div key={s._id} className="flex items-center justify-between border-b border-slate-100 py-2 text-[13px]">
            <div>
              <p className="font-bold">{s.period} · {s.number}</p>
              <p className="text-[12px] text-slate-500">{tr("Gross {{gross}} · commission {{commission}} · net {{net}}", { gross: money(s.grossAmount, s.currency), commission: money(s.commissionAmount, s.currency), net: money(s.netAmount, s.currency) })}</p>
            </div>
            <Button variant="outline" busy={busy === s.period} onClick={() => download(s.period, () => dmbExtraVendorAPI.settlementPdf(s.period), `Rozliczenie-${s.period}.pdf`)}><Download size={14} /> PDF</Button>
          </div>
        ))}
      </Card>
    </>
  );
}

/** Gap AD — VM-12 preferred delivery partner (admin approves; the pool is always the fallback). */
function DeliveryPartnerSection() {
  const { t: tr } = useTranslation("vendor");
  const { data, error, reload } = useLoad(() => dmbExtraVendorAPI.deliveryPartner(), []);
  const [form, setForm] = useState({ partnerName: "", contactName: "", contactPhone: "", contactEmail: "", entityType: "company", note: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ tone: "", text: "" });
  if (!data) return error ? <Notice tone="error">{error}</Notice> : <Spinner />;
  const dp = data.deliveryPartner;
  const pending = dp.request?.status === "pending";
  const submit = async () => {
    setBusy(true);
    setMsg({ tone: "", text: "" });
    try {
      await dmbExtraVendorAPI.requestDeliveryPartner(form);
      setMsg({ tone: "success", text: tr("Request sent. The platform will review it.") });
      await reload();
    } catch (err) {
      setMsg({ tone: "error", text: errorText(err, tr("Could not send the request")) });
    } finally {
      setBusy(false);
    }
  };
  const withdraw = async () => {
    setBusy(true);
    try {
      await dmbExtraVendorAPI.withdrawDeliveryPartner();
      await reload();
    } catch (err) {
      setMsg({ tone: "error", text: errorText(err, tr("Could not withdraw")) });
    } finally {
      setBusy(false);
    }
  };
  const input = "w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px]";
  return (
    <Card title={tr("Delivery partner")} subtitle={dp.partner ? tr("Your orders go first to {{name}}. Platform drivers take over if they can't.", { name: dp.partner.companyName }) : tr("Your orders are delivered by the platform's driver pool.")}>
      {msg.text && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!dp.enabled ? (
        <Notice tone="info">{tr("Choosing your own delivery partner is not available right now.")}</Notice>
      ) : pending ? (
        <>
          <Notice tone="info">{tr("Your request for {{name}} is waiting for approval.", { name: dp.request.partnerName })}</Notice>
          <Button variant="danger" busy={busy} onClick={withdraw}>{tr("Withdraw request")}</Button>
        </>
      ) : (
        <div className="space-y-2">
          {dp.request?.status === "rejected" && <Notice tone="warn">{tr("Your last request was not approved: {{reason}}", { reason: dp.request.rejectionReason || "—" })}</Notice>}
          <input className={input} value={form.partnerName} onChange={(e) => setForm({ ...form, partnerName: e.target.value })} placeholder={tr("Partner company or name")} />
          <div className="grid grid-cols-2 gap-2">
            <input className={input} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder={tr("Contact person")} />
            <input className={input} value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} placeholder={tr("Phone")} inputMode="tel" />
          </div>
          <input className={input} value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder={tr("E-mail")} inputMode="email" />
          <div className="flex gap-2">
            <Chip active={form.entityType === "company"} onClick={() => setForm({ ...form, entityType: "company" })}>{tr("Company")}</Chip>
            <Chip active={form.entityType === "individual_unregistered"} onClick={() => setForm({ ...form, entityType: "individual_unregistered" })}>{tr("Individual (unregistered)")}</Chip>
          </div>
          <textarea className={input} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={tr("Note for the platform (optional)")} maxLength={500} />
          <Button busy={busy} disabled={!form.partnerName.trim()} onClick={submit}>{tr("Send request")}</Button>
        </div>
      )}
    </Card>
  );
}

const ECO_TYPES = [
  ["biodegradable", tKey("Biodegradable")],
  ["recyclable", tKey("Recyclable")],
  ["paper", tKey("Paper / cardboard")],
  ["reusable", tKey("Reusable containers")],
];

/** Gap AI — eco packaging declaration (admin verifies when ACM-176 requires it). */
function EcoSection() {
  const { t: tr } = useTranslation("vendor");
  const { data, error, setData } = useLoad(() => dmbExtraVendorAPI.ecoPackaging(), []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ tone: "", text: "" });
  if (!data) return error ? <Notice tone="error">{error}</Notice> : <Spinner />;
  const eco = data.ecoPackaging || {};
  const save = async (patch) => {
    setBusy(true);
    setMsg({ tone: "", text: "" });
    try {
      const res = await dmbExtraVendorAPI.saveEcoPackaging({ enabled: eco.enabled, type: eco.type, photoUrl: eco.photoUrl, ...patch });
      setData((d) => ({ ...d, ...res.data }));
      setMsg({ tone: "success", text: tr("Saved") });
    } catch (err) {
      setMsg({ tone: "error", text: errorText(err, tr("Could not save")) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={tr("Eco packaging")} subtitle={data.badgeVisible ? tr("Your eco badge is shown to customers.") : eco.enabled && data.verificationRequired ? tr("Waiting for the platform to verify your packaging.") : tr("Declare eco-friendly packaging to get the badge.")}>
      {msg.text && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex gap-2">
        <Chip active={!eco.enabled} onClick={() => save({ enabled: false })}>{tr("Standard packaging")}</Chip>
        <Chip active={eco.enabled} onClick={() => setData((d) => ({ ...d, ecoPackaging: { ...eco, enabled: true, type: eco.type || "biodegradable" } }))}>{tr("Eco packaging")}</Chip>
      </div>
      {eco.enabled && (
        <>
          <div className="flex flex-wrap gap-2">
            {ECO_TYPES.map(([k, label]) => <Chip key={k} active={eco.type === k} onClick={() => setData((d) => ({ ...d, ecoPackaging: { ...eco, type: k } }))}>{tr(label)}</Chip>)}
          </div>
          {eco.photoUrl && <img src={eco.photoUrl} alt="" className="w-24 h-24 rounded-xl object-cover" />}
          <UploadButton folder="eco-packaging" label={tr("Photo of your packaging")} onUploaded={(u) => setData((d) => ({ ...d, ecoPackaging: { ...eco, photoUrl: u } }))} />
          <Button busy={busy} onClick={() => save({ enabled: true })}>{tr("Save declaration")}</Button>
        </>
      )}
    </Card>
  );
}

/** Gap AJ — which weekdays the vendor cooks (weekend only where the admin opened it, ACM-177). */
function DeliveryDaysSection() {
  const { t: tr } = useTranslation("vendor");
  const names = useDayNames();
  const { data, error, setData } = useLoad(() => dmbExtraVendorAPI.deliveryDays(), []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ tone: "", text: "" });
  if (!data) return error ? <Notice tone="error">{error}</Notice> : <Spinner />;
  const days = data.deliveryWeekdays || [];
  const open = (d) => (d === 6 ? data.weekendOpen?.saturday : d === 0 ? data.weekendOpen?.sunday : true);
  const toggle = (d) => setData((x) => ({ ...x, deliveryWeekdays: days.includes(d) ? days.filter((y) => y !== d) : [...days, d] }));
  const save = async () => {
    setBusy(true);
    setMsg({ tone: "", text: "" });
    try {
      const res = await dmbExtraVendorAPI.saveDeliveryDays(days);
      setData((x) => ({ ...x, ...res.data }));
      setMsg({ tone: "success", text: tr("Delivery days saved") });
    } catch (err) {
      setMsg({ tone: "error", text: errorText(err, tr("Could not save")) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={tr("Delivery days")} subtitle={tr("Customers can only subscribe to you on these days.")}>
      {msg.text && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex flex-wrap gap-2">
        {WEEK.map((d) => <Chip key={d} active={days.includes(d)} disabled={!open(d)} onClick={() => toggle(d)}>{names[d]}</Chip>)}
      </div>
      {(!data.weekendOpen?.saturday || !data.weekendOpen?.sunday) && <p className="text-[12px] text-slate-500">{tr("Weekend delivery is not open in your city yet.")}</p>}
      <Button busy={busy} disabled={!days.length} onClick={save}>{tr("Save")}</Button>
    </Card>
  );
}

const SPECIALISM_LABELS = { hashimoto: tKey("Hashimoto's"), pregnancy: tKey("Pregnancy"), low_gi: tKey("Low GI / diabetes"), menopause: tKey("Menopause") };

/** Gap AH — apply for a dietitian-certified specialism badge (admin reviews; expires after ACM-175 months). */
function SpecialismsSection() {
  const { t: tr } = useTranslation("vendor");
  const { data, error, reload } = useLoad(() => dmbExtraVendorAPI.specialisms(), []);
  const [form, setForm] = useState({ specialism: "", dietitianName: "", documentUrl: "", samplePlanUrl: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ tone: "", text: "" });
  if (!data) return error ? <Notice tone="error">{error}</Notice> : <Spinner />;
  const label = (k) => (SPECIALISM_LABELS[k] ? tr(SPECIALISM_LABELS[k]) : k);
  const submit = async () => {
    setBusy(true);
    setMsg({ tone: "", text: "" });
    try {
      await dmbExtraVendorAPI.applySpecialism(form);
      setMsg({ tone: "success", text: tr("Application sent for review") });
      setForm({ specialism: "", dietitianName: "", documentUrl: "", samplePlanUrl: "", notes: "" });
      await reload();
    } catch (err) {
      setMsg({ tone: "error", text: errorText(err, tr("Could not send the application")) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Card title={tr("Your specialisms")}>
        {(data.specialisms || []).length === 0 && <p className="text-[13px] text-slate-500">{tr("None yet.")}</p>}
        {(data.specialisms || []).map((s) => (
          <div key={`${s.specialism}-${s.appliedAt}`} className="flex justify-between text-[13px] border-b border-slate-100 py-2">
            <span className="font-bold">{label(s.specialism)}</span>
            <span className={s.status === "approved" ? "text-emerald-700 font-bold" : s.status === "rejected" ? "text-red-700 font-bold" : "text-amber-700 font-bold"}>
              {s.status === "approved" ? tr("Approved until {{date}}", { date: fmt(s.expiryDate, { day: "numeric", month: "short", year: "numeric" }) }) : s.status === "rejected" ? tr("Rejected") : s.status === "expired" ? tr("Expired") : tr("In review")}
            </span>
          </div>
        ))}
      </Card>
      {data.open ? (
        <Card title={tr("Apply for a specialism")} subtitle={tr("You need a written collaboration with a certified dietitian.")}>
          {msg.text && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <div className="flex flex-wrap gap-2">
            {(data.options || []).map((k) => <Chip key={k} active={form.specialism === k} onClick={() => setForm({ ...form, specialism: k })}>{label(k)}</Chip>)}
          </div>
          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px]" value={form.dietitianName} onChange={(e) => setForm({ ...form, dietitianName: e.target.value })} placeholder={tr("Dietitian's name")} />
          <div className="flex flex-wrap gap-3 items-center">
            <UploadButton pdf folder="specialisms" label={form.documentUrl ? tr("Document uploaded ✓") : tr("Collaboration document")} onUploaded={(u) => setForm((f) => ({ ...f, documentUrl: u }))} />
            <UploadButton pdf folder="specialisms" label={form.samplePlanUrl ? tr("Sample plan uploaded ✓") : tr("Sample meal plan (optional)")} onUploaded={(u) => setForm((f) => ({ ...f, samplePlanUrl: u }))} />
          </div>
          <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={tr("Notes (optional)")} maxLength={500} />
          <Button busy={busy} disabled={!form.specialism || !form.documentUrl} onClick={submit}>{tr("Send application")}</Button>
        </Card>
      ) : (
        <Notice tone="info">{tr("Specialism applications are closed at the moment.")}</Notice>
      )}
    </>
  );
}

/** Gap P — Pantry bags the driver could not deliver and brought back to the shop. */
function PantryReturnsSection() {
  const { t: tr } = useTranslation("vendor");
  const [status, setStatus] = useState("returned_to_shop");
  const { data, error, reload } = useLoad(() => dmbExtraVendorAPI.pantryReturns({ status }), [status]);
  const [busy, setBusy] = useState("");
  const [rowError, setRowError] = useState("");
  const restock = async (id) => {
    setBusy(id);
    setRowError("");
    try {
      await dmbExtraVendorAPI.restockReturn(id);
      await reload();
    } catch (err) {
      setRowError(errorText(err, tr("Could not update")));
    } finally {
      setBusy("");
    }
  };
  return (
    <Card title={tr("Returned bags")} subtitle={tr("Check the items and put them back into stock.")}>
      <div className="flex gap-2">
        <Chip active={status === "returned_to_shop"} onClick={() => setStatus("returned_to_shop")}>{tr("To check")}</Chip>
        <Chip active={status === "restocked"} onClick={() => setStatus("restocked")}>{tr("Restocked")}</Chip>
      </div>
      {rowError && <Notice tone="error">{rowError}</Notice>}
      {!data ? (
        error ? <Notice tone="error">{error}</Notice> : <Spinner />
      ) : (data.returns || []).length === 0 ? (
        <p className="text-[13px] text-slate-500">{tr("Nothing here.")}</p>
      ) : (
        data.returns.map((r) => (
          <div key={r.deliveryId} className="border border-slate-200 rounded-xl p-3 space-y-1">
            <p className="font-bold text-[13px]">{r.orderId} · {fmt(r.date)} · {r.driverName}</p>
            <p className="text-[12px] text-slate-600">{r.items.map((i) => `${i.title} ×${i.quantity}`).join(", ")}</p>
            {r.returnStatus === "returned_to_shop" ? (
              <Button variant="outline" busy={busy === r.deliveryId} onClick={() => restock(r.deliveryId)}>{tr("Mark as restocked")}</Button>
            ) : (
              <p className="text-[12px] text-emerald-700 font-bold">{tr("Restocked {{date}}", { date: fmt(r.restockedAt) })}</p>
            )}
          </div>
        ))
      )}
    </Card>
  );
}
