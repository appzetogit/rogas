import { useState } from "react";
import { ShoppingBag, Search, User } from "lucide-react";
import { adminClient } from "@food/api/axios";

export default function ManualOrderEntry() {
  const [form, setForm] = useState({
    customerId: "", restaurantId: "", items: [{ menuItemId: "", name: "", price: "", quantity: 1 }],
    deliveryAddress: { street: "", city: "", zipCode: "" },
    paymentMethod: "cash", note: ""
  });
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const searchCustomers = async () => {
    if (!customerSearch.trim()) return;
    try {
      const res = await adminClient.get("/food/admin/customers", { params: { search: customerSearch, limit: 5 } });
      if (res?.data?.success) setCustomers(res.data.data.customers || []);
    } catch (e) { console.error(e); }
  };

  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, { menuItemId: "", name: "", price: "", quantity: 1 }] }));
  const removeItem = (idx) => setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  const setItem = (idx, key, val) => setForm(prev => ({ ...prev, items: prev.items.map((item, i) => i === idx ? { ...item, [key]: val } : item) }));

  const total = form.items.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1), 0);

  const handleSubmit = async () => {
    setError(""); setResult(null);
    if (!form.customerId) { setError("Select a customer first"); return; }
    if (!form.items[0].name || !form.items[0].price) { setError("Add at least one item with name and price"); return; }
    setSubmitting(true);
    try {
      const res = await adminClient.post("/food/admin/orders/manual", {
        customerId: form.customerId,
        restaurantId: form.restaurantId || undefined,
        items: form.items.filter(i => i.name && i.price).map(i => ({
          menuItemId: i.menuItemId || undefined,
          name: i.name,
          price: parseFloat(i.price),
          quantity: parseInt(i.quantity) || 1
        })),
        deliveryAddress: form.deliveryAddress,
        paymentMethod: form.paymentMethod,
        note: form.note,
        currency: "PLN"
      });
      if (res?.data?.success) {
        setResult(res.data.data);
        setForm({ customerId: "", restaurantId: "", items: [{ menuItemId: "", name: "", price: "", quantity: 1 }], deliveryAddress: { street: "", city: "", zipCode: "" }, paymentMethod: "cash", note: "" });
        setCustomerSearch(""); setCustomers([]);
      }
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to create order");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center"><ShoppingBag className="w-5 h-5 text-blue-400" /></div>
          <div>
            <h1 className="text-xl font-bold text-white">Manual Order Entry</h1>
            <p className="text-sm text-gray-400">Create orders on behalf of customers</p>
          </div>
        </div>
      </div>
      <div className="px-6 py-6 max-w-2xl">
        {result && (
          <div className="mb-5 p-4 rounded-2xl bg-green-900/30 border border-green-700/50">
            <p className="font-bold text-green-400 mb-1">Order Created Successfully</p>
            <p className="text-sm text-gray-300">Order ID: {result.order?.orderId || result.orderId}</p>
          </div>
        )}
        {error && <div className="mb-4 p-3 rounded-xl bg-red-900/40 border border-red-700/50 text-sm text-red-300">{error}</div>}

        <div className="space-y-5">
          {/* Customer Search */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2"><User className="w-4 h-4 text-blue-400" /> Customer</h3>
            <div className="flex gap-2 mb-3">
              <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && searchCustomers()}
                placeholder="Search by name or phone..."
                className="flex-1 px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600" />
              <button onClick={searchCustomers} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500"><Search className="w-4 h-4" /></button>
            </div>
            {form.customerId && <p className="text-xs text-green-400 mb-2">Customer selected: {form.customerId}</p>}
            {customers.length > 0 && (
              <div className="space-y-2">
                {customers.map(c => (
                  <button key={c._id} onClick={() => { setForm(prev => ({ ...prev, customerId: c._id })); setCustomers([]); setCustomerSearch(c.name || c.phone); }}
                    className="w-full text-left p-3 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 transition">
                    <p className="text-sm font-semibold text-white">{c.name || "Unknown"}</p>
                    <p className="text-xs text-gray-400">{c.phone} {c.email ? "| " + c.email : ""}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white">Order Items</h3>
              <button onClick={addItem} className="text-xs text-blue-400 hover:text-blue-300 font-semibold">+ Add Item</button>
            </div>
            <div className="space-y-3">
              {form.items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <input value={item.name} onChange={e => setItem(idx, "name", e.target.value)} placeholder="Item name"
                      className="col-span-3 sm:col-span-1 px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600" />
                    <input type="number" value={item.price} onChange={e => setItem(idx, "price", e.target.value)} placeholder="Price PLN"
                      className="px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600" />
                    <input type="number" value={item.quantity} onChange={e => setItem(idx, "quantity", e.target.value)} placeholder="Qty" min={1}
                      className="px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  {form.items.length > 1 && (
                    <button onClick={() => removeItem(idx)} className="mt-2 text-gray-600 hover:text-red-400 text-xs">Remove</button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-800 flex justify-between">
              <span className="text-sm text-gray-400">Order Total</span>
              <span className="font-bold text-white">PLN {total.toFixed(2)}</span>
            </div>
          </div>

          {/* Delivery Address */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <h3 className="font-semibold text-white mb-3">Delivery Address</h3>
            <div className="grid grid-cols-1 gap-3">
              {[["street", "Street Address"], ["city", "City"], ["zipCode", "Zip Code"]].map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs text-gray-400 mb-1">{label}</label>
                  <input value={form.deliveryAddress[key]} onChange={e => setForm(prev => ({ ...prev, deliveryAddress: { ...prev.deliveryAddress, [key]: e.target.value } }))}
                    className="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
          </div>

          {/* Payment & Note */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <h3 className="font-semibold text-white mb-3">Payment & Notes</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {[["cash", "Cash"], ["card", "Card"], ["wallet", "Wallet"], ["bank_transfer", "Bank Transfer"]].map(([val, label]) => (
                <button key={val} onClick={() => setForm(prev => ({ ...prev, paymentMethod: val }))}
                  className={"py-2 rounded-xl text-sm font-semibold transition " +
                    (form.paymentMethod === val ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700")}>
                  {label}
                </button>
              ))}
            </div>
            <textarea value={form.note} onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))} rows={2}
              placeholder="Internal note (optional)..."
              className="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none resize-none placeholder-gray-600" />
          </div>

          <button onClick={handleSubmit} disabled={submitting}
            className="w-full py-3 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition text-lg disabled:opacity-50">
            {submitting ? "Creating Order..." : "Create Manual Order"}
          </button>
        </div>
      </div>
    </div>
  );
}
