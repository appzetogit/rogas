import { useState, useEffect, useMemo } from "react"
import { 
  Plus, Edit2, Trash2, ShieldAlert, Check, X, Award, 
  IndianRupee, Calendar, Layers, Eye, FileText, CheckCircle2, AlertCircle, Loader2
} from "lucide-react"
import { adminAPI } from "@food/api"

const debugError = (...args) => console.error("[SubscriptionPlans]", ...args)

export default function SubscriptionPlans() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Modal states
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState(null)
  const [processing, setProcessing] = useState(false)

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    duration: "month",
    description: "",
    features: [""],
    foodVat: "0",
    deliveryVat: "0",
    platformFee: "0",
    deliveryDays: "full_week",
    status: "active"
  })

  // Fetch plans
  const fetchPlans = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await adminAPI.getVendorSubscriptionPlans()
      if (res?.data?.success) {
        setPlans(res.data.data || [])
      } else {
        setError(res?.data?.message || "Failed to load subscription plans")
      }
    } catch (err) {
      debugError("Error fetching subscription plans:", err)
      setError(err.message || "An error occurred while loading subscription plans")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlans()
  }, [])

  // Open modal for creating a new plan
  const handleCreateOpen = () => {
    setEditingPlan(null)
    setFormData({
      name: "",
      price: "",
      duration: "month",
      description: "",
      features: [""],
      foodVat: "0",
      deliveryVat: "0",
      platformFee: "0",
      deliveryDays: "full_week",
      status: "active"
    })
    setShowFormModal(true)
  }

  // Open modal for editing a plan
  const handleEditOpen = (plan) => {
    setEditingPlan(plan)
    setFormData({
      name: plan.name || "",
      price: plan.price !== undefined ? String(plan.price) : "",
      duration: plan.duration || "month",
      description: plan.description || "",
      features: plan.features && plan.features.length > 0 ? [...plan.features] : [""],
      foodVat: plan.foodVat !== undefined ? String(plan.foodVat) : "0",
      deliveryVat: plan.deliveryVat !== undefined ? String(plan.deliveryVat) : "0",
      platformFee: plan.platformFee !== undefined ? String(plan.platformFee) : "0",
      deliveryDays: plan.deliveryDays || "full_week",
      status: plan.status || "active"
    })
    setShowFormModal(true)
  }

  // Handle features dynamic changes
  const handleFeatureChange = (index, value) => {
    const updated = [...formData.features]
    updated[index] = value
    setFormData({ ...formData, features: updated })
  }

  const addFeatureInput = () => {
    setFormData({ ...formData, features: [...formData.features, ""] })
  }

  const removeFeatureInput = (index) => {
    if (formData.features.length <= 1) {
      const updated = [""]
      setFormData({ ...formData, features: updated })
      return
    }
    const updated = formData.features.filter((_, i) => i !== index)
    setFormData({ ...formData, features: updated })
  }

  // Handle form submit
  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Validations
    if (!formData.name.trim()) {
      alert("Plan name is required")
      return
    }
    if (formData.price === "" || isNaN(Number(formData.price)) || Number(formData.price) < 0) {
      alert("Please enter a valid non-negative price")
      return
    }
    if (isNaN(Number(formData.foodVat)) || Number(formData.foodVat) < 0) {
      alert("Food VAT must be a non-negative number")
      return
    }
    if (isNaN(Number(formData.deliveryVat)) || Number(formData.deliveryVat) < 0) {
      alert("Delivery VAT must be a non-negative number")
      return
    }
    if (isNaN(Number(formData.platformFee)) || Number(formData.platformFee) < 0) {
      alert("Platform Fee must be a non-negative number")
      return
    }

    const payload = {
      name: formData.name.trim(),
      price: Number(formData.price),
      duration: formData.duration,
      description: formData.description.trim(),
      features: formData.features.map(f => f.trim()).filter(Boolean),
      foodVat: Number(formData.foodVat),
      deliveryVat: Number(formData.deliveryVat),
      platformFee: Number(formData.platformFee),
      deliveryDays: formData.deliveryDays,
      status: formData.status
    }

    try {
      setProcessing(true)
      let res
      if (editingPlan) {
        res = await adminAPI.updateVendorSubscriptionPlan(editingPlan._id, payload)
      } else {
        res = await adminAPI.createVendorSubscriptionPlan(payload)
      }

      if (res?.data?.success) {
        alert(editingPlan ? "Subscription plan updated successfully!" : "Subscription plan created successfully!")
        setShowFormModal(false)
        fetchPlans()
      } else {
        alert(res?.data?.message || "Failed to save subscription plan")
      }
    } catch (err) {
      debugError("Error saving plan:", err)
      alert(err.response?.data?.message || "An error occurred while saving the plan")
    } finally {
      setProcessing(false)
    }
  }

  // Handle plan deletion
  const handleDelete = async (plan) => {
    if (window.confirm(`Are you sure you want to delete the plan "${plan.name}"?`)) {
      try {
        setProcessing(true)
        const res = await adminAPI.deleteVendorSubscriptionPlan(plan._id)
        if (res?.data?.success) {
          alert("Subscription plan deleted successfully!")
          fetchPlans()
        } else {
          alert(res?.data?.message || "Failed to delete plan")
        }
      } catch (err) {
        debugError("Error deleting plan:", err)
        alert(err.response?.data?.message || "An error occurred while deleting the plan")
      } finally {
        setProcessing(false)
      }
    }
  }

  // Duration display label mapper
  const getDurationLabel = (duration) => {
    const mapping = {
      day: "One Day",
      week: "One Week",
      month: "One Month"
    }
    return mapping[duration] || duration
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                <Award className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Vendor Subscription Plans</h1>
                <p className="text-sm text-slate-500">Manage subscription packages created for vendor registrations</p>
              </div>
            </div>
            <button
              onClick={handleCreateOpen}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-sm shrink-0"
            >
              <Plus className="w-4 h-4" />
              Create Plan
            </button>
          </div>
        </div>

        {/* Content Section */}
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-20 text-center shadow-sm">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
            <p className="text-lg font-semibold text-slate-700">Loading subscription plans...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm max-w-md mx-auto">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <p className="text-lg font-bold text-slate-900 mb-1">Error Loading Plans</p>
            <p className="text-sm text-slate-500 mb-4">{error}</p>
            <button
              onClick={fetchPlans}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all"
            >
              Try Again
            </button>
          </div>
        ) : plans.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-20 text-center shadow-sm">
            <Award className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-700 mb-1">No Subscription Plans Found</h3>
            <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
              There are no vendor plans created yet. Get started by creating your first subscription package.
            </p>
            <button
              onClick={handleCreateOpen}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all"
            >
              Create First Plan
            </button>
          </div>
        ) : (
          /* Premium Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div 
                key={plan._id} 
                className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden relative ${
                  plan.status === "inactive" ? "border-slate-200 opacity-75" : "border-slate-200"
                }`}
              >
                {/* Inactive Badge Overlay */}
                {plan.status === "inactive" && (
                  <div className="absolute top-3 right-3 bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                    Inactive
                  </div>
                )}
                {plan.status === "active" && (
                  <div className="absolute top-3 right-3 bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                    Active
                  </div>
                )}

                <div className="p-6">
                  {/* Plan Meta */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {getDurationLabel(plan.duration)}
                    </span>
                    <span className="px-2 py-1 rounded bg-amber-50 text-amber-700 text-xs font-semibold uppercase tracking-wider flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" />
                      {plan.deliveryDays === 'mon_fri' ? "Mon–Fri" : "Full Week"}
                    </span>
                  </div>

                  {/* Plan Name & Price */}
                  <h3 className="text-xl font-bold text-slate-900 mb-1">{plan.name}</h3>
                  <p className="text-xs text-slate-400 mb-4 truncate" title={plan.description}>{plan.description || "No description provided."}</p>

                  <div className="flex items-baseline gap-1 mb-4 border-b border-slate-100 pb-4">
                    <span className="text-3xl font-extrabold text-slate-950 flex items-center">
                      <IndianRupee className="w-5 h-5 shrink-0" />
                      {plan.price}
                    </span>
                    <span className="text-slate-500 text-sm">/ {plan.duration}</span>
                  </div>

                  {/* Config settings */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-lg p-2.5 mb-4 border border-slate-100 text-center text-[10px] font-medium text-slate-650">
                    <div>
                      <div className="text-slate-400 font-semibold mb-0.5">Food VAT</div>
                      <div className="font-bold text-slate-800">{plan.foodVat ?? 0}%</div>
                    </div>
                    <div>
                      <div className="text-slate-400 font-semibold mb-0.5">Del. VAT</div>
                      <div className="font-bold text-slate-800">{plan.deliveryVat ?? 0}%</div>
                    </div>
                    <div>
                      <div className="text-slate-400 font-semibold mb-0.5">Plat. Fee</div>
                      <div className="font-bold text-slate-800">₹{plan.platformFee ?? 0}</div>
                    </div>
                  </div>

                  {/* Plan Features */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Features included:</h4>
                    {plan.features && plan.features.length > 0 ? (
                      <ul className="space-y-2">
                        {plan.features.map((feature, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                            <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-400 italic">No features specified for this plan.</p>
                    )}
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex items-center gap-3">
                  <button
                    onClick={() => handleEditOpen(plan)}
                    className="flex-1 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 bg-white"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(plan)}
                    className="py-2 px-3 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 bg-white"
                    title="Delete Plan"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Create / Edit Plan Form Modal */}
      {showFormModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowFormModal(false)}>
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full flex flex-col max-h-[90vh]" 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Award className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{editingPlan ? "Edit Subscription Plan" : "Create Subscription Plan"}</h3>
                  <p className="text-xs text-slate-500">Configure plan limits, prices and durations</p>
                </div>
              </div>
              <button
                onClick={() => setShowFormModal(false)}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              
              {/* Plan Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Plan Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Premium Weekly Package"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Price and Duration */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Price (INR) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="0"
                      placeholder="e.g. 1500"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full pl-8 pr-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Duration <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="day">One Day</option>
                    <option value="week">One Week</option>
                    <option value="month">One Month</option>
                  </select>
                </div>
              </div>

              {/* Delivery Days & Platform Fee */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Delivery Schedule <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.deliveryDays}
                    onChange={(e) => setFormData({ ...formData, deliveryDays: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="full_week">Full Week</option>
                    <option value="mon_fri">Monday–Friday</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Platform Fee (INR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 10"
                    value={formData.platformFee}
                    onChange={(e) => setFormData({ ...formData, platformFee: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* VAT Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Food VAT (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 8"
                    value={formData.foodVat}
                    onChange={(e) => setFormData({ ...formData, foodVat: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Delivery VAT (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 5"
                    value={formData.deliveryVat}
                    onChange={(e) => setFormData({ ...formData, deliveryVat: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
                <textarea
                  placeholder="Summarize the plan details..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={2}
                />
              </div>

              {/* Dynamic Feature Bullets */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-semibold text-slate-700">Features / Benefits</label>
                  <button
                    type="button"
                    onClick={addFeatureInput}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Item
                  </button>
                </div>

                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {formData.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="e.g. Featured in searches"
                        value={feature}
                        onChange={(e) => handleFeatureChange(index, e.target.value)}
                        className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeFeatureInput(index)}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors shrink-0"
                        title="Remove Feature"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Actions Footer */}
              <div className="flex items-center gap-3 pt-4 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  disabled={processing}
                  className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Plan"
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  )
}
