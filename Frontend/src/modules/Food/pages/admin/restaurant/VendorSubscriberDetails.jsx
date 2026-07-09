import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, X, Loader2, Calendar, Clock, MapPin, Phone, Mail, User, CreditCard, Box, FileText, CheckCircle2, XCircle } from "lucide-react";
import { adminAPI } from "@food/api";
import { format } from "date-fns";

export default function VendorSubscriberDetails({ propId, propSubId, onClose, isModal = false }) {
  const params = useParams();
  const id = propId || params.id;
  const subId = propSubId || params.subId;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        const res = await adminAPI.getVendorSubscriberDetails(id, subId);
        setData(res?.data?.data || null);
      } catch (err) {
        setError(err?.response?.data?.message || "Failed to load subscription details.");
      } finally {
        setLoading(false);
      }
    };
    if (id && subId) fetchDetails();
  }, [id, subId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center p-24">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg">{error || "Data not found"}</div>
      </div>
    );
  }

  const user = data.userId || {};
  const address = data.deliveryAddress || {};
  const deliveries = data.deliveryHistory || [];

  return (
    <div className={isModal ? "p-6" : "p-4 lg:p-6 bg-slate-50 min-h-screen"}>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className={`flex ${isModal ? 'items-start justify-between' : 'items-center gap-3'}`}>
          {!isModal && (
            <button
              onClick={() => navigate(`/admin/food/restaurant/edit/${id}`)}
              className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50"
            >
              <ArrowLeft className="w-4 h-4 text-slate-700" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Subscription Details</h1>
            <p className="text-sm text-slate-500 flex items-center gap-2">
              <span className="font-mono text-slate-700">{data.subscriptionId}</span>
              <span>•</span>
              <span className={`capitalize ${data.status === 'active' ? 'text-emerald-600' : 'text-slate-500'}`}>
                {data.status}
              </span>
            </p>
          </div>
          {isModal && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5 text-slate-700" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-1 space-y-6">
            {/* Customer Info */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-500" /> Customer
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Name</p>
                  <p className="text-sm font-medium text-slate-900">{user.name || "N/A"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <p className="text-sm text-slate-700">{user.phone || "N/A"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <p className="text-sm text-slate-700 break-all">{user.email || "N/A"}</p>
                </div>
              </div>
            </div>

            {/* Delivery Address */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-500" /> Delivery Address
              </h2>
              {address.city ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-900">{address.tag || "Address"}</p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {address.street}, {address.landmark ? `${address.landmark}, ` : ""}
                    {address.city}, {address.state} - {address.pincode}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No address found.</p>
              )}
            </div>

            {/* Payment Summary */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-slate-500" /> Payment
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Method</span>
                  <span className="text-sm font-medium text-slate-900 capitalize">{data.paymentMethod || "N/A"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Amount</span>
                  <span className="text-sm font-bold text-slate-900">₹{(data.pricing?.totalPrice || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Status</span>
                  <span className="text-xs font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                    Paid
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Plan Details */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" /> Plan Overview
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Plan Name</p>
                  <p className="text-sm font-medium text-slate-900">{data.mealPlanId?.name || "Custom"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Type</p>
                  <p className="text-sm font-medium text-slate-900 capitalize">{data.duration}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Days Left</p>
                  <p className="text-sm font-medium text-blue-600">{data.remainingDays}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Total Meals</p>
                  <p className="text-sm font-medium text-slate-900">{data.totalMealsCount || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Start Date</p>
                  <p className="text-sm text-slate-900">
                    {data.startDate ? format(new Date(data.startDate), "MMM dd, yyyy") : "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">End Date</p>
                  <p className="text-sm text-slate-900">
                    {data.endDate ? format(new Date(data.endDate), "MMM dd, yyyy") : "N/A"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 mb-0.5">Delivery Days</p>
                  <div className="flex gap-1 flex-wrap mt-1">
                    {Array.isArray(data.deliveryDays) ? (
                      data.deliveryDays.map(day => (
                        <span key={day} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                          {day.substring(0, 3)}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 capitalize">
                        {typeof data.deliveryDays === 'string' 
                          ? (data.deliveryDays === 'mon_fri' ? 'Mon-Fri' : (data.deliveryDays === 'full_week' ? 'Full Week' : data.deliveryDays.replace('_', ' ')))
                          : 'N/A'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery History */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
                <Box className="w-4 h-4 text-slate-500" /> Delivery Logs
              </h2>
              {deliveries.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">No deliveries logged yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-slate-500 border-b border-slate-100">
                      <tr>
                        <th className="py-2 font-medium">Date</th>
                        <th className="py-2 font-medium">Meal</th>
                        <th className="py-2 font-medium">Driver</th>
                        <th className="py-2 font-medium">Status</th>
                        <th className="py-2 font-medium text-right">Proof</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {deliveries.map(delivery => (
                        <tr key={delivery._id}>
                          <td className="py-3">
                            {delivery.deliveryDate ? format(new Date(delivery.deliveryDate), "MMM dd, yyyy") : "-"}
                          </td>
                          <td className="py-3 capitalize text-slate-700">{delivery.mealType}</td>
                          <td className="py-3">
                            <p className="font-medium text-slate-900">{delivery.driverName}</p>
                            <p className="text-xs text-slate-500">{delivery.driverPhone}</p>
                          </td>
                          <td className="py-3">
                            {delivery.status === "delivered" ? (
                              <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium bg-emerald-50 px-2 py-1 rounded border border-emerald-100 w-fit">
                                <CheckCircle2 className="w-3 h-3" /> Delivered
                              </span>
                            ) : delivery.status === "cancelled" ? (
                              <span className="flex items-center gap-1 text-red-600 text-xs font-medium bg-red-50 px-2 py-1 rounded border border-red-100 w-fit">
                                <XCircle className="w-3 h-3" /> Cancelled
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-slate-600 text-xs font-medium bg-slate-50 px-2 py-1 rounded border border-slate-200 w-fit capitalize">
                                <Clock className="w-3 h-3" /> {delivery.status}
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            {delivery.podImage ? (
                              <a href={delivery.podImage} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs font-medium flex items-center justify-end gap-1">
                                <Eye className="w-3 h-3" /> View
                              </a>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
