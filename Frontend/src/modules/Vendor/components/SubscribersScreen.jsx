import { useEffect, useState } from 'react';
import { ArrowLeft, Users, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { dmbVendorAPI } from '../../../services/api';

const planName = (s) =>
  s.mealPlanId?.name || (Array.isArray(s.meals) ? s.meals.map((m) => m.mealPlanId?.name).filter(Boolean).join(', ') : '') || '';

/** Vendor > Profile > My Subscribers: the customers who currently have an active subscription with this vendor. */
export default function SubscribersScreen() {
  const { t } = useTranslation('vendor');
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, error: '', list: [] });

  useEffect(() => {
    let cancelled = false;
    dmbVendorAPI.getSubscriberList()
      .then((res) => { if (!cancelled) setState({ loading: false, error: '', list: res.data?.subscribers || [] }); })
      .catch((err) => { if (!cancelled) setState({ loading: false, error: err.response?.data?.message || t('Failed to load subscribers.'), list: [] }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/vendor/profile', { replace: true }));
  const nameOf = (u) => u?.name || [u?.firstName, u?.lastName].filter(Boolean).join(' ') || t('Customer');

  return (
    <div className="pb-24 px-4 pt-4 max-w-xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={goBack} className="p-1 rounded-full hover:bg-slate-100 active:scale-95" aria-label={t('Go back')}>
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <h1 className="text-[18px] font-extrabold text-primary flex items-center gap-2">
          <Users className="w-5 h-5" /> {t('My Subscribers')}
        </h1>
      </div>

      {state.loading ? (
        <div className="flex justify-center py-16 text-primary"><Loader2 className="animate-spin w-7 h-7" /></div>
      ) : state.error ? (
        <p className="text-center text-sm text-red-500 py-10">{state.error}</p>
      ) : state.list.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-12">{t('No active subscribers yet.')}</p>
      ) : (
        <ul className="space-y-3">
          {state.list.map((s) => (
            <li key={s._id} className="bg-white rounded-2xl border border-slate-100 shadow-xs p-4">
              <p className="font-bold text-[14px] text-slate-900">{nameOf(s.userId)}</p>
              <p className="text-[12px] text-slate-500 mt-0.5">{[s.userId?.city, s.userId?.phone].filter(Boolean).join(' · ')}</p>
              {planName(s) && <p className="text-[12px] text-primary font-semibold mt-1">{planName(s)}</p>}
              {s.startDate && <p className="text-[11px] text-slate-400 mt-1">{t('Since {{date}}', { date: new Date(s.startDate).toLocaleDateString() })}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
