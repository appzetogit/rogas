import { useState, useMemo, useEffect } from "react"
import { Search, Download, ChevronDown, Settings, Building, ArrowUpDown, FileSpreadsheet, Code, Loader2 } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@food/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@food/components/ui/dialog"
import { exportTransactionsToExcel, exportTransactionsToPDF } from "@food/components/admin/transactions/transactionsExportUtils"
import { adminAPI } from "@food/api"
import { toast } from "sonner"

export default function VendorEarnings() {
  const [searchQuery, setSearchQuery] = useState("")
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState({
    si: true,
    vendorId: true,
    vendorName: true,
    ownerName: true,
    totalOrders: true,
    grossEarnings: true,
    commissionDeduction: true,
    netEarnings: true,
    totalWithdrawals: true,
    availableBalance: true,
  })

  useEffect(() => {
    fetchVendorEarnings()
  }, [])

  const fetchVendorEarnings = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getVendorEarningsList({ search: searchQuery || undefined })
      if (response.data?.success) {
        setVendors(response.data.data?.data || [])
      } else {
        toast.error('Failed to fetch vendor earnings')
      }
    } catch (error) {
      console.error('Error fetching vendor earnings:', error)
      toast.error('Failed to fetch vendor earnings')
    } finally {
      setLoading(false)
    }
  }

  // Refetch when search changes (with debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchVendorEarnings()
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Summaries
  const stats = useMemo(() => {
    let activeCount = vendors.length
    let totalGross = 0
    let totalCommission = 0
    let totalNet = 0
    let totalBalance = 0

    vendors.forEach(v => {
      totalGross += v.grossEarnings || 0
      totalCommission += v.commissionVatDeduction || 0
      totalNet += v.netEarnings || 0
      totalBalance += v.availableBalance || 0
    })

    return { activeCount, totalGross, totalCommission, totalNet, totalBalance }
  }, [vendors])

  const formatCurrency = (amount) => {
    return `₹${(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`
  }

  const handleExport = async (format) => {
    if (vendors.length === 0) {
      toast.error("No data to export.")
      return
    }
    const headers = [
      { key: "sl", label: "SI" },
      { key: "vendorIdString", label: "Vendor ID" },
      { key: "vendorName", label: "Vendor Name" },
      { key: "ownerName", label: "Owner Name" },
      { key: "totalOrders", label: "Total Orders" },
      { key: "grossEarnings", label: "Gross Earnings" },
      { key: "commissionDeduction", label: "Commission Deduction" },
      { key: "netEarnings", label: "Net Earnings" },
      { key: "totalWithdrawals", label: "Total Withdrawals" },
      { key: "availableBalance", label: "Available Balance" },
    ]
    const exportData = vendors.map((v, index) => ({
      sl: index + 1,
      vendorIdString: v.vendorIdString || 'N/A',
      vendorName: v.vendorName || 'N/A',
      ownerName: v.ownerName || 'N/A',
      totalOrders: v.totalOrders || 0,
      grossEarnings: formatCurrency(v.grossEarnings),
      commissionDeduction: formatCurrency(v.commissionVatDeduction),
      netEarnings: formatCurrency(v.netEarnings),
      totalWithdrawals: formatCurrency(v.totalWithdrawals),
      availableBalance: formatCurrency(v.availableBalance),
    }))

    switch (format) {
      case "excel":
        exportTransactionsToExcel(exportData, headers, "vendor_earnings_full_details")
        break
      case "pdf":
        await exportTransactionsToPDF(exportData, headers, "vendor_earnings_full_details", "Vendor Earnings Report")
        break
      default: break
    }
  }

  const toggleColumn = (key) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const resetColumns = () => {
    setVisibleColumns({
      si: true,
      vendorId: true,
      vendorName: true,
      ownerName: true,
      totalOrders: true,
      grossEarnings: true,
      commissionDeduction: true,
      netEarnings: true,
      totalWithdrawals: true,
      availableBalance: true,
    })
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Building className="w-6 h-6 text-emerald-600" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Vendor Earnings</h1>
              <p className="text-sm text-slate-500 mt-0.5">Track real-time earnings, commission deductions, and wallet balances for all approved vendors</p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Vendors</p>
            <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{stats.activeCount}</h3>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Gross Earnings</p>
            <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{formatCurrency(stats.totalGross)}</h3>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Commission Deducted</p>
            <h3 className="text-2xl font-extrabold text-rose-600 mt-1">{formatCurrency(stats.totalCommission)}</h3>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Net Vendor Share</p>
            <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">{formatCurrency(stats.totalNet)}</h3>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs bg-emerald-50/20">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Available Balance</p>
            <h3 className="text-2xl font-extrabold text-emerald-700 mt-1">{formatCurrency(stats.totalBalance)}</h3>
          </div>
        </div>

        {/* Table Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">Vendors List</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                {vendors.length}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1 sm:flex-initial min-w-[220px]">
                <input
                  type="text"
                  placeholder="Ex: search by Vendor name"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2 transition-all">
                    <Download className="w-4 h-4" />
                    <span>Export</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                  <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleExport("excel")} className="cursor-pointer flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4" /> Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("pdf")} className="cursor-pointer flex items-center gap-2">
                    <Code className="w-4 h-4" /> PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all flex items-center justify-center"
                title="Table Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="py-20 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-4" />
              <p className="text-slate-600">Loading vendor records...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {visibleColumns.si && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                      <div className="flex items-center gap-2">
                        <span>SI</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>}
                    {visibleColumns.vendorId && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Vendor ID</th>}
                    {visibleColumns.vendorName && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Vendor Name</th>}
                    {visibleColumns.ownerName && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Owner Details</th>}
                    {visibleColumns.totalOrders && <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Total Orders</th>}
                    {visibleColumns.grossEarnings && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Gross (₹)</th>}
                    {visibleColumns.commissionDeduction && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Commission (₹)</th>}
                    {visibleColumns.netEarnings && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Net Share (₹)</th>}
                    {visibleColumns.totalWithdrawals && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Withdrawn (₹)</th>}
                    {visibleColumns.availableBalance && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Wallet Balance (₹)</th>}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100 text-left">
                  {vendors.length === 0 ? (
                    <tr>
                      <td colSpan={Object.values(visibleColumns).filter(Boolean).length} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <Building className="w-16 h-16 text-slate-400 mb-4" />
                          <p className="text-lg font-semibold text-slate-700">No Vendors Found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    vendors.map((v, index) => (
                      <tr key={v.vendorId} className="hover:bg-slate-50 transition-colors">
                        {visibleColumns.si && <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{index + 1}</td>}
                        {visibleColumns.vendorId && <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-700">{v.vendorIdString}</td>}
                        {visibleColumns.vendorName && <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-800">{v.vendorName}</td>}
                        {visibleColumns.ownerName && <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-semibold text-slate-700">{v.ownerName}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{v.ownerPhone || 'N/A'}</div>
                        </td>}
                        {visibleColumns.totalOrders && <td className="px-6 py-4 text-center text-sm font-semibold text-slate-700">{v.totalOrders}</td>}
                        {visibleColumns.grossEarnings && <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatCurrency(v.grossEarnings)}</td>}
                        {visibleColumns.commissionDeduction && <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-rose-600">{formatCurrency(v.commissionVatDeduction)}</td>}
                        {visibleColumns.netEarnings && <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-emerald-600">{formatCurrency(v.netEarnings)}</td>}
                        {visibleColumns.totalWithdrawals && <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-700">{formatCurrency(v.totalWithdrawals)}</td>}
                        {visibleColumns.availableBalance && <td className="px-6 py-4 whitespace-nowrap text-sm font-extrabold text-emerald-700">{formatCurrency(v.availableBalance)}</td>}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Settings Dialog */}
        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <DialogContent className="max-w-md bg-white p-0">
            <DialogHeader className="px-6 pt-6 pb-4">
              <DialogTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Table Settings
              </DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-6 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Toggle Columns</h3>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(visibleColumns).map(([key, isVisible]) => (
                    <div key={key} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`toggle-${key}`}
                        checked={isVisible}
                        onChange={() => toggleColumn(key)}
                        className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                      />
                      <label htmlFor={`toggle-${key}`} className="ml-2 text-sm text-slate-700 capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter className="px-6 pb-6 flex justify-between">
              <button
                onClick={resetColumns}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
              >
                Reset Columns
              </button>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-md"
              >
                Apply
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
