import { useState, useMemo, useEffect, useRef } from "react"
import { 
  Search, Filter, Eye, Check, X, ArrowUpDown, Loader2,
  FileText, Image as ImageIcon, ExternalLink, CreditCard, Calendar, Star, Building2, User, Phone, Mail, MapPin, Clock, Map, ShieldAlert, Award
} from "lucide-react"
import { adminAPI } from "@food/api"

const debugError = (...args) => console.error("[VendorRequest]", ...args)

const formatTime12Hour = (timeStr) => {
  if (!timeStr || typeof timeStr !== "string" || !timeStr.includes(":")) return "--:-- --"
  const [h, m] = timeStr.split(":").map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return timeStr
  const period = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${String(hour).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`
}

const getVendorTypeLabel = (type) => {
  if (!type) return "Restaurant"
  const mapping = {
    home_cook: "Home Cook",
    cloud_kitchen: "Cloud Kitchen",
    restaurant: "Restaurant",
    catering: "Catering"
  }
  return mapping[type.toLowerCase()] || type
}

const isPdfFile = (url) => {
  if (!url) return false
  return url.toLowerCase().endsWith(".pdf") || url.includes("licence-pdf") || url.includes("/pdf")
}

export default function VendorRequest() {
  const [activeTab, setActiveTab] = useState("pending")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortConfig, setSortConfig] = useState({ key: "createdAt", direction: "desc" })
  const [pendingRequests, setPendingRequests] = useState([])
  const [rejectedRequests, setRejectedRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [vendorDetails, setVendorDetails] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [showFilterDialog, setShowFilterDialog] = useState(false)
  const [filters, setFilters] = useState({
    zone: "",
    vendorType: "",
    dateFrom: "",
    dateTo: ""
  })

  const hasFetchedOnceRef = useRef(false)

  // Fetch requests
  useEffect(() => {
    if (!hasFetchedOnceRef.current) {
      hasFetchedOnceRef.current = true
      fetchRequests()
      return
    }

    if (activeTab !== "pending") {
      fetchRequests()
    }
  }, [activeTab])

  const fetchRequests = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await adminAPI.getPendingRestaurants()
      const list = response?.data?.data || []
      
      // Filter list based on status
      if (activeTab === "pending") {
        setPendingRequests(list.filter((r) => r.status === "pending"))
      } else {
        setRejectedRequests(list.filter((r) => r.status === "rejected"))
      }
    } catch (err) {
      debugError("Error fetching vendor requests:", err)
      setError(err.message || "Failed to fetch vendor requests")
      if (activeTab === "pending") {
        setPendingRequests([])
      } else {
        setRejectedRequests([])
      }
    } finally {
      setLoading(false)
    }
  }

  const currentRequests = activeTab === "pending" ? pendingRequests : rejectedRequests

  // Filter options
  const filterOptions = useMemo(() => {
    const zones = [...new Set(currentRequests.map(r => r.zone).filter(Boolean))]
    const vendorTypes = [...new Set(currentRequests.map(r => r.vendorType).filter(Boolean))]
    return { zones, vendorTypes }
  }, [currentRequests])

  const filteredRequests = useMemo(() => {
    let filtered = currentRequests

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(request =>
        request.restaurantName?.toLowerCase().includes(query) ||
        request.ownerName?.toLowerCase().includes(query) ||
        request.ownerPhone?.includes(query) ||
        request.city?.toLowerCase().includes(query)
      )
    }

    // Apply zone filter
    if (filters.zone) {
      filtered = filtered.filter(request => request.zone === filters.zone)
    }

    // Apply vendorType filter
    if (filters.vendorType) {
      filtered = filtered.filter(request => request.vendorType === filters.vendorType)
    }

    // Apply date range filter
    if (filters.dateFrom || filters.dateTo) {
      filtered = filtered.filter(request => {
        if (!request.createdAt) return false
        const requestDate = new Date(request.createdAt).setHours(0, 0, 0, 0)
        if (filters.dateFrom) {
          const fromDate = new Date(filters.dateFrom).setHours(0, 0, 0, 0)
          if (requestDate < fromDate) return false
        }
        if (filters.dateTo) {
          const toDate = new Date(filters.dateTo).setHours(23, 59, 59, 999)
          if (requestDate > toDate) return false
        }
        return true
      })
    }

    return filtered
  }, [currentRequests, searchQuery, filters])

  const sortedRequests = useMemo(() => {
    const requests = [...filteredRequests]
    const { key, direction } = sortConfig
    const multiplier = direction === "asc" ? 1 : -1

    const getSortValue = (request) => {
      switch (key) {
        case "sl":
          return Number(request.sl || 0)
        case "restaurantName":
          return String(request.restaurantName || "").toLowerCase()
        case "ownerName":
          return String(request.ownerName || "").toLowerCase()
        case "vendorType":
          return String(request.vendorType || "").toLowerCase()
        case "zone":
          return String(request.zone || "").toLowerCase()
        case "createdAt":
        default:
          return new Date(request.createdAt || 0).getTime()
      }
    }

    requests.sort((left, right) => {
      const leftValue = getSortValue(left)
      const rightValue = getSortValue(right)

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * multiplier
      }

      return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true }) * multiplier
    })

    return requests
  }, [filteredRequests, sortConfig])

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }))
  }

  const getSortIconClassName = (key) => {
    if (sortConfig.key !== key) return "w-3 h-3 text-slate-400"
    return sortConfig.direction === "asc" ? "w-3 h-3 text-blue-600" : "w-3 h-3 text-slate-700"
  }

  const clearFilters = () => {
    setFilters({
      zone: "",
      vendorType: "",
      dateFrom: "",
      dateTo: ""
    })
  }

  const hasActiveFilters = filters.zone || filters.vendorType || filters.dateFrom || filters.dateTo

  const handleApprove = async (request) => {
    if (window.confirm(`Are you sure you want to approve "${request.restaurantName}" vendor request?`)) {
      try {
        setProcessing(true)
        await adminAPI.approveRestaurant(request._id)
        await fetchRequests()
        if (showDetailsModal) {
          closeDetailsModal()
        }
        alert(`Successfully approved ${request.restaurantName}'s vendor request!`)
      } catch (err) {
        debugError("Error approving vendor request:", err)
        alert(err.response?.data?.message || "Failed to approve request. Please try again.")
      } finally {
        setProcessing(false)
      }
    }
  }

  const handleReject = (request) => {
    setSelectedRequest(request)
    setRejectionReason("")
    setShowRejectDialog(true)
  }

  const confirmReject = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      alert("Please provide a rejection reason")
      return
    }

    try {
      setProcessing(true)
      await adminAPI.rejectRestaurant(selectedRequest._id, rejectionReason)
      await fetchRequests()
      setShowRejectDialog(false)
      setSelectedRequest(null)
      setRejectionReason("")
      if (showDetailsModal) {
        closeDetailsModal()
      }
      alert(`Successfully rejected ${selectedRequest.restaurantName}'s vendor request!`)
    } catch (err) {
      debugError("Error rejecting request:", err)
      alert(err.response?.data?.message || "Failed to reject request. Please try again.")
    } finally {
      setProcessing(false)
    }
  }

  const handleViewDetails = async (request) => {
    setSelectedRequest(request)
    setShowDetailsModal(true)
    setVendorDetails(request) // It already contains all populated info from getPendingRestaurants
    setLoadingDetails(false)
  }

  const closeDetailsModal = () => {
    setShowDetailsModal(false)
    setSelectedRequest(null)
    setVendorDetails(null)
  }

  const getNormalizedImageUrl = (image) => {
    if (!image) return ""
    if (typeof image === "string") return image
    return image?.url || ""
  }

  const getDisplayProfilePhoto = (reqObj) => {
    if (reqObj?.coverImages && reqObj.coverImages.length > 0) {
      const first = reqObj.coverImages[0]
      if (typeof first === "string") return first
      if (typeof first === "object" && first?.url) return first.url
    }
    if (reqObj?.profileImage) {
      return getNormalizedImageUrl(reqObj.profileImage)
    }
    return ""
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <Award className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Vendor Register Request</h1>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 mb-6">
            <button
              onClick={() => setActiveTab("pending")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "pending"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Pending Requests
            </button>
            <button
              onClick={() => setActiveTab("rejected")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "rejected"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Rejected Requests
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 sm:flex-initial min-w-[250px]">
                <input
                  type="text"
                  placeholder="Search by vendor, owner or phone"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowFilterDialog(true)}
                className={`px-4 py-2.5 text-sm font-medium rounded-lg border transition-all flex items-center gap-2 ${
                  hasActiveFilters 
                    ? "border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100" 
                    : "border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                }`}
              >
                <Filter className="w-4 h-4" />
                Filter
                {hasActiveFilters && (
                  <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                    {[filters.zone, filters.vendorType, filters.dateFrom, filters.dateTo].filter(Boolean).length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort("sl")} className="flex items-center gap-1 hover:text-slate-900 transition-colors">
                      <span>SL</span>
                      <ArrowUpDown className={getSortIconClassName("sl")} />
                    </button>
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort("restaurantName")} className="flex items-center gap-1 hover:text-slate-900 transition-colors">
                      <span>Vendor Info</span>
                      <ArrowUpDown className={getSortIconClassName("restaurantName")} />
                    </button>
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort("ownerName")} className="flex items-center gap-1 hover:text-slate-900 transition-colors">
                      <span>Owner Info</span>
                      <ArrowUpDown className={getSortIconClassName("ownerName")} />
                    </button>
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort("vendorType")} className="flex items-center gap-1 hover:text-slate-900 transition-colors">
                      <span>Vendor Type</span>
                      <ArrowUpDown className={getSortIconClassName("vendorType")} />
                    </button>
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                    <button type="button" onClick={() => handleSort("zone")} className="flex items-center gap-1 hover:text-slate-900 transition-colors">
                      <span>Zone / City</span>
                      <ArrowUpDown className={getSortIconClassName("zone")} />
                    </button>
                  </th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
                      <p className="text-lg font-semibold text-slate-700">Loading vendor requests...</p>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center">
                      <p className="text-lg font-semibold text-red-600 mb-1">Error: {error}</p>
                      <p className="text-sm text-slate-500">Failed to load requests. Please try again.</p>
                    </td>
                  </tr>
                ) : sortedRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
                        <p className="text-sm text-slate-500">No vendor requests match your criteria</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedRequests.map((request, index) => (
                    <tr key={request._id || index} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-slate-700">{request.sl ?? index + 1}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center shrink-0 cursor-pointer hover:opacity-80 transition-all"
                            onClick={() => handleViewDetails(request)}
                          >
                            <img
                              src={
                                getDisplayProfilePhoto(request) ||
                                "https://via.placeholder.com/40?text=" + (request.restaurantName?.slice(0, 2) || "V").toUpperCase()
                              }
                              alt={request.restaurantName}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.src = "https://via.placeholder.com/40?text=" + (request.restaurantName?.slice(0, 2) || "V").toUpperCase()
                              }}
                            />
                          </div>
                          <div className="flex flex-col">
                            <span 
                              className="text-sm font-medium text-slate-900 cursor-pointer hover:text-blue-600 transition-colors"
                              onClick={() => handleViewDetails(request)}
                            >
                              {request.restaurantName}
                            </span>
                            <span className="text-xs text-slate-500">{request.city || "No City Specified"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-slate-900">{request.ownerName}</span>
                          <span className="text-xs text-slate-500">{request.ownerPhone || "—"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                          request.vendorType === "home_cook" 
                            ? "bg-purple-100 text-purple-700" 
                            : request.vendorType === "cloud_kitchen"
                            ? "bg-indigo-100 text-indigo-700"
                            : request.vendorType === "catering"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {getVendorTypeLabel(request.vendorType)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700">{request.zone || request.city || "—"}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          request.status === "pending"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                          {request.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleViewDetails(request)}
                            className="p-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {activeTab === "pending" && (
                            <>
                              <button
                                onClick={() => handleApprove(request)}
                                disabled={processing}
                                className="p-1.5 rounded-full bg-green-50 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Approve"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleReject(request)}
                                disabled={processing}
                                className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Reject"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Filter Dialog */}
      {showFilterDialog && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowFilterDialog(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Filter className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Filter Requests</h3>
                    <p className="text-xs text-slate-500">Apply filters to refine your search</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFilterDialog(false)}
                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5 text-slate-600" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Zone Filter */}
                {filterOptions.zones.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Zone</label>
                    <select
                      value={filters.zone}
                      onChange={(e) => setFilters({ ...filters, zone: e.target.value })}
                      className="w-full px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">All Zones</option>
                      {filterOptions.zones.map((zone) => (
                        <option key={zone} value={zone}>{zone}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Vendor Type Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Vendor Type</label>
                  <select
                    value={filters.vendorType}
                    onChange={(e) => setFilters({ ...filters, vendorType: e.target.value })}
                    className="w-full px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Vendor Types</option>
                    <option value="home_cook">Home Cook</option>
                    <option value="cloud_kitchen">Cloud Kitchen</option>
                    <option value="restaurant">Restaurant</option>
                    <option value="catering">Catering</option>
                  </select>
                </div>

                {/* Date Range Filters */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">From Date</label>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                      className="w-full px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">To Date</label>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                      min={filters.dateFrom}
                      className="w-full px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-6 pt-6 border-t border-slate-200">
                <button
                  onClick={clearFilters}
                  disabled={!hasActiveFilters}
                  className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear All
                </button>
                <button
                  onClick={() => setShowFilterDialog(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Confirmation Dialog */}
      {showRejectDialog && selectedRequest && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={() => setShowRejectDialog(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <X className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Reject Vendor Request</h3>
                  <p className="text-sm text-slate-600">{selectedRequest.restaurantName}</p>
                </div>
              </div>
              
              <p className="text-sm text-slate-700 mb-4">
                Are you sure you want to reject this vendor request? Please provide a reason for rejection.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  className="w-full px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                  rows={4}
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowRejectDialog(false)
                    setSelectedRequest(null)
                    setRejectionReason("")
                  }}
                  disabled={processing}
                  className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReject}
                  disabled={processing || !rejectionReason.trim()}
                  className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Rejecting...
                    </span>
                  ) : (
                    "Reject Request"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vendor Details Side Panel */}
      {showDetailsModal && selectedRequest && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="fixed inset-0 bg-slate-900/15 backdrop-blur-sm transition-opacity" onClick={closeDetailsModal} />
          
          <div 
            className="relative w-full max-w-4xl bg-white h-full shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Panel Header */}
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-5 flex items-center justify-between z-10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Award className="w-5 h-5 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Vendor Register Details</h2>
              </div>
              <button
                onClick={closeDetailsModal}
                className="p-2 rounded-xl hover:bg-slate-100 transition-all text-slate-400 hover:text-slate-600 border border-transparent hover:border-slate-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {loadingDetails && (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                  <span className="ml-3 text-slate-600">Loading details...</span>
                </div>
              )}
              {!loadingDetails && (vendorDetails || selectedRequest) && (() => {
                const r = vendorDetails || selectedRequest
                const approvalStatus = r.status || "pending"
                const licenceUrl = r.foodLicenceUrl
                const pdf = isPdfFile(licenceUrl)

                return (
                  <div className="space-y-6">
                    {/* Basic Vendor Header Info */}
                    <div className="flex items-start gap-6 pb-6 border-b border-slate-200">
                      <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                        <img
                          src={
                            getDisplayProfilePhoto(r) ||
                            "https://via.placeholder.com/96?text=" + (r.restaurantName?.slice(0, 2) || "V").toUpperCase()
                          }
                          alt={r.restaurantName}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.src = "https://via.placeholder.com/96?text=" + (r.restaurantName?.slice(0, 2) || "V").toUpperCase()
                          }}
                        />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold text-slate-900 mb-2">
                          {r.restaurantName}
                        </h3>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                            r.vendorType === "home_cook" 
                              ? "bg-purple-100 text-purple-700" 
                              : r.vendorType === "cloud_kitchen"
                              ? "bg-indigo-100 text-indigo-700"
                              : r.vendorType === "catering"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}>
                            {getVendorTypeLabel(r.vendorType)}
                          </span>
                          <span className={`px-3 py-0.5 rounded-full text-xs font-medium ${
                            approvalStatus === "approved" ? "bg-green-100 text-green-700" : approvalStatus === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                          }`}>
                            {approvalStatus === "approved" ? "Approved" : approvalStatus === "rejected" ? "Rejected" : "Pending Approval"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Owner & Contact details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-200">
                      <div>
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Owner Details</h4>
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <User className="w-5 h-5 text-slate-400" />
                            <div>
                              <p className="text-xs text-slate-500">Owner Name</p>
                              <p className="text-sm font-semibold text-slate-900">{r.ownerName || "N/A"}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Phone className="w-5 h-5 text-slate-400" />
                            <div>
                              <p className="text-xs text-slate-500">Owner Phone</p>
                              <p className="text-sm font-semibold text-slate-900">{r.ownerPhone || "N/A"}</p>
                            </div>
                          </div>
                          {r.ownerEmail && (
                            <div className="flex items-center gap-3">
                              <Mail className="w-5 h-5 text-slate-400" />
                              <div>
                                <p className="text-xs text-slate-500">Owner Email</p>
                                <p className="text-sm font-semibold text-slate-900">{r.ownerEmail}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Business location and type details */}
                      <div>
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Service Location</h4>
                        <div className="space-y-3">
                          <div className="flex items-start gap-3">
                            <MapPin className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-slate-500">Address</p>
                              <p className="text-sm font-semibold text-slate-900">
                                {[
                                  r.addressLine1 || r.location?.addressLine1,
                                  r.addressLine2 || r.location?.addressLine2,
                                  r.area || r.location?.area,
                                  r.city || r.location?.city,
                                  r.state || r.location?.state,
                                  r.pincode || r.location?.pincode,
                                  r.landmark || r.location?.landmark,
                                ].filter(Boolean).join(", ") || r.location?.formattedAddress || r.location?.address || r.address || "N/A"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <MapPin className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-slate-500">Coordinates</p>
                              <p className="text-sm font-semibold text-slate-900">
                                Lat: {r.location?.latitude ?? r.location?.coordinates?.[1] ?? "N/A"}, 
                                Lng: {r.location?.longitude ?? r.location?.coordinates?.[0] ?? "N/A"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <Map className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-slate-500">Service Zone</p>
                              <p className="text-sm font-semibold text-slate-900">{r.zone || "N/A"}</p>
                            </div>
                          </div>
                          {r.city && (
                            <div className="flex items-start gap-3">
                              <MapPin className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs text-slate-500">Registered City</p>
                                <p className="text-sm font-semibold text-slate-900">{r.city}</p>
                              </div>
                            </div>
                          )}
                          {r.vendorType === "home_cook" && (
                            <div className="flex items-start gap-3">
                              <Building2 className="w-5 h-5 text-slate-400 mt-0.5" />
                              <div>
                                <p className="text-xs text-slate-500">Kitchen Partner Sp. z o.o.</p>
                                <p className="text-sm font-semibold text-blue-600">
                                  {r.kitchenPartnerId?.companyName || "FreshKitchen Partners Sp. z o.o."}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Tax & Licences details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-200">
                      <div>
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">EU Compliance & Tax Info</h4>
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-slate-400" />
                            <div>
                              <p className="text-xs text-slate-500">VAT Number (NIP for Poland)</p>
                              <p className="text-sm font-semibold text-slate-900">{r.vatNumber || "Not Registered / N/A"}</p>
                            </div>
                          </div>
                          {r.panNumber && (
                            <div className="flex items-center gap-3">
                              <FileText className="w-5 h-5 text-slate-400" />
                              <div>
                                <p className="text-xs text-slate-500">PAN Number</p>
                                <p className="text-sm font-semibold text-slate-900">{r.panNumber}</p>
                              </div>
                            </div>
                          )}
                          {r.fssaiNumber && (
                            <div className="flex items-center gap-3">
                              <FileText className="w-5 h-5 text-slate-400" />
                              <div>
                                <p className="text-xs text-slate-500">FSSAI Registration</p>
                                <p className="text-sm font-semibold text-slate-900">{r.fssaiNumber}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Bank Details */}
                      <div>
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Bank Account details</h4>
                        <div className="space-y-3">
                          <div className="flex items-start gap-3">
                            <CreditCard className="w-5 h-5 text-slate-400 mt-0.5" />
                            <div>
                              <p className="text-xs text-slate-500">Bank Account Number / IBAN</p>
                              <p className="text-sm font-semibold text-slate-900">{r.accountNumber || "N/A"}</p>
                            </div>
                          </div>
                          {r.accountHolderName && (
                            <div className="flex items-start gap-3">
                              <User className="w-5 h-5 text-slate-400 mt-0.5" />
                              <div>
                                <p className="text-xs text-slate-500">Account Holder Name</p>
                                <p className="text-sm font-semibold text-slate-900">{r.accountHolderName}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Offered Meal Slots */}
                    <div className="pb-6 border-b border-slate-200">
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Offered Meal Slots</h4>
                      {r.mealSlots && r.mealSlots.length > 0 ? (
                        <div className="flex flex-wrap gap-3">
                          {r.mealSlots.map((slot, idx) => (
                            <span 
                              key={idx} 
                              className="px-4 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2"
                            >
                              <Clock className="w-3.5 h-3.5 text-indigo-500" />
                              {slot}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm font-medium text-slate-500">No meal slots selected / N/A</p>
                      )}
                    </div>

                    {/* EU Food Licence Document preview */}
                    <div>
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">EU Food Licence Document</h4>
                      {licenceUrl ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                            <div className="flex items-center gap-3">
                              {pdf ? (
                                <FileText className="w-6 h-6 text-red-500" />
                              ) : (
                                <ImageIcon className="w-6 h-6 text-blue-500" />
                              )}
                              <div>
                                <p className="text-sm font-semibold text-slate-900">EU_Food_Licence_{r.restaurantName.replace(/\s+/g, "_")}</p>
                                <p className="text-xs text-slate-500">{pdf ? "PDF Document" : "Image File"}</p>
                              </div>
                            </div>
                            <a 
                              href={licenceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Open in New Tab
                            </a>
                          </div>

                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 flex items-center justify-center p-4">
                            {pdf ? (
                              <iframe 
                                src={licenceUrl} 
                                title="EU Food Licence PDF"
                                className="w-full h-[400px] border-0 rounded-lg shadow-sm"
                              />
                            ) : (
                              <img 
                                src={licenceUrl} 
                                alt="EU Food Licence"
                                className="max-w-full h-auto max-h-[350px] object-contain rounded-lg shadow-sm"
                              />
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg">
                          <ShieldAlert className="w-5 h-5 shrink-0" />
                          <p className="text-sm font-semibold">No EU Food Licence Document has been uploaded yet for this vendor request.</p>
                        </div>
                      )}
                    </div>

                    {/* Owner ID Document preview */}
                    <div className="pt-6 border-t border-slate-200">
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Owner ID Document (Aadhaar / Passport / Driving License)</h4>
                      {r.ownerIdImage ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                            <div className="flex items-center gap-3">
                              <ImageIcon className="w-6 h-6 text-blue-500" />
                              <div>
                                <p className="text-sm font-semibold text-slate-900">Owner_ID_Document_{r.restaurantName?.replace(/\s+/g, "_")}</p>
                                <p className="text-xs text-slate-500">Image File</p>
                              </div>
                            </div>
                            <a 
                              href={r.ownerIdImage}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 hover:text-blue-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Open in New Tab
                            </a>
                          </div>

                          <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 flex items-center justify-center p-4">
                            <img 
                              src={r.ownerIdImage} 
                              alt="Owner ID Document"
                              className="max-w-full h-auto max-h-[350px] object-contain rounded-lg shadow-sm"
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg">
                          <ShieldAlert className="w-5 h-5 shrink-0" />
                          <p className="text-sm font-semibold">No Owner ID Document has been uploaded yet for this vendor request.</p>
                        </div>
                      )}
                    </div>

                    {/* Rejection Reason (if rejected) */}
                    {r.rejectionReason && (
                      <div className="pt-6 border-t border-slate-200">
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                          <h4 className="text-sm font-bold text-red-900 mb-2">Rejection Reason</h4>
                          <p className="text-sm text-red-800">{r.rejectionReason}</p>
                          {r.rejectedAt && (
                            <p className="text-xs text-red-600 mt-2">
                              Rejected on: {new Date(r.rejectedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
              {!loadingDetails && !vendorDetails && !selectedRequest && (
                <div className="flex flex-col items-center justify-center py-20">
                  <p className="text-lg font-semibold text-slate-700 mb-2">No Details Available</p>
                  <p className="text-sm text-slate-500">Unable to load vendor details</p>
                </div>
              )}
            </div>

            {/* Modal Footer (Approve / Reject actions) */}
            {activeTab === "pending" && selectedRequest && (
              <div className="sticky bottom-0 bg-slate-50 border-t border-slate-100 px-6 py-4 flex items-center justify-end gap-3 shrink-0 z-10">
                <button
                  onClick={closeDetailsModal}
                  className="px-4 py-2.5 text-sm font-medium border border-slate-300 rounded-xl bg-white hover:bg-slate-50 text-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleReject(selectedRequest)}
                  disabled={processing}
                  className="px-4 py-2.5 text-sm font-semibold rounded-xl bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-200 flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X className="w-4 h-4" />
                  Reject Request
                </button>
                <button
                  onClick={() => handleApprove(selectedRequest)}
                  disabled={processing}
                  className="px-4 py-2.5 text-sm font-semibold rounded-xl bg-green-600 hover:bg-green-700 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" />
                  Approve Vendor
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
