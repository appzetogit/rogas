import React, { useEffect, useState } from 'react';
import { ArrowLeft, CalendarCheck, Clock, Loader2 } from 'lucide-react';
import { dmbDeliveryAPI } from '@food/api';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../hooks/useDeliveryBackNavigation';
import { useTranslation } from 'react-i18next';

const STATUS_STYLE = {
  scheduled: { dot: 'bg-gray-300', text: 'text-gray-600', bg: 'bg-gray-50' },
  confirmed: { dot: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50' },
  completed: { dot: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50' },
  no_show: { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' }
};

const formatDate = (d) => new Date(d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * ShiftsV2 - Driver's own shift schedule + attendance history (DA-11).
 * Upcoming shifts can be confirmed; past shifts show as Completed or No-show.
 */
export const ShiftsV2 = () => {
  const { t } = useTranslation('driver');
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState([]);
  const [confirmingId, setConfirmingId] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await dmbDeliveryAPI.getShifts();
      setShifts(res?.data?.data?.shifts || []);
    } catch (err) {
      toast.error(t('Could not load your shifts'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleConfirm = async (shift) => {
    try {
      setConfirmingId(shift._id);
      await dmbDeliveryAPI.confirmShift(shift._id);
      setShifts((prev) => prev.map((s) => (s._id === shift._id ? { ...s, status: 'confirmed', confirmedAt: new Date().toISOString() } : s)));
      toast.success(t('Shift confirmed'));
    } catch (err) {
      toast.error(err?.response?.data?.message || t('Could not confirm this shift'));
    } finally {
      setConfirmingId(null);
    }
  };

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcoming = shifts.filter((s) => new Date(s.date) >= today && (s.status === 'scheduled' || s.status === 'confirmed'));
  const history = shifts.filter((s) => s.status === 'completed' || s.status === 'no_show');

  const statusLabel = (status) => {
    switch (status) {
      case 'confirmed': return t('Confirmed');
      case 'completed': return t('Completed');
      case 'no_show': return t('No-show');
      default: return t('Upcoming');
    }
  };

  const ShiftRow = ({ shift, showConfirm }) => {
    const style = STATUS_STYLE[shift.status] || STATUS_STYLE.scheduled;
    return (
      <div className="bg-white rounded-xl p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-full bg-gray-50 p-2.5 shrink-0 text-lg leading-none">{shift.slot?.icon || '🕐'}</div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#2B2B2B] truncate">{shift.slot?.name || shift.slotKey}</p>
            <p className="text-xs text-gray-500 font-medium">
              {formatDate(shift.date)}{shift.slot?.startTime ? ` • ${shift.slot.startTime}-${shift.slot.endTime}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${style.bg} ${style.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            {statusLabel(shift.status)}
          </span>
          {showConfirm && shift.status === 'scheduled' && (
            <button
              onClick={() => handleConfirm(shift)}
              disabled={confirmingId === shift._id}
              className="bg-[#1F7A63] text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-60"
            >
              {confirmingId === shift._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('Confirm')}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-full bg-transparent font-poppins pb-32">
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 flex items-center gap-4 z-10">
        <button onClick={goBack} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-[#2B2B2B] leading-none">{t('My Shifts')}</h1>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">{t('Loading shifts...')}</p>
        </div>
      ) : (
        <div className="px-4 py-6 space-y-6">
          <div>
            <h3 className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mb-3 px-1 flex items-center gap-1.5">
              <CalendarCheck className="w-3.5 h-3.5" /> {t('Upcoming')}
            </h3>
            {upcoming.length === 0 ? (
              <div className="bg-white rounded-xl p-6 text-center">
                <p className="text-sm text-gray-400 font-medium">{t('No upcoming shifts yet')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {upcoming.map((s) => <ShiftRow key={s._id} shift={s} showConfirm />)}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mb-3 px-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> {t('History')}
            </h3>
            {history.length === 0 ? (
              <div className="bg-white rounded-xl p-6 text-center">
                <p className="text-sm text-gray-400 font-medium">{t('No past shifts yet')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((s) => <ShiftRow key={s._id} shift={s} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftsV2;
