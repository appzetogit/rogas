import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, AlertTriangle, X } from 'lucide-react';
import { dmbVendorAPI } from '../../../services/api/index';

/**
 * Vendor "Delete account". It first asks the server what still blocks deletion (live subscribers, orders still to be
 * delivered, pantry bags, unpaid balance, pending withdrawals) — real counts, so a brand-new kitchen is never blocked.
 * Only when nothing blocks does it offer the permanent delete.
 */
export default function DeleteAccountDialog({ onClose, onDeleted }) {
  const { t } = useTranslation('vendor');
  const [step, setStep] = useState('checking'); // checking | blocked | confirm | deleting | error
  const [blockers, setBlockers] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    dmbVendorAPI.getAccountStatus()
      .then((res) => {
        if (!alive) return;
        const b = res.data?.blockers || [];
        setBlockers(b);
        setStep(b.length ? 'blocked' : 'confirm');
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.response?.data?.message || t('Could not check your account. Please try again.'));
        setStep('error');
      });
    return () => { alive = false; };
  }, [t]);

  const describe = (b) => {
    switch (b.code) {
      case 'SUBSCRIBERS': return t('Active or paused subscribers: {{count}}', { count: b.count });
      case 'OPEN_ORDERS': return t('Orders still to be prepared or delivered: {{count}}', { count: b.count });
      case 'OPEN_PANTRY': return t('Pantry orders with bags still to deliver: {{count}}', { count: b.count });
      case 'BALANCE': return t('You still have an unpaid balance. Withdraw it first.');
      case 'WITHDRAWALS': return t('Pending withdrawal requests: {{count}}', { count: b.count });
      default: return b.message;
    }
  };

  const remove = async () => {
    setStep('deleting');
    try {
      await dmbVendorAPI.deleteAccount();
      onDeleted();
    } catch (err) {
      const b = err.response?.data?.blockers;
      if (b?.length) { setBlockers(b); setStep('blocked'); return; }
      setError(err.response?.data?.message || t('Could not delete the account. Please try again.'));
      setStep('error');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={step === 'deleting' ? undefined : onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-[16px] font-extrabold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-error" /> {t('Delete Account')}
          </h2>
          {step !== 'deleting' && (
            <button type="button" onClick={onClose} aria-label={t('Close')} className="p-1 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
          )}
        </div>

        {step === 'checking' && (
          <p className="flex items-center gap-2 text-[13px] text-slate-500 py-4"><Loader2 className="w-4 h-4 animate-spin" /> {t('Checking your account…')}</p>
        )}

        {step === 'blocked' && (
          <>
            <p className="text-[13px] text-slate-700 mb-2 font-semibold">{t('Your account cannot be deleted yet. Clear these first:')}</p>
            <ul className="list-disc pl-5 space-y-1 text-[13px] text-slate-700 mb-4">
              {blockers.map((b) => <li key={b.code}>{describe(b)}</li>)}
            </ul>
            <button type="button" onClick={onClose} className="w-full py-3 rounded-xl bg-primary text-white font-bold text-[13px]">{t('Close')}</button>
          </>
        )}

        {step === 'confirm' && (
          <>
            <p className="text-[13px] text-slate-700 mb-4">{t('Nothing is pending, so you can delete your account. Your kitchen, meals and plans will be removed permanently. This cannot be undone.')}</p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-300 font-bold text-[13px]">{t('Cancel')}</button>
              <button type="button" onClick={remove} className="flex-1 py-3 rounded-xl bg-error text-white font-bold text-[13px]">{t('Delete my account')}</button>
            </div>
          </>
        )}

        {step === 'deleting' && (
          <p className="flex items-center gap-2 text-[13px] text-slate-500 py-4"><Loader2 className="w-4 h-4 animate-spin" /> {t('Deleting your account…')}</p>
        )}

        {step === 'error' && (
          <>
            <p className="text-[13px] text-error mb-4">{error}</p>
            <button type="button" onClick={onClose} className="w-full py-3 rounded-xl bg-primary text-white font-bold text-[13px]">{t('Close')}</button>
          </>
        )}
      </div>
    </div>
  );
}
