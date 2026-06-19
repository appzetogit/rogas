import { useState, useEffect, useCallback } from "react";
import { Link2, Plus, Save, Trash2, Eye, EyeOff } from "lucide-react";
import { adminClient } from "@food/api/axios";

const INTEGRATION_TYPES = [
  { value: "payment_gateway", label: "Payment Gateway", icon: "ðŸ’³", fields: [
    { key: "provider", label: "Provider", type: "select", options: ["stripe", "przelewy24", "payu", "blik", "other"] },
    { key: "apiKey", label: "API Key", type: "secret" },
    { key: "secretKey", label: "Secret Key", type: "secret" },
    { key: "webhookSecret", label: "Webhook Secret", type: "secret" },
    { key: "testMode", label: "Test Mode", type: "toggle" },
  ]},
  { value: "sms_provider", label: "SMS Provider", icon: "ðŸ“±", fields: [
    { key: "provider", label: "Provider", type: "select", options: ["twilio", "smsapi", "messagebird", "other"] },
    { key: "apiKey", label: "API Key", type: "secret" },
    { key: "senderId", label: "Sender ID", type: "text" },
  ]},
  { value: "email_provider", label: "Email Provider", icon: "ðŸ“§", fields: [
    { key: "provider", label: "Provider", type: "select", options: ["sendgrid", "mailgun", "ses", "smtp"] },
    { key: "apiKey", label: "API Key", type: "secret" },
    { key: "fromEmail", label: "From Email", type: "text" },
    { key: "fromName", label: "From Name", type: "text" },
  ]},
  { value: "maps_provider", label: "Maps Provider", icon: "ðŸ—ºï¸", fields: [
    { key: "provider", label: "Provider", type: "select", options: ["google_maps", "mapbox", "here"] },
    { key: "apiKey", label: "API Key", type: "secret" },
    { key: "geocodingEnabled", label: "Geocoding", type: "toggle" },
  ]},
  { value: "push_notifications", label: "Push Notifications", icon: "ðŸ””", fields: [
    { key: "provider", label: "Provider", type: "select", options: ["firebase_fcm", "onesignal", "expo"] },
    { key: "apiKey", label: "API Key / Server Key", type: "secret" },
    { key: "appId", label: "App ID", type: "text" },
  ]},
  { value: "analytics", label: "Analytics", icon: "ðŸ“Š", fields: [
    { key: "provider", label: "Provider", type: "select", options: ["google_analytics", "mixpanel", "amplitude", "other"] },
    { key: "trackingId", label: "Tracking ID", type: "text" },
    { key: "apiKey", label: "API Key", type: "secret" },
  ]},
];

function IntegrationCard({ integration, onSaved, onDelete }) {
  const typeDef = INTEGRATION_TYPES.find(t => t.value === integration.integrationType) || INTEGRATION_TYPES[0];
  const [form, setForm] = useState({ ...integration.config });
  const [visible, setVisible] = useState({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const setF = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const toggleVisible = (k) => setVisible(prev => ({ ...prev, [k]: !prev[k] }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminClient.put("/food/admin/integrations", { integrationType: integration.integrationType, config: form, isEnabled: integration.isEnabled });
      if (res?.data?.success) { onSaved(res.data.data.integration); setFeedback("Saved"); setTimeout(() => setFeedback(""), 2000); }
    } catch (e) { setFeedback("Error"); setTimeout(() => setFeedback(""), 2000); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800">
        <span className="text-xl">{typeDef.icon}</span>
        <div className="flex-1">
          <h3 className="font-bold text-white">{typeDef.label}</h3>
          <p className="text-xs text-gray-500 capitalize">{form.provider || "Not configured"}</p>
        </div>
        <div className="flex items-center gap-3">
          {feedback && (
            <span className={"text-xs font-bold px-2 py-0.5 rounded-full " + (feedback === "Saved" ? "text-green-400 bg-green-900/40" : "text-red-400 bg-red-900/40")}>
              {feedback}
            </span>
          )}
          <div
            onClick={() => onSaved({ ...integration, isEnabled: !integration.isEnabled })}
            className={"w-10 h-5 rounded-full transition relative cursor-pointer " + (integration.isEnabled ? "bg-green-600" : "bg-gray-700")}
          >
            <div className={"absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all " + (integration.isEnabled ? "left-5" : "left-0.5")} />
          </div>
          <span className={"text-xs font-bold " + (integration.isEnabled ? "text-green-400" : "text-gray-500")}>
            {integration.isEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>
      </div>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {typeDef.fields.map(field => {
          if (field.type === "toggle") {
            return (
              <div key={field.key} className="flex items-center gap-3">
                <div
                  onClick={() => setF(field.key, !form[field.key])}
                  className={"w-10 h-5 rounded-full transition relative cursor-pointer " + (form[field.key] ? "bg-blue-600" : "bg-gray-700")}
                >
                  <div className={"absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all " + (form[field.key] ? "left-5" : "left-0.5")} />
                </div>
                <span className="text-sm text-gray-300">{field.label}</span>
              </div>
            );
          }
          if (field.type === "select") {
            return (
              <div key={field.key}>
                <label className="block text-xs text-gray-400 mb-1">{field.label}</label>
                <select value={form[field.key] || ""} onChange={e => setF(field.key, e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select...</option>
                  {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            );
          }
          const isSecret = field.type === "secret";
          return (
            <div key={field.key}>
              <label className="block text-xs text-gray-400 mb-1">{field.label}</label>
              <div className="relative">
                <input
                  type={isSecret && !visible[field.key] ? "password" : "text"}
                  value={form[field.key] || ""}
                  onChange={e => setF(field.key, e.target.value)}
                  placeholder={isSecret ? "â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" : ""}
                  className="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600 pr-9"
                />
                {isSecret && (
                  <button type="button" onClick={() => toggleVisible(field.key)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {visible[field.key] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-5 pb-4 flex justify-end gap-2">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 text-sm disabled:opacity-50">
          {saving ? <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>
    </div>
  );
}

export default function IntegrationSettings() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addType, setAddType] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminClient.get("/food/admin/integrations");
      if (res?.data?.success) setIntegrations(res.data.data.integrations || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addIntegration = async () => {
    if (!addType) return;
    try {
      const res = await adminClient.put("/food/admin/integrations", { integrationType: addType, config: {}, isEnabled: false });
      if (res?.data?.success) {
        setIntegrations(prev => {
          const exists = prev.find(i => i.integrationType === addType);
          if (exists) return prev.map(i => i.integrationType === addType ? res.data.data.integration : i);
          return [...prev, res.data.data.integration];
        });
        setAddType("");
      }
    } catch (e) { console.error(e); }
  };

  const onSaved = (updated) => {
    setIntegrations(prev => prev.map(i => i.integrationType === updated.integrationType ? updated : i));
  };

  const configuredTypes = integrations.map(i => i.integrationType);
  const availableToAdd = INTEGRATION_TYPES.filter(t => !configuredTypes.includes(t.value));

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
              <Link2 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Integration Settings</h1>
              <p className="text-sm text-gray-400">Payment, SMS, email, maps and push notification providers</p>
            </div>
          </div>
          {availableToAdd.length > 0 && (
            <div className="flex gap-2">
              <select value={addType} onChange={e => setAddType(e.target.value)}
                className="px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Add integration...</option>
                {availableToAdd.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
              </select>
              <button onClick={addIntegration} disabled={!addType}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 text-sm disabled:opacity-50">
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-6 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : integrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Link2 className="w-12 h-12 mb-3" />
            <p className="font-semibold">No integrations configured</p>
            <p className="text-sm mt-1">Use the dropdown above to add your first integration</p>
          </div>
        ) : (
          integrations.map(integration => (
            <IntegrationCard key={integration.integrationType} integration={integration} onSaved={onSaved} />
          ))
        )}
      </div>
    </div>
  );
}
