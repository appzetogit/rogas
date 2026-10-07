import React, { useState, useEffect } from "react";
import { adminAPI } from "@food/api";
import { toast } from "sonner";
import { Save, Loader2, Package } from "lucide-react";

export default function PantryDeliveryFee() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fee, setFee] = useState("0");

  useEffect(() => {
    (async () => {
      try {
        const res = await adminAPI.getPantryDeliveryFee();
        if (res.data?.success) setFee(String(res.data.data.deliveryFeePerDelivery ?? 0));
      } catch (err) {
        toast.error(err.response?.data?.message || "Failed to fetch the pantry delivery fee");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await adminAPI.updatePantryDeliveryFee({ deliveryFeePerDelivery: Number(fee) });
      if (res.data?.success) {
        setFee(String(res.data.data.deliveryFeePerDelivery));
        toast.success("Pantry delivery fee saved");
      } else {
        toast.error("Failed to save");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen w-full max-w-full overflow-x-hidden">
      <div className="w-full mx-auto max-w-3xl">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Pantry Delivery Fee</h1>
            <p className="text-sm text-slate-600">What customers pay to have a pantry bag delivered</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Delivery fee per delivery</label>
            <p className="text-sm text-slate-500 mb-2">
              Charged to the customer for every delivery day and slot of a pantry order (a bag delivered on 3 days in 2 slots is 6 deliveries).
              It is separate from the delivery boy's earning per order and from the meal delivery fee. Leave at 0 for free pantry delivery.
            </p>
            <input
              type="number"
              min="0"
              step="0.01"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </form>
      </div>
    </div>
  );
}
