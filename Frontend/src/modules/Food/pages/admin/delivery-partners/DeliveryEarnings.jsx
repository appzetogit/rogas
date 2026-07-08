import { useState, useMemo, useEffect, useCallback } from "react"
import { Search, Download, ChevronDown, DollarSign, Calendar, Filter, Loader2, FileText, FileSpreadsheet, Code, X, List, Eye } from "lucide-react"
import { adminAPI } from "@food/api"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@food/components/ui/dropdown-menu"
import { toast } from "sonner"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const formatCurrency = (amount) => {
  return `\u20B9${Number(amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const formatDate = (dateString) => {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-IN', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function DeliveryEarnings() {
  const [searchQuery, setSearchQuery] = useState("")
  const [earnings, setEarnings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 })
  const [summary, setSummary] = useState({
    totalDeliveryPartners: 0,
    totalEarnings: 0,
    totalOrders: 0
  })
  const [filters, setFilters] = useState({
    period: 'all',
    deliveryPartnerId: '',
    fromDate: '',
    toDate: ''
  })
  const [deliveryPartners, setDeliveryPartners] = useState([])
  const [selectedPartner, setSelectedPartner] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [txLoading, setTxLoading] = useState(false)
  const [txPagination, setTxPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 })

  // Fetch delivery partners for filter dropdown
  const fetchDeliveryPartners = useCallback(async () => {
    try {
      const response = await adminAPI.getDeliveryPartners({ limit: 1000 })
      if (response.data?.success) {
        setDeliveryPartners(response.data.data.deliveryPartners || [])
      }
    } catch (err) {
      debugError("Error fetching delivery partners:", err)
    }
  }, [])

  // Fetch earnings from API
  const fetchEarnings = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        period: filters.period,
        ...(filters.deliveryPartnerId && { deliveryPartnerId: filters.deliveryPartnerId }),
        ...(filters.fromDate && { fromDate: filters.fromDate }),
        ...(filters.toDate && { toDate: filters.toDate }),
        ...(searchQuery.trim() && { search: searchQuery.trim() })
      }

      const response = await adminAPI.getDeliveryEarnings(params)
      
      if (response.data?.success) {
        setEarnings(response.data.data.earnings || [])
        setSummary(response.data.data.summary || {})
        setPagination(response.data.data.pagination || pagination)
      } else {
        setError(response.data?.message || "Failed to fetch earnings")
        setEarnings([])
      }
    } catch (err) {
      debugError("Error fetching earnings:", err)
      const errorMessage = err.response?.data?.message || "Failed to fetch earnings. Please try again."
      setError(errorMessage)
      toast.error(errorMessage)
      setEarnings([])
    } finally {
      setLoading(false)
    }
  }, [pagination.page, pagination.limit, filters, searchQuery])

  // Fetch transactions for a selected partner
  const fetchTransactions = useCallback(async (partnerId, page = 1) => {
    try {
      setTxLoading(true)
      const params = {
        page,
        limit: txPagination.limit,
        deliveryPartnerId: partnerId,
        ...(filters.fromDate && { fromDate: filters.fromDate }),
        ...(filters.toDate && { toDate: filters.toDate }),
      }
      const response = await adminAPI.getDeliveryEarningTransactions(params)
      if (response.data?.success) {
        setTransactions(response.data.data.transactions || [])
        setTxPagination(response.data.data.pagination || txPagination)
      } else {
        setTransactions([])
      }
    } catch (err) {
      debugError("Error fetching transactions:", err)
      toast.error("Failed to load transactions")
    } finally {
      setTxLoading(false)
    }
  }, [filters, txPagination.limit])

  useEffect(() => {
    fetchDeliveryPartners()
  }, [fetchDeliveryPartners])

  useEffect(() => {
    fetchEarnings()
  }, [fetchEarnings])

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }))
  }

  const handleTxPageChange = (newPage) => {
    fetchTransactions(selectedPartner.deliveryPartnerId, newPage)
  }

  const viewTransactions = (partner) => {
    setSelectedPartner(partner)
    setTxPagination(prev => ({ ...prev, page: 1 }))
    fetchTransactions(partner.deliveryPartnerId, 1)
  }

  const handleExport = (format) => {
    if (earnings.length === 0) {
      toast.error("No data to export")
      return
    }

    let data = earnings
    if (selectedPartner && transactions.length > 0) {
      data = transactions
    }

    switch (format) {
      case "csv":
        const headers = selectedPartner 
          ? ["Date", "Source", "Reference ID", "Amount", "Status"]
          : ["Delivery Boy", "Phone", "Total Earnings", "Orders", "Today", "Week", "Month", "Lifetime"]
          
        let csvContent = headers.join(",") + "\n"
        
        data.forEach(item => {
          let row = []
          if (selectedPartner) {
            row = [
              `"${formatDate(item.date)}"`,
              `"${item.source}"`,
              `"${item.referenceId || ''}"`,
              item.amount,
              `"${item.status}"`
            ]
          } else {
            row = [
              `"${item.name || ''}"`,
              `"${item.phone || ''}"`,
              item.totalEarnings,
              item.totalCompletedOrders,
              item.todayEarnings,
              item.weeklyEarnings,
              item.monthlyEarnings,
              item.lifetimeEarnings
            ]
          }
          csvContent += row.join(",") + "\n"
        })

        const csvBlob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
        const csvLink = document.createElement("a")
        csvLink.href = URL.createObjectURL(csvBlob)
        csvLink.download = `earnings_${new Date().toISOString().split('T')[0]}.csv`
        csvLink.click()
        toast.success("CSV exported successfully")
        break
      case "json":
        const jsonContent = JSON.stringify(data, null, 2)
        const jsonBlob = new Blob([jsonContent], { type: "application/json" })
        const jsonLink = document.createElement("a")
        jsonLink.href = URL.createObjectURL(jsonBlob)
        jsonLink.download = `earnings_${new Date().toISOString().split('T')[0]}.json`
        jsonLink.click()
        toast.success("JSON exported successfully")
        break
      default:
        toast.error("Invalid format")
    }
  }

  if (loading && earnings.length === 0 && !selectedPartner) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen w-full max-w-full overflow-x-hidden flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-gray-600">Loading delivery earnings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen w-full max-w-full overflow-x-hidden relative">
      <div className="w-full mx-auto">
        {/* Page Header */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-600 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Delivery Earnings</h1>
                <p className="text-sm text-slate-600">View all delivery boy earnings and details</p>
              </div>
            </div>
            {selectedPartner && (
              <button 
                onClick={() => setSelectedPartner(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center gap-2"
              >
                <List className="w-4 h-4" />
                <span>Back to List</span>
              </button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        {!selectedPartner && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Total Delivery Boys</p>
                  <p className="text-2xl font-bold text-slate-900">{summary.totalDeliveryPartners || 0}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Total Earnings</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.totalEarnings || 0)}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Total Completed Orders</p>
                  <p className="text-2xl font-bold text-slate-900">{summary.totalOrders || 0}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        {!selectedPartner && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Period</label>
                <select
                  value={filters.period}
                  onChange={(e) => handleFilterChange('period', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Delivery Boy</label>
                <select
                  value={filters.deliveryPartnerId}
                  onChange={(e) => handleFilterChange('deliveryPartnerId', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Delivery Boys</option>
                  {deliveryPartners.map(dp => (
                    <option key={dp._id} value={dp._id}>{dp.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">From Date</label>
                <input
                  type="date"
                  value={filters.fromDate}
                  onChange={(e) => handleFilterChange('fromDate', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">To Date</label>
                <input
                  type="date"
                  value={filters.toDate}
                  onChange={(e) => handleFilterChange('toDate', e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Search and Export */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 w-full sm:w-auto">
              {!selectedPartner && (
                <>
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by name, phone, email..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setPagination(prev => ({ ...prev, page: 1 }))
                    }}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </>
              )}
              {selectedPartner && (
                <div className="flex items-center gap-3">
                  <div className="text-lg font-semibold text-slate-800">
                    Transactions for {selectedPartner.name} ({selectedPartner.deliveryId})
                  </div>
                </div>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  <span>Export</span>
                  <ChevronDown className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleExport("csv")}>
                  <FileText className="w-4 h-4 mr-2" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("json")}>
                  <Code className="w-4 h-4 mr-2" />
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Dynamic Table */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
          {error && !selectedPartner && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          <div className="overflow-x-auto">
            {selectedPartner ? (
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">SI</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Reference ID</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-700 uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {txLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" />
                      </td>
                    </tr>
                  ) : transactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <p className="text-lg font-semibold text-slate-700 mb-1">No Transactions Found</p>
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx, index) => (
                      <tr key={tx.transactionId || index} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {(txPagination.page - 1) * txPagination.limit + index + 1}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {formatDate(tx.date)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-700">
                          {tx.source}
                        </td>
                        <td className="px-4 py-3 text-sm text-blue-600">
                          {tx.referenceId || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-green-600 text-right">
                          {formatCurrency(tx.amount)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 capitalize">
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">SI</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Delivery Boy</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-700 uppercase">Today's Earn</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-700 uppercase">Weekly Earn</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-700 uppercase">Monthly Earn</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-700 uppercase">Total Earned</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase">Orders</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Last Earned</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {earnings.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <p className="text-lg font-semibold text-slate-700 mb-1">No Delivery Partners Found</p>
                          <p className="text-sm text-slate-500">No data matches your filters</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    earnings.map((earning, index) => (
                      <tr key={earning.deliveryPartnerId || index} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {(pagination.page - 1) * pagination.limit + index + 1}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-slate-900">{earning.name || 'N/A'}</div>
                          <div className="text-xs text-slate-500">{earning.phone}</div>
                          <div className="text-xs text-slate-400">{earning.deliveryId}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">
                          {formatCurrency(earning.todayEarnings)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">
                          {formatCurrency(earning.weeklyEarnings)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">
                          {formatCurrency(earning.monthlyEarnings)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-green-600">
                          {formatCurrency(earning.totalEarnings)}
                        </td>
                        <td className="px-4 py-3 text-sm text-center font-medium text-slate-700">
                          {earning.totalCompletedOrders}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {formatDate(earning.lastEarningDate)}
                        </td>
                        <td className="px-4 py-3 text-sm text-center">
                          <button
                            onClick={() => viewTransactions(earning)}
                            className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                          >
                            <Eye className="w-4 h-4 mr-1.5" />
                            Report
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {!selectedPartner && pagination.pages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
              <p className="text-sm text-slate-600">
                Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} partners
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="px-3 py-1 text-sm rounded border border-slate-300 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(5, pagination.pages) }).map((_, idx) => {
                  const pageNum = pagination.page <= 3 
                    ? idx + 1 
                    : pagination.page >= pagination.pages - 2 
                      ? pagination.pages - 4 + idx 
                      : pagination.page - 2 + idx
                  if (pageNum < 1 || pageNum > pagination.pages) return null
                  return (
                    <button
                      key={idx}
                      onClick={() => handlePageChange(pageNum)}
                      className={`px-3 py-1 text-sm rounded border ${
                        pagination.page === pageNum
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-slate-300 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
                })}
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.pages}
                  className="px-3 py-1 text-sm rounded border border-slate-300 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Tx Pagination */}
          {selectedPartner && txPagination.pages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
              <p className="text-sm text-slate-600">
                Showing {(txPagination.page - 1) * txPagination.limit + 1} to {Math.min(txPagination.page * txPagination.limit, txPagination.total)} of {txPagination.total} transactions
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTxPageChange(txPagination.page - 1)}
                  disabled={txPagination.page === 1}
                  className="px-3 py-1 text-sm rounded border border-slate-300 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(5, txPagination.pages) }).map((_, idx) => {
                  const pageNum = txPagination.page <= 3 
                    ? idx + 1 
                    : txPagination.page >= txPagination.pages - 2 
                      ? txPagination.pages - 4 + idx 
                      : txPagination.page - 2 + idx
                  if (pageNum < 1 || pageNum > txPagination.pages) return null
                  return (
                    <button
                      key={idx}
                      onClick={() => handleTxPageChange(pageNum)}
                      className={`px-3 py-1 text-sm rounded border ${
                        txPagination.page === pageNum
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-slate-300 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
                })}
                <button
                  onClick={() => handleTxPageChange(txPagination.page + 1)}
                  disabled={txPagination.page === txPagination.pages}
                  className="px-3 py-1 text-sm rounded border border-slate-300 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
