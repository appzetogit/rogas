import { useState, useEffect } from "react";
import { ArrowLeft, Clock, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import useDeliverySlots, { to12h } from '../../../shared/hooks/useDeliverySlots';

const MyShiftsView = ({ onGoBack }) => {
  const [currentShifts, setCurrentShifts] = useState([]);
  const [activeRequest, setActiveRequest] = useState(null);
  const [selectedShifts, setSelectedShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchShiftData();
  }, []);

  const fetchShiftData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('delivery_accessToken');
      const response = await fetch('/api/v1/food/delivery/shift-request/active', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setCurrentShifts(data.data?.currentShifts || []);
        setActiveRequest(data.data?.request || null);
        if (!data.data?.request) {
           setSelectedShifts(data.data?.currentShifts || []);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load shift data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (selectedShifts.length === 0) {
      toast.error('Please select at least one shift');
      return;
    }
    try {
      setSubmitting(true);
      const token = localStorage.getItem('delivery_accessToken');
      const response = await fetch('/api/v1/food/delivery/shift-request', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requestedShifts: selectedShifts })
      });
      const data = await response.json();
      if (data.success) {
        toast.success('Shift change requested successfully');
        fetchShiftData();
      } else {
        toast.error(data.message || 'Failed to request shift change');
      }
    } catch (err) {
      console.error(err);
      toast.error('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleShift = (shift) => {
    if (selectedShifts.includes(shift)) {
      setSelectedShifts(selectedShifts.filter(s => s !== shift));
    } else {
      setSelectedShifts([...selectedShifts, shift]);
    }
  };

  const { slots: liveSlots, enabledSlots: selectableSlots, window: slotWin } = useDeliverySlots();
  const availableShifts = selectableSlots.map((s) => ({ id: s.key, label: `${s.name} (${slotWin(s.key)})` }));

  if (loading) {
    return <div className="p-8 text-center text-[#2b2b2b] bg-[#f5f5f0] min-h-screen">Loading...</div>;
  }

  return (
    <div className="space-y-4 pb-20 animate-fadeIn text-[#2b2b2b] bg-[#f5f5f0] min-h-screen p-4">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onGoBack} className="p-2 bg-white rounded-full shadow-sm text-[#1f7a63]">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold">Change Shifts</h2>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#e0e3e0]">
        <h3 className="font-bold text-[#1f7a63] flex items-center gap-2 mb-3">
          <Clock className="w-5 h-5" /> Current Shifts
        </h3>
        {currentShifts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {currentShifts.map(s => (
              <span key={s} className="px-3 py-1 bg-[#1f7a63]/10 text-[#1f7a63] rounded-full text-sm font-semibold capitalize">
                {liveSlots.find(x => x.key === s)?.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#5d5f5b]">No shifts assigned currently.</p>
        )}
      </div>

      {activeRequest ? (
        <div className="bg-[#fff9e6] border border-[#ffe082] rounded-2xl p-5 shadow-sm mt-4">
          <div className="flex gap-3">
            <AlertCircle className="w-6 h-6 text-[#f57c00] shrink-0" />
            <div>
              <h4 className="font-bold text-[#f57c00]">Pending Request</h4>
              <p className="text-sm text-[#795548] mt-1">You have requested to change your shifts to:</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {activeRequest.requestedShifts.map(s => (
                  <span key={s} className="px-3 py-1 bg-white border border-[#f57c00]/30 text-[#f57c00] rounded-full text-xs font-semibold capitalize">
                    {s}
                  </span>
                ))}
              </div>
              <p className="text-xs text-[#795548] mt-4 opacity-80">Waiting for admin approval...</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#e0e3e0] mt-4">
          <h3 className="font-bold text-[#2b2b2b] mb-4">Select New Shifts</h3>
          <div className="space-y-3">
            {availableShifts.map(shift => {
              const isSelected = selectedShifts.includes(shift.id);
              return (
                <div 
                  key={shift.id} 
                  onClick={() => toggleShift(shift.id)}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                    isSelected ? 'border-[#1f7a63] bg-[#1f7a63]/5' : 'border-transparent bg-[#f5f5f0]'
                  }`}
                >
                  <span className={`font-semibold ${isSelected ? 'text-[#1f7a63]' : 'text-[#2b2b2b]'}`}>
                    {shift.label}
                  </span>
                  {isSelected && <CheckCircle2 className="w-5 h-5 text-[#1f7a63]" />}
                </div>
              );
            })}
          </div>

          <button 
            onClick={handleSubmit} 
            disabled={submitting}
            className="mt-6 w-full py-3.5 bg-[#1f7a63] text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {submitting ? 'Submitting...' : (
              <>
                <Send className="w-4 h-4" /> Request Change
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export { MyShiftsView };
