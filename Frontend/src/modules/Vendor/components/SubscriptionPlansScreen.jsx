import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Edit2, Trash2, Loader2, X, Award } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { dmbVendorAPI } from '../../../services/api';

const EMPTY = { name: '', duration: 'week', deliveryDays: 'full_week', discountPercent: '', description: '' };

/**
 * Vendor > Profile > My Subscription Plans. The vendor decides which plans (duration, delivery days, discount) customers can
 * buy from this kitchen. VAT and the platform fee are platform terms and are added by the system.
 */
export default function SubscriptionPlansScreen() {
  const { t } = useTranslation('vendor');
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, error: '', plans: [] });
  const [form, setForm] = useState(null); // null = closed, else { _id?, ...fields }
  const [saving, setSaving] = useState(false);

  const load = () => dmbVendorAPI.getSubscriptionPlans()
    .then((res) => setState({ loading: false, error: '', plans: res.data?.plans || [] }))
    .catch((err) => setState({ loading: false, error: err.response?.data?.message || t('Failed to load your plans.'), plans: [] }));

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/vendor/profile', { replace: true }));
  const durationLabel = (d) => (d === 'day' ? t('Daily') : d === 'week' ? t('Weekly') : t('Monthly'));
  const daysLabel = (d) => (d === 'mon_fri' ? t('Monday–Friday') : t('Full week'));
  const locked = Boolean(form?._id && (state.plans.find((p) => p._id === form._id)?.subscribers || 0) > 0);

  const save = async () => {
    const body = {
      name: form.name,
      duration: form.duration,
      deliveryDays: form.deliveryDays,
      discountPercent: form.discountPercent === '' ? 0 : Number(form.discountPercent),
      description: form.description
    };
    setSaving(true);
    try {
      if (form._id) await dmbVendorAPI.updateSubscriptionPlan(form._id, body);
      else await dmbVendorAPI.createSubscriptionPlan(body);
      toast.success(t('Plan saved'));
      setForm(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || t('Could not save the plan'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (p) => {
    try {
      await dmbVendorAPI.updateSubscriptionPlan(p._id, { status: p.status === 'active' ? 'inactive' : 'active' });
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || t('Could not update the plan'));
    }
  };

  const remove = async (p) => {
    if (!window.confirm(t('Delete this plan? If customers already used it, it is only switched off.'))) return;
    try {
      const res = await dmbVendorAPI.deleteSubscriptionPlan(p._id);
      toast.success(res.data?.archived ? t('Plan switched off (customers have used it)') : t('Plan deleted'));
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || t('Could not delete the plan'));
    }
  };

  const input = 'w-full h-11 px-3 rounded-lg border border-outline-variant text-[13px] bg-white outline-none focus:border-primary';

  return (
    <div className="pb-24 px-4 pt-4 max-w-xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={goBack} className="p-1 rounded-full hover:bg-slate-100 active:scale-95" aria-label={t('Go back')}>
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <h1 className="text-[18px] font-extrabold text-primary flex items-center gap-2 flex-1">
          <Award className="w-5 h-5" /> {t('My Subscription Plans')}
        </h1>
        <button onClick={() => setForm({ ...EMPTY })} className="h-9 px-3 rounded-lg bg-primary text-on-primary text-[12px] font-bold flex items-center gap-1 active:scale-95">
          <Plus className="w-4 h-4" /> {t('New plan')}
        </button>
      </div>
      <p className="text-[12px] text-slate-500 mb-4">
        {t('Customers can subscribe to your kitchen only through the plans you create here. The food price comes from your meal prices; VAT and the platform fee are added automatically.')}
      </p>

      {state.loading ? (
        <div className="flex justify-center py-16 text-primary"><Loader2 className="animate-spin w-7 h-7" /></div>
      ) : state.error ? (
        <p className="text-center text-sm text-red-500 py-10">{state.error}</p>
      ) : state.plans.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-12">{t('You have no plans yet. Create one so customers can subscribe to you.')}</p>
      ) : (
        <ul className="space-y-3">
          {state.plans.map((p) => (
            <li key={p._id} className={`bg-white rounded-2xl border border-slate-100 shadow-xs p-4 ${p.status === 'active' ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-[14px] text-slate-900">{p.name}</p>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    {durationLabel(p.duration)} · {daysLabel(p.deliveryDays)}
                    {Number(p.discountPercent) > 0 ? ` · ${t('{{pct}}% discount', { pct: p.discountPercent })}` : ''}
                  </p>
                  {p.description ? <p className="text-[12px] text-slate-400 mt-1">{p.description}</p> : null}
                  <p className="text-[11px] text-slate-400 mt-1">{t('Active subscribers: {{n}}', { n: p.subscribers || 0 })}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setForm({ _id: p._id, name: p.name, duration: p.duration, deliveryDays: p.deliveryDays, discountPercent: p.discountPercent || '', description: p.description || '' })} className="p-2 rounded-full hover:bg-slate-100" aria-label={t('Edit')}><Edit2 className="w-4 h-4 text-slate-600" /></button>
                  <button onClick={() => remove(p)} className="p-2 rounded-full hover:bg-red-50" aria-label={t('Delete')}><Trash2 className="w-4 h-4 text-red-500" /></button>
                </div>
              </div>
              <button onClick={() => toggle(p)} className={`mt-3 text-[11px] font-bold px-3 py-1 rounded-full ${p.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                {p.status === 'active' ? t('Offered to customers') : t('Switched off')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {form && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center" onClick={() => !saving && setForm(null)}>
          <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-bold text-on-surface">{form._id ? t('Edit plan') : t('New plan')}</h2>
              <button onClick={() => setForm(null)} aria-label={t('Close')}><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-outline">{t('Plan name')}
              <input className={`${input} mt-1`} value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('e.g. Weekly lunch')} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-outline">{t('Duration')}
                <select className={`${input} mt-1`} value={form.duration} disabled={locked} onChange={(e) => setForm({ ...form, duration: e.target.value })}>
                  <option value="day">{t('Daily')}</option>
                  <option value="week">{t('Weekly')}</option>
                  <option value="month">{t('Monthly')}</option>
                </select>
              </label>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-outline">{t('Delivery days')}
                <select className={`${input} mt-1`} value={form.deliveryDays} disabled={locked} onChange={(e) => setForm({ ...form, deliveryDays: e.target.value })}>
                  <option value="full_week">{t('Full week')}</option>
                  <option value="mon_fri">{t('Monday–Friday')}</option>
                </select>
              </label>
            </div>
            {locked && <p className="text-[11px] text-amber-700">{t('Customers are subscribed to this plan, so its duration and delivery days cannot change.')}</p>}
            <label className="block text-[11px] font-bold uppercase tracking-wider text-outline">{t('Discount on food (%)')}
              <input className={`${input} mt-1`} type="number" min="0" max="50" step="0.5" value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} placeholder="0" />
            </label>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-outline">{t('Description (optional)')}
              <textarea className={`${input} mt-1 h-20 py-2 resize-none`} value={form.description} maxLength={500} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <button onClick={save} disabled={saving || !form.name.trim()} className="w-full h-12 rounded-xl bg-primary text-on-primary font-bold text-[14px] disabled:opacity-50 active:scale-95">
              {saving ? t('Saving...') : t('Save plan')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
