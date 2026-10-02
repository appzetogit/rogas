import { useMemo, useState } from "react";
import { Lock, RotateCcw } from "lucide-react";
import { dmbExtraAdminAPI } from "@food/api";
import { Page, Card, Btn, Badge, CitySelect, ErrorBox, inputCls, useLoad, useAction, fmtDateTime } from "./ui";

/**
 * AP-03 / AP-09 — Admin Controls Matrix (ACM-131 … ACM-183). The web app's equivalent of Firebase Remote Config: the
 * values are stored on the server, enforced by every API call, and the apps re-read them within 5 minutes.
 * City overrides apply where a control supports them; CITY_MANAGERs may only edit their own cities.
 */
export default function ControlsPage() {
  const [cityId, setCityId] = useState("");
  const [group, setGroup] = useState("visibility");
  const { data, error, reload } = useLoad(() => dmbExtraAdminAPI.controls(cityId), [cityId]);

  const groups = data?.groups || {};
  const controls = useMemo(() => (data?.controls || []).filter((c) => c.group === group), [data, group]);

  return (
    <Page
      title="Admin controls (ACM-131 – ACM-183)"
      subtitle="Feature switches for the customer, vendor and driver apps. Changes are saved on the server and reach open apps within 5 minutes — no app release needed. Every change is written to the audit log."
      actions={<CitySelect value={cityId} onChange={setCityId} />}
    >
      <ErrorBox error={error} />
      {cityId && <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">Editing overrides for one city. Controls marked “platform only” cannot be overridden per city.</div>}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(groups).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setGroup(key)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${group === key ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-slate-700 border-slate-200"}`}>
            {label}
          </button>
        ))}
      </div>
      {group === "visibility" && data && <VisibilityMatrix controls={controls} euLocked={data.euLocked || []} cityId={cityId} onSaved={reload} />}
      {group !== "visibility" && (
        <div className="space-y-3">
          {controls.map((c) => <ControlCard key={c.key} control={c} cityId={cityId} me={data?.me} onSaved={reload} />)}
        </div>
      )}
    </Page>
  );
}

const roleLabel = (roles = []) => ["Super Admin", ...roles.map((r) => r.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()))].join(", ");

function ControlCard({ control, cityId, me, onSaved }) {
  const { busy, run } = useAction();
  const current = cityId && control.perCity ? control.effectiveValue : control.platformValue;
  const [draft, setDraft] = useState(null);
  const value = draft || current || {};
  const dirty = draft && JSON.stringify(draft) !== JSON.stringify(current);
  const canEditCity = !cityId || control.perCity;
  const mayEdit = me?.adminRole === "SUPER_ADMIN" || (control.roles || []).includes(me?.adminRole);

  const save = () =>
    run("save", async () => {
      await dmbExtraAdminAPI.setControl(control.key, draft, cityId || undefined);
      setDraft(null);
      await onSaved();
    }, `${control.acm ? `ACM-${control.acm}` : control.key} saved`);
  const clearOverride = () =>
    run("clear", async () => {
      await dmbExtraAdminAPI.clearCityOverride(control.key, cityId);
      setDraft(null);
      await onSaved();
    }, "City override removed");

  return (
    <Card
      title={`${control.acm ? `ACM-${control.acm} · ` : ""}${control.label}`}
      subtitle={`Who can change: ${roleLabel(control.roles)}${control.perCity ? " · per city" : " · platform only"}${control.updatedAt ? ` · last change ${fmtDateTime(control.updatedAt)}${control.updatedByEmail ? ` by ${control.updatedByEmail}` : ""}` : ""}`}
      actions={
        <>
          {cityId && control.cityOverride && <Badge tone="blue">City override</Badge>}
          {cityId && control.cityOverride && <Btn size="sm" variant="ghost" busy={busy === "clear"} onClick={clearOverride}><RotateCcw className="w-3.5 h-3.5" /> Use platform value</Btn>}
        </>
      }
    >
      {!canEditCity ? (
        <p className="text-sm text-slate-500">This control applies platform-wide. Select “All cities” to change it.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {Object.entries(control.fields).map(([name, f]) => (
            <FieldEditor key={name} name={name} field={f} value={value[name]} disabled={!mayEdit} onChange={(v) => setDraft({ ...value, [name]: v })} />
          ))}
        </div>
      )}
      {canEditCity && (
        <div className="flex items-center justify-end gap-2 mt-4">
          {!mayEdit && <span className="text-xs text-slate-400">Your role cannot change this control.</span>}
          {dirty && <Btn variant="ghost" onClick={() => setDraft(null)}>Cancel</Btn>}
          <Btn disabled={!dirty || !mayEdit} busy={busy === "save"} onClick={save}>Save</Btn>
        </div>
      )}
    </Card>
  );
}

const nice = (name) => name.replace(/([A-Z])/g, " $1").replace(/^./, (m) => m.toUpperCase());

function FieldEditor({ name, field, value, onChange, disabled }) {
  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
        <input type="checkbox" className="w-5 h-5 accent-emerald-700" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        {name === "enabled" ? "Enabled" : nice(name)}
      </label>
    );
  }
  if (field.type === "number") {
    return (
      <label className="block space-y-1">
        <span className="text-xs font-semibold text-slate-600">{nice(name)}</span>
        <input type="number" className={inputCls} value={value ?? ""} min={field.min} max={field.max} step={field.step || 1} disabled={disabled} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
        {field.hint && <span className="block text-[11px] text-slate-400">{field.hint}</span>}
      </label>
    );
  }
  if (field.type === "enum") {
    return (
      <label className="block space-y-1">
        <span className="text-xs font-semibold text-slate-600">{nice(name)}</span>
        <select className={inputCls} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
        </select>
      </label>
    );
  }
  if (field.type === "multiselect") {
    const list = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-1 md:col-span-2">
        <span className="text-xs font-semibold text-slate-600">{nice(name)}</span>
        <div className="flex flex-wrap gap-1.5">
          {field.options.map((o) => (
            <button key={o} type="button" disabled={disabled} onClick={() => onChange(list.includes(o) ? list.filter((x) => x !== o) : [...list, o])} className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${list.includes(o) ? "bg-emerald-700 text-white border-emerald-700" : "bg-white border-slate-300 text-slate-700"}`}>
              {o.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-600">{nice(name)}</span>
      <input className={inputCls} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      {field.hint && <span className="block text-[11px] text-slate-400">{field.hint}</span>}
    </label>
  );
}

/** Gap O — who sees what: one row per item, one column per audience, EU-locked items shown with a lock. */
function VisibilityMatrix({ controls, euLocked, cityId, onSaved }) {
  const { busy, run } = useAction();
  const audiences = ["customer", "vendor", "driver", "fleet"];
  const toggle = (c) =>
    run(c.key, async () => {
      await dmbExtraAdminAPI.setControl(c.key, { enabled: !(cityId && c.perCity ? c.effectiveValue : c.platformValue)?.enabled }, cityId || undefined);
      await onSaved();
    }, `ACM-${c.acm} updated`);
  return (
    <Card title="Information visibility matrix (ACM-131 – ACM-145)" subtitle="Switch each piece of information on or off per app. Items required by EU law cannot be hidden.">
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {audiences.map((a) => (
          <div key={a} className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{a === "fleet" ? "Fleet partner" : a.charAt(0).toUpperCase() + a.slice(1)} app</h3>
            {controls.filter((c) => c.audience === a).map((c) => {
              const on = (cityId && c.perCity ? c.effectiveValue : c.platformValue)?.enabled;
              return (
                <button key={c.key} type="button" disabled={busy === c.key} onClick={() => toggle(c)} title={c.label} className={`w-full text-left rounded-xl border px-3 py-2 text-sm flex items-center justify-between gap-2 ${on ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                  <span>
                    <span className="block font-semibold text-slate-800">{c.item}</span>
                    <span className="block text-[11px] text-slate-500">ACM-{c.acm}</span>
                  </span>
                  <Badge tone={on ? "green" : "gray"}>{on ? "Visible" : "Hidden"}</Badge>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {euLocked.length > 0 && (
        <div className="mt-5 space-y-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Always visible (EU law)</h3>
          {euLocked.map((e) => (
            <p key={e.item} className="text-sm text-slate-600 flex items-start gap-2"><Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{e.item} <span className="text-[11px] text-slate-400">({e.audience}) — {e.citation}</span></span></p>
          ))}
        </div>
      )}
    </Card>
  );
}
